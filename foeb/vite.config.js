import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default {
    // Vite configuration options
    build: {
        minify: false
    },
    plugins: [
        nodePolyfills()
    ]
}