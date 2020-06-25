import {
    html,
    ReactDOM,
    useState,
    useEffect,
    usePromise,
    useSyncStorage,
} from '/lib/react.js'
import { PrismicClient } from '/lib/prismic.js'
import { gql } from '/lib/graphql.js'
import moment from '/lib/moment.js'
import { SVG, saveSolid, timesCircleSolid } from '/lib/svg.js'
import Input from '/lib/ui/input.js'

const switchy = val => opts => opts[val]

const CUSTOM_TYPES_QUERY = gql`
query types {
    __schema {
        types {
            name
        }
    }
}
`;

const makeInputsQuery = types => gql`
query inputs {
    ${types.map(t => `
    ${t}: __type(name: "${t}") {
        inputFields {
            name
            type {
                name
            }
        }
    }
    `).join('\n')}
}
`

const makeSearchQuery = (types, variables) => gql`
query search {
    ${types.map(t => `
    ${t.type}(first: 50, where: ${objToGqlVar(fullTextIfNecessary(t, variables))}) {
        edges {
            node {
                ${t.summary ? `summary: ${t.summary}` : ''}
                _meta {
                    id
                    type
                    lastPublicationDate
                }
            }
        }
    }
    `).join('\n')}
}
`

const domLoaded = () => new Promise(resolve => {
    if (/complete|interactive|loaded/.test(document.readyState)) resolve()
    else document.addEventListener('DOMContentLoaded', resolve, false);
})

const wait = (ms) => new Promise(resolve => setTimeout(() => resolve(), ms))

const retryWhileFalsy = async (func, interval) => {
    let result
    while (!result) {
        result = await func()
        await wait(interval)
    }
    return result
}

const parseQuery = query => {
    const entries = query.split(',').map(kv => kv.split(':').map(s => s.trim()))
    return Object.fromEntries(entries)
}

const isValidQuery = query => query.includes(':')

const fullTextIfNecessary = (type, queryObj) => (
    Object.fromEntries(Object.entries(queryObj).map(([key, value]) => {
        const fullTextKey = key + '_fulltext'
        const hasNonFullText = type.inputFields.find(f => f.name === key)
        const hasFullText = type.inputFields.find(f => f.name === fullTextKey)
        const onlyHasFullText = !hasNonFullText && hasFullText
        return [onlyHasFullText ? fullTextKey : key, value]
    }))
)

const objToGqlVar = obj => JSON.stringify(obj).replace(/"([^"]+)":/g, '$1:')

const getQueryables = async () => {
    const typesResponse = await PrismicClient.query({ query: CUSTOM_TYPES_QUERY })
    const types = typesResponse.data.__schema.types.map(t => t.name).filter(s => s.startsWith('Where'))
    const inputsResponse = await PrismicClient.query({ query: makeInputsQuery(types) })
    // map response to [{
    //   type: allMy_docs,
    //   summary: some_field, <-- for showing a text preview
    //   inputFields: [{ name: some_field_fulltext, type: String }]
    // }, ...]
    return Object.entries(inputsResponse.data).map(entry => {
        const stringFieldNames = entry[1].inputFields.filter(f => f.type.name === 'String').map(f => f.name)
        const fulltextFieldNames = stringFieldNames.filter(f => f.endsWith('_fulltext')).map(f => f.slice(0, -9))
        return ({
            type: `all${entry[0].slice(5)}s`,
            summary: fulltextFieldNames[0] || stringFieldNames[0] || null,
            inputFields: entry[1].inputFields
                .map(f => ({ name: f.name, type: f.type.name }))
                .filter(f => f.type === 'String'), // filter out non-string types
        })
    })
}

const makeDocDOM = nodes => !nodes.length ? `
<div class="empty-state">
    <div class="empty-state__illustration empty-state__illustration--search"></div>
    <h2>No content matching this request</h2>
    <p> Try to search using other tags, types, authors or keyword.</p>
</div>
` : `
<div class="versions-wrapper">
<div class="versions-list">
    <table>
    <thead>
    <tr>
    <td class="list__item-icon">State</td>
    <td class="list__item-title">Name</td>
    <td class="list__item-translate"></td>
    <td class="list__item-mask">Type</td>
    <td class="list__item-lastupdate">Last update</td>
    <td class="list__item-author">Author</td>
    </tr>
    </thead>
    </table>
</div>
<div class="versions-list">
    <table>
        <tbody>
        ${nodes.map(n => `
            <tr class="list__item" href="/documents~b=working&c=unclassified/${n._meta.id}/">
                <td class="list__item-icon">
                    <span class="live">Live</span>
                </td>
                <td class="list__item-title">${switchy(typeof n.summary || 0)({
                    string: n.summary,
                    object: n.summary[0].text,
                    number: 'Document',
                })}</td>
                <td class="list__item-translate"></td>
                <td class="list__item-mask">${n._meta.type}</td>
                <td class="list__item-lastupdate">${moment(n._meta.lastPublicationDate).fromNow()}</td>
                <td class="list__item-author">
                    <span class="md-avatar tarracotta" data-letter="a"></span>
                </td>
            </tr>
        `)}
        </tbody>
    </table>
</div>
</div>
`

