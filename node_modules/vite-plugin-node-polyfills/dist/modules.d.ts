export declare type ModuleName = typeof modules[number];
export declare type ModuleNameWithNodePrefix = `node:${ModuleName}`;
export declare const modules: readonly ["_stream_duplex", "_stream_passthrough", "_stream_readable", "_stream_transform", "_stream_writable", "assert", "buffer", "child_process", "cluster", "console", "constants", "crypto", "dgram", "dns", "domain", "events", "fs", "http", "http2", "https", "module", "net", "os", "path", "process", "punycode", "querystring", "readline", "repl", "stream", "string_decoder", "sys", "timers", "timers/promises", "tls", "tty", "url", "util", "vm", "zlib"];
export declare const getModulesToPolyfill: ({ modulesToExclude, modulesToInclude, }: {
    modulesToExclude: ModuleName[];
    modulesToInclude: ModuleName[];
}) => ModuleName[];
export declare const isModuleName: (name: string) => name is "assert" | "buffer" | "child_process" | "cluster" | "console" | "constants" | "crypto" | "dgram" | "dns" | "domain" | "events" | "fs" | "http" | "https" | "http2" | "module" | "net" | "os" | "path" | "punycode" | "process" | "querystring" | "readline" | "repl" | "stream" | "_stream_duplex" | "_stream_passthrough" | "_stream_readable" | "_stream_transform" | "_stream_writable" | "string_decoder" | "sys" | "timers/promises" | "timers" | "tls" | "tty" | "url" | "util" | "vm" | "zlib";
