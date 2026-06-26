import { createRequire as R } from "node:module";
import z from "@rollup/plugin-inject";
import E from "node-stdlib-browser";
import { handleCircularDependancyWarning as N } from "node-stdlib-browser/helpers/rollup/plugin";
import k from "node-stdlib-browser/helpers/esbuild/plugin";
const q = [
  "_stream_duplex",
  "_stream_passthrough",
  "_stream_readable",
  "_stream_transform",
  "_stream_writable",
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "timers/promises",
  "tls",
  "tty",
  "url",
  "util",
  "vm",
  "zlib"
], D = ({
  modulesToExclude: l,
  modulesToInclude: e
}) => q.filter((t) => e.length > 0 ? e.includes(t) : !l.includes(t)), $ = (l, e) => j(l) === j(e), y = {
  buffer: [
    "import __buffer_polyfill from 'vite-plugin-node-polyfills/shims/buffer'",
    "globalThis.Buffer = globalThis.Buffer || __buffer_polyfill"
  ],
  global: [
    "import __global_polyfill from 'vite-plugin-node-polyfills/shims/global'",
    "globalThis.global = globalThis.global || __global_polyfill"
  ],
  process: [
    "import __process_polyfill from 'vite-plugin-node-polyfills/shims/process'",
    "globalThis.process = globalThis.process || __process_polyfill"
  ]
}, s = (l, e) => l ? l === !0 ? !0 : l === e : !1, M = (l) => l.startsWith("node:"), V = (l) => {
  const e = l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${e}$`);
}, j = (l) => l.replace(/^node:/, ""), W = [
  "buffer",
  "global",
  "process"
], _ = (l) => P(l.join("|")), A = (l) => {
  const e = l.join("");
  return new RegExp(`^${e}$`);
}, P = (l) => `(?:${l})`, O = (l) => l.join(""), C = (l) => `${P(l)}?`, F = (l, e, t = "") => l ? e : t, L = ({
  modules: l,
  protocolImports: e
}) => {
  const t = A([
    _([
      O([
        F(
          e,
          C("node:")
        ),
        _(l)
      ]),
      O([
        "vite-plugin-node-polyfills/shims/",
        _(W)
      ])
    ]),
    "/"
  ]);
  return [
    {
      // Vite v8.0.0+ does not support trailing slashes on package subpaths.
      name: "vite-plugin-node-polyfills:trailing-slash-normalizer",
      enforce: "pre",
      resolveId: {
        // @ts-expect-error This property is only supported in Vite v6.3.0+, so
        // we must run the check inside the handler to maintain compatibility
        // with older Vite versions.
        filter: { id: t },
        async handler(i, g, b) {
          if (!t.test(i))
            return;
          const n = i.replace(/\/$/, "");
          return this.resolve(n, g, {
            ...b,
            skipSelf: !0
          });
        }
      }
    }
  ];
}, X = (l = {}) => {
  const e = {
    include: [],
    exclude: [],
    overrides: {},
    protocolImports: !0,
    ...l,
    globals: {
      Buffer: !0,
      global: !0,
      process: !0,
      ...l.globals
    }
  }, t = D({
    modulesToExclude: e.exclude,
    modulesToInclude: e.include
  }), i = L({
    modules: t,
    protocolImports: e.protocolImports
  }), g = (o) => e.include.length > 0 ? !e.include.some((r) => $(o, r)) : e.exclude.some((r) => $(o, r)), b = (o) => {
    if (s(e.globals.Buffer, "dev") && /^buffer$/.test(o))
      return "vite-plugin-node-polyfills/shims/buffer";
    if (s(e.globals.global, "dev") && /^global$/.test(o))
      return "vite-plugin-node-polyfills/shims/global";
    if (s(e.globals.process, "dev") && /^process$/.test(o))
      return "vite-plugin-node-polyfills/shims/process";
    if (o in e.overrides)
      return e.overrides[o];
  }, n = Object.entries(E).reduce((o, [r, a]) => (!e.protocolImports && M(r) || g(r) || (o[r] = b(j(r)) || a), o), {}), m = R(import.meta.url), h = [
    ...s(e.globals.Buffer, "dev") ? [m.resolve("vite-plugin-node-polyfills/shims/buffer")] : [],
    ...s(e.globals.global, "dev") ? [m.resolve("vite-plugin-node-polyfills/shims/global")] : [],
    ...s(e.globals.process, "dev") ? [m.resolve("vite-plugin-node-polyfills/shims/process")] : []
  ], x = [
    ...s(e.globals.Buffer, "dev") ? y.buffer : [],
    ...s(e.globals.global, "dev") ? y.global : [],
    ...s(e.globals.process, "dev") ? y.process : [],
    ""
  ].join(`
`);
  let u;
  function B(o, r, a) {
    if (u === void 0)
      throw new Error("transform called before inject plugin initialization");
    if (u !== !1)
      return u.transform.call(this, o, r, a);
  }
  const w = {
    name: "vite-plugin-node-polyfills:inject",
    enforce: "post",
    transform: B
  };
  return [
    i,
    w,
    {
      name: "vite-plugin-node-polyfills",
      config(o, r) {
        const a = r.command === "build", p = r.command === "serve", v = !!this?.meta?.rolldownVersion, S = a && v, T = {
          ...p && s(e.globals.Buffer, "dev") ? { Buffer: "Buffer" } : {},
          ...p && s(e.globals.global, "dev") ? { global: "global" } : {},
          ...p && s(e.globals.process, "dev") ? { process: "process" } : {}
        }, f = {
          // https://github.com/niksy/node-stdlib-browser/blob/3e7cd7f3d115ac5c4593b550e7d8c4a82a0d4ac4/README.md#vite
          ...s(e.globals.Buffer, "build") ? { Buffer: "vite-plugin-node-polyfills/shims/buffer" } : {},
          ...s(e.globals.global, "build") ? { global: "vite-plugin-node-polyfills/shims/global" } : {},
          ...s(e.globals.process, "build") ? { process: "vite-plugin-node-polyfills/shims/process" } : {}
        };
        return u = Object.keys(f).length > 0 && !S ? z(f) : !1, u === !1 ? delete w.transform : B.filter = {
          code: new RegExp(Object.keys(f).join("|"))
        }, {
          build: {
            rollupOptions: {
              onwarn: (c, d) => {
                N(c, () => {
                  if (o.build?.rollupOptions?.onwarn)
                    return o.build.rollupOptions.onwarn(c, d);
                  d(c);
                });
              },
              ...Object.keys(f).length > 0 && v ? { transform: { inject: f } } : {}
            }
          },
          optimizeDeps: {
            exclude: [
              ...h
            ],
            ...v ? {
              rolldownOptions: {
                resolve: {
                  // https://github.com/niksy/node-stdlib-browser/blob/3e7cd7f3d115ac5c4593b550e7d8c4a82a0d4ac4/README.md?plain=1#L150
                  alias: {
                    ...n
                  }
                },
                transform: {
                  define: T
                },
                plugins: [
                  i,
                  {
                    name: "vite-plugin-node-polyfills:optimizer",
                    banner: p ? x : void 0
                  }
                ]
              }
            } : {
              esbuildOptions: {
                banner: p ? { js: x } : void 0,
                define: T,
                inject: [
                  ...h
                ],
                plugins: [
                  k(n),
                  // Supress the 'injected path "..." cannot be marked as external' error in Vite 4 (emitted by esbuild).
                  // https://github.com/evanw/esbuild/blob/edede3c49ad6adddc6ea5b3c78c6ea7507e03020/internal/bundler/bundler.go#L1469
                  {
                    name: "vite-plugin-node-polyfills-shims-resolver",
                    setup(c) {
                      for (const d of h) {
                        const I = V(d);
                        c.onResolve({ filter: I }, () => ({
                          // https://github.com/evanw/esbuild/blob/edede3c49ad6adddc6ea5b3c78c6ea7507e03020/internal/bundler/bundler.go#L1468
                          external: !1,
                          path: d
                        }));
                      }
                    }
                  }
                ]
              }
            }
          },
          resolve: {
            // https://github.com/niksy/node-stdlib-browser/blob/3e7cd7f3d115ac5c4593b550e7d8c4a82a0d4ac4/README.md?plain=1#L150
            alias: {
              ...n
            }
          }
        };
      }
    }
  ].flat();
};
export {
  X as nodePolyfills
};
//# sourceMappingURL=index.js.map
