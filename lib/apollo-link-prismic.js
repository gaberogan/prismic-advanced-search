import { HttpLink } from 'https://cdn.pika.dev/apollo-link-http@^1.5.16';
import { setContext } from 'https://cdn.pika.dev/apollo-link-context@^1.0.19';

const PRISMIC_ENDPOINT_REG = /^https?:\/\/([^.]+)\.(?:cdn\.)?(wroom\.(?:test|io)|prismic\.io)\/graphql\/?/;

function parsePrismicEndpoint(endpoint) {
  const tokens = endpoint.match(PRISMIC_ENDPOINT_REG);

  if (tokens !== null && Array.isArray(tokens) && tokens.length === 3) {
    const [/* endpoint */, repository, domain] = tokens;

    return `https://${repository}.cdn.${domain}`; // enforce the cdn
  }

  return null; // not from prismic ? returns null.
}

export function PrismicLink({ uri, accessToken, repositoryName, ...options }) {

  const prismicEndpoint = parsePrismicEndpoint(uri); // enforce cdn if it's the prismic endpoint

  if (prismicEndpoint && repositoryName) {
    console.warn('\`repositoryName\` is ignored since the graphql endpoint is valid.');
  }

  if (!prismicEndpoint && !repositoryName) {
    throw Error('Since you are using a custom GraphQL endpoint, you need to provide to PrismicLink your repository name as shown below:\n' +
      'PrismicLink({\n' +
      '  uri: \'https://mycustomdomain.com/graphql\',\n' +
      '  accessToken: \'my_access_token\', // could be undefined\n' +
      '  repositoryName: \'my-prismic-repository\'\n' +
      '})\n'
    );
  }

  let apiEndpoint;
  let gqlEndpoint;

  if (prismicEndpoint) {
    apiEndpoint = `${prismicEndpoint}/api`;
    gqlEndpoint = `${prismicEndpoint}/graphql`;
  } else {
    apiEndpoint = `https://${repositoryName}.cdn.prismic.io/api`;
    gqlEndpoint = uri;
  }

  // TODO enable access token
  const apiInfo = fetch(apiEndpoint).then(r => r.json());

  const prismicLink = setContext(
    (request, previousContext) => {
      return apiInfo
        .then(
          (api) => ({
            headers: {
              'Prismic-ref': api.refs.find(r => r.isMasterRef).ref,
              ...previousContext.headers,
              ...(api.integrationFieldRef ? { 'Prismic-integration-field-ref' : api.integrationFieldRef } : {}),
              ...(accessToken ? { Authorization: `Token ${accessToken}` } : {})
            }
          })
        );
    });

  const httpLink = new HttpLink({
    uri: gqlEndpoint,
    useGETForQueries: true,
    fetch: (url, options) => {
      const trimmed = removeWhiteSpace(url);
      return fetch(trimmed, options)
    },
    ...options
  });

  return prismicLink.concat(httpLink);
}

export default {
  PrismicLink
};

// Lib

function removeWhiteSpace(str) {
    const regexp = /(%0A|%20)*(%20|%7B|%7D)(%0A|%20)*/g

    const [path, query] = str.split('?');
    if(!query) return str;

    const shortQuery = query.split('&').map((param) => {
        const [name, value] = param.split('=');
        if (name === 'query') {
            return name + '=' + value.replace(regexp, (chars, spaces, brackets) => brackets);
        }
        return param;
    }).join('&');

    return [path, shortQuery].join('?');
}