import { nodePolyfills } from "vite-plugin-node-polyfills";

export default {
  build: {
    minify: false
  },

  esbuild: {
    minifyIdentifiers: false
  },

  base: "/tfg-ethereum-sharding",

  optimizeDeps: {
    exclude: ["@paulmillr/trusted-setups"]
  },

  plugins: [
    nodePolyfills()
  ]
};