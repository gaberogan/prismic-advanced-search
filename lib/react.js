import { createElement } from 'https://unpkg.com/es-react'
import htm from 'https://cdn.pika.dev/htm@^3.0.2'

// React lib
export * from 'https://unpkg.com/es-react'

// html`` is the new JSX
export const html = htm.bind(createElement)

// Other hooks
export * from '/lib/react-hooks/useEventListener.js'
export * from '/lib/react-hooks/usePromise.js'
export * from '/lib/react-hooks/useSyncStorage.js'