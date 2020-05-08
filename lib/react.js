import { h } from 'https://cdn.pika.dev/preact@^10.3.0'
import htm from 'https://cdn.pika.dev/htm@^3.0.2'

// Preact lib
export * from 'https://cdn.pika.dev/preact@^10.3.0'

// html`` is the new JSX
export const html = htm.bind(h)

// Default hooks
export * from 'https://cdn.pika.dev/preact@^10.3.0/hooks'

// Other hooks
export * from '/lib/react-hooks/useEventListener.js'
export * from '/lib/react-hooks/usePromise.js'