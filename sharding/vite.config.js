import { nodePolyfills } from "vite-plugin-node-polyfills";

export default {
    // config options
    build: {
        minify: false
    },
    esbuild: {
        minifyIdentifiers: false
    },
    base: "/tfg-ethereum-sharding",
    plugins: [
        nodePolyfills()
    ]
  }