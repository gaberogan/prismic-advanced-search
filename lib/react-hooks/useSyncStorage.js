import { useState, useEffect } from '/lib/react.js';

export function useSyncStorage(key, defaultValue){
    const [state, setState] = useState(defaultValue)
    useEffect(() => chrome.storage.sync.get(key, res => setState(res[key] || defaultValue)), [])

    const setStorage = val => {
        setState(val)
        chrome.storage.sync.set({ [key]: val })
    }

    return [state, setStorage]
}