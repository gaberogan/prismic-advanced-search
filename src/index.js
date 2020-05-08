import { html, render, useState, usePromise, useEventListener } from '/lib/react.js'
import { PrismicClient } from '/lib/prismic.js'
import { gql } from '/lib/graphql.js'

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

const makeSearchQuery = (typeNames, variables) => gql`
query search {
    ${typeNames.map(t => `
    ${t}(where: ${objToGqlVar(variables)}) {
        edges {
            node {
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

const SearchBar = () => {
    const [query, setQuery] = useState('')

    const queryables = usePromise(async () => {
        const typesResponse = await PrismicClient.query({ query: CUSTOM_TYPES_QUERY })
        const types = typesResponse.data.__schema.types.map(t => t.name).filter(s => s.startsWith('Where'))
        const inputsResponse = await PrismicClient.query({ query: makeInputsQuery(types) })
        // map response to [{ type: allMy_docs, inputFields: [{ name: some_field_fulltext, type: String }] }]
        return Object.entries(inputsResponse.data).map(entry => ({
            type: `all${entry[0].slice(5)}s`,
            inputFields: entry[1].inputFields
                .map(f => ({ name: f.name, type: f.type.name }))
                .filter(i => i.type === 'String'), // filter out non-string types
        }))
    })

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
        const types = queryables.filter(q => keys.every(k => q.inputFields.some(i => i.name === k)))
        const typeNames = types.map(t => t.type)

        // make request, transform response
        const searchResponse = await PrismicClient.query({ query: makeSearchQuery(typeNames, variables) })
        const metas = Object.values(searchResponse.data).map(t => t.edges.map(edge => edge.node._meta)).flat()

        // inject results into DOM
        const tbody = document.querySelector('#app > #viewport section#documents .items .versions-list table tbody')
        tbody.innerHTML = metas.map(meta => `
        <tr class="list__item" href="/documents~b=working&c=unclassified/${meta.id}/">
            <td class="list__item-icon">
                <span class="live">Live</span>
            </td>
            <td class="list__item-title">TBD Title</td>
            <td class="list__item-translate"></td>
            <td class="list__item-mask">tbd_type</td>
            <td class="list__item-lastupdate">X minutes ago</td>
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