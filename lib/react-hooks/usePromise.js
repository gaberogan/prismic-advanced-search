import { useState, useEffect } from '/lib/react.js';

export function usePromise(func, defaultValue){
    const [state, setState] = useState(defaultValue)
    useEffect(() => func().then(setState), [])
    return state
}