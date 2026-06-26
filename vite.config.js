import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default {
    build: {
        minify: false
    },
    plugins: [
        nodePolyfills()
    ]
}