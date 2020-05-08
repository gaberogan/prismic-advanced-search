// allow esm syntax
const run = async () => {
    const module = chrome.extension.getURL('src/index.js')
    const app = await import(module)
    app.main()
}

run()