import { useRef, useEffect, useState, html } from '/lib/react.js';

export default props => {
	const span = useRef()
	const input = useRef()
	const [width, setWidth] = useState(0)

	useEffect(() => {
		setTimeout(() => setWidth(span.current.scrollWidth), 0); // scrollWidth not correct otherwise
	}, [props.value])

	const spanStyle = {
		visibility: 'hidden',
		position: 'fixed',
		pointerEvents: 'none',
		whiteSpace: 'pre',
	}

	return html`
		<span>
			<span
				...${props}
				ref=${span}
				style=${{ ...(props.style || {}), ...spanStyle }}
			>
				${props.value || ''}
			</span>
			<input
				...${props}
				ref=${input}
				style=${{ ...(props.style || {}), width: width + 'px', whiteSpace: 'pre' }}
			/>
		</span>
	`
}