import stdLibBrowser from 'node-stdlib-browser';
import { type Plugin } from 'vite';
export declare type BuildTarget = 'build' | 'dev';
export declare type BooleanOrBuildTarget = boolean | BuildTarget;
export declare type ModuleName = keyof typeof stdLibBrowser;
export declare type ModuleNameWithoutNodePrefix<T = ModuleName> = T extends `node:${infer P}` ? P : never;
export declare type TransformHook = Extract<Plugin['transform'], Function>;
export declare const compareModuleNames: (moduleA: ModuleName, moduleB: ModuleName) => boolean;
export declare const globalShimBanners: {
    buffer: string[];
    global: string[];
    process: string[];
};
export declare const isEnabled: (value: BooleanOrBuildTarget, target: BuildTarget) => boolean;
export declare const isModuleName: (name: string) => name is "node:assert" | "node:buffer" | "node:child_process" | "node:cluster" | "node:console" | "node:constants" | "node:crypto" | "node:dgram" | "node:dns" | "node:domain" | "node:events" | "node:fs" | "node:http" | "node:https" | "node:http2" | "node:module" | "node:net" | "node:os" | "node:path" | "node:punycode" | "node:process" | "node:querystring" | "node:readline" | "node:repl" | "node:stream" | "node:_stream_duplex" | "node:_stream_passthrough" | "node:_stream_readable" | "node:_stream_transform" | "node:_stream_writable" | "node:string_decoder" | "node:sys" | "node:timers/promises" | "node:timers" | "node:tls" | "node:tty" | "node:url" | "node:util" | "node:vm" | "node:zlib" | "assert" | "buffer" | "child_process" | "cluster" | "console" | "constants" | "crypto" | "dgram" | "dns" | "domain" | "events" | "fs" | "http" | "https" | "http2" | "module" | "net" | "os" | "path" | "punycode" | "process" | "querystring" | "readline" | "repl" | "stream" | "_stream_duplex" | "_stream_passthrough" | "_stream_readable" | "_stream_transform" | "_stream_writable" | "string_decoder" | "sys" | "timers/promises" | "timers" | "tls" | "tty" | "url" | "util" | "vm" | "zlib";
export declare const isNodeProtocolImport: (name: string) => boolean;
export declare const toRegExp: (text: string) => RegExp;
export declare const withoutNodeProtocol: (name: ModuleName) => ModuleNameWithoutNodePrefix;
