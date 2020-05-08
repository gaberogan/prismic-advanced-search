import { ApolloClient } from 'https://cdn.pika.dev/apollo-client@^2.6.8'
import { InMemoryCache } from 'https://cdn.pika.dev/apollo-cache-inmemory@^1.6.5'
import { PrismicLink } from '/lib/apollo-link-prismic.js'

export const PrismicClient = new ApolloClient({
  link: PrismicLink({ uri: `https://${window.location.host}/graphql` }),
  cache: new InMemoryCache(),
})