let originalSearch = null

const getReloadableEL = () => document.querySelector('#app>#viewport section#documents .items .reloadable')

const searchForDocs = async (queryables, query) => {
    // need the schema to make the search request
    if (!queryables) return

    // invalid query
    if (!isValidQuery(query)) return

    // dissect the query
    const variables = parseQuery(query)
    const keys = Object.keys(variables)

    // ONLY types that have all the query fields asked for (or the fulltext version)
    const types = queryables.filter(q => keys.every(k => q.inputFields.some(f => f.name === k || f.name === k + '_fulltext')))
    const notypes = !types.length

    // make request, transform response
    const searchResponse = notypes || await PrismicClient.query({ query: makeSearchQuery(types, variables) })
    const nodes = notypes ? [] : Object.values(searchResponse.data).map(t => t.edges.map(edge => edge.node)).flat()

    // inject results into DOM
    getReloadableEL().innerHTML = makeDocDOM(nodes)

    return true // it worked

    // TODO uid/slug search
    // TODO info icon (later)
    // TODO queryable slug & empty input when url changes (later)
    // TODO arrow thru autofill (later)
    // TODO handle error better (later)
}

const SearchBar = () => {
    const [query, setQuery] = useState('')
    const [placeholder, setPlaceholder] = useState('Advanced Search')
    const [namingQuery, setNamingQuery] = useState(false)
    const [lastQueried, setLastQueried] = useState('')
    const queryables = usePromise(getQueryables, [])
    const [savedQueries, setSavedQueries] = useSyncStorage('savedQueries', [])

    // Autofill
    const lastQuery = query.split(',').slice(-1)[0].trim()
    const autofillSuggestions = [...new Set(queryables
        .map(q => q.inputFields).flat().map(i => i.name.replace(/_fulltext$/, ''))
        .filter(i => i.includes(lastQuery)))]
    const showAutofill = Boolean(lastQuery && autofillSuggestions.length)
    const setAutofill = str => setQuery(query.split(',').slice(0, -1).concat(str + ':').join(','))

    // Search
    const search = async (q = query) => {
        const worked = await searchForDocs(queryables, q)
        if (worked) setLastQueried(q)
    }

    // Save new search
    const saveQuery = q => () => {
        if (!isValidQuery(query)) return
        setNamingQuery(true)
        setSavedQueries([q].concat(savedQueries))
    }

    // Name query
    const nameQuery = (i, name) => {
        setSavedQueries(savedQueries.map((q, idx) => i === idx ? { ...q, name } : q))
    }

    // Forget search
    const forgetQuery = i => e => {
        e.nativeEvent.stopImmediatePropagation()
        setSavedQueries(savedQueries.filter((_, idx) => i !== idx))
    }

    // Focus/select new search to name it
    useEffect(() => {
        if (!namingQuery) return
        const firstTag = document.querySelector('.advanced-search-tag input')
        firstTag.focus()
        firstTag.select()
    }, [namingQuery])

    // Search without need for keypress, save/restore original search
    useEffect(() => {
        if (!originalSearch) originalSearch = getReloadableEL().innerHTML
        if (!query) getReloadableEL().innerHTML = originalSearch
        if (query) search()
    }, [query])

    return html`
        <span class=advanced-search-bar>
            <span class=advanced-search-input-box>
                <input
                    class=advanced-search-input
                    type=text
                    value=${query}
                    onInput=${e => setQuery(e.target.value)}
                    placeholder=${placeholder}
                    onFocus=${() => setPlaceholder('first_name: Mark, last_name: Lee')}
                    onBlur=${() => setPlaceholder('Advanced Search')}
                />
                <${SVG}
                    src=${saveSolid}
                    class=advanced-search-save
                    onClick=${saveQuery({ name: 'New Search', value: query })}
                />
            </span>
            ${showAutofill && html`
                <span class=advanced-search-autofill>
                    ${autofillSuggestions.map(str => html`
                        <span onClick=${() => setAutofill(str)}>${str}</span>
                    `)}
                </span>
            `}
            ${savedQueries.map((q, i) => html`
                <span
                    class=${`advanced-search-tag ${q.value === lastQueried ? 'selected' : ''}`}
                    onClick=${() => search(q.value)}
                >
                    <${Input}
                        class="ast-name"
                        disabled=${!(i === 0 && namingQuery)}
                        value=${q.name}
                        onInput=${e => nameQuery(i, e.target.value)}
                        onBlur=${() => setNamingQuery(false)}
                    />
                    <${SVG}
                        src=${timesCircleSolid}
                        class=advanced-search-tag-close
                        onClick=${forgetQuery(i)}
                    />
                </span>
            `)}
        </span>
    `
}

export async function main() {
    await domLoaded
    const getControlsEl = () => document.querySelector('#app>#viewport section#documents .controls')
    const controlsEl = await retryWhileFalsy(getControlsEl, 100)
    const filtersEl = document.querySelector('#documents-filter-values')
    const root = document.createElement('div')
    controlsEl.insertBefore(root, filtersEl)
    ReactDOM.render(html`<${SearchBar} />`, root)
}