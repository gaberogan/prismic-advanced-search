import { html, render, useState, usePromise, useEventListener } from '/lib/react.js'
import { PrismicClient } from '/lib/prismic.js'
import { gql } from '/lib/graphql.js'
import moment from '/lib/moment.js'

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
    ${t.type}(where: ${objToGqlVar(variables)}) {
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
// TODO field_fulltext vs field (later)
// TODO don't paginate, just make it first 100 results each type (later)

const parseQuery = query => {
    const entries = query.split(',').map(kv => kv.split(':').map(s => s.trim()))
    return Object.fromEntries(entries)
}

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
        const stringFields = entry[1].inputFields.filter(f => f.type.name === 'String').map(f => f.name)
        const fulltextFields = stringFields.filter(f => f.endsWith('_fulltext')).map(f => f.slice(0, -9))
        return ({
            type: `all${entry[0].slice(5)}s`,
            summary: fulltextFields[0] || stringFields[0] || null,
            inputFields: entry[1].inputFields
                .map(f => ({ name: f.name, type: f.type.name }))
                .filter(f => f.type === 'String'), // filter out non-string types
        })
    })
}

const SearchBar = () => {
    const [query, setQuery] = useState('')
    const queryables = usePromise(getQueryables)

    useEventListener('keydown', async e => {
        // only on press enter while input focused
        if (e.keyCode !== 13) return
        const el =document.getElementById('advanced-search-input')
        if (el !== document.activeElement) return

        // need the schema to make the search request
        if (!queryables) return

        // dissect the query
        const variables = parseQuery(query)
        const keys = Object.keys(variables)

        // ONLY types that have all the query fields asked for
        const types = queryables.filter(q => keys.every(k => q.inputFields.some(f => f.name === k)))

        // make request, transform response
        const searchResponse = await PrismicClient.query({ query: makeSearchQuery(types, variables) })
        const nodes = Object.values(searchResponse.data).map(t => t.edges.map(edge => edge.node)).flat()

        // inject results into DOM
        const tbody = document.querySelector('#app > #viewport section#documents .items .versions-list table tbody')
        tbody.innerHTML = nodes.map(n => `
        <tr class="list__item" href="/documents~b=working&c=unclassified/${n._meta.id}/">
            <td class="list__item-icon">
                <span class="live">Live</span>
            </td>
            <td class="list__item-title">${n.summary || 'Document'}</td>
            <td class="list__item-translate"></td>
            <td class="list__item-mask">${n._meta.type}</td>
            <td class="list__item-lastupdate">${moment(n._meta.lastPublicationDate).fromNow()}</td>
            <td class="list__item-author">
                <span class="md-avatar tarracotta" data-letter="a"></span>
            </td>
        </tr>
        `)

        // TODO description/photo (later)
        // TODO since it doesn't reset, empty it when the url changes (later)
    })

    return html`
        <div>
            <input id="advanced-search-input" type=text value=${query} onInput=${e => setQuery(e.target.value)} />
        </div>
    `
}

export async function main() {
    const controls = document.querySelector('#app > #viewport section#documents .controls')
    const root = document.createElement('div')
    controls.appendChild(root)

    render(html`<${SearchBar} />`, root)
}