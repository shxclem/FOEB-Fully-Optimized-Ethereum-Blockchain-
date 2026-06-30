import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default {
    // Vite configuration options
    build: {
        minify: false
    },
    plugins: [
        nodePolyfills({
            // kzg-wasm checks `typeof process !== 'undefined'` to decide whether
            // it's running in Node.js. If we polyfill `process` globally, kzg-wasm
            // wrongly thinks it's in Node and tries to fs.readFileSync() the .wasm
            // file, which fails in the browser with "The URL must be of scheme file".
            // We still need Buffer polyfilled for eth-crypto, so we keep that on,
            // but we disable the global `process` shim.
            globals: {
                process: false,
                Buffer: true,
                global: true,
            },
        })
    ]
}