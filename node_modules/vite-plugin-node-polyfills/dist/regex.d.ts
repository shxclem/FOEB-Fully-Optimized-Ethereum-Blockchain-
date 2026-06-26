export declare const any: (patterns: readonly string[]) => string;
export declare const compose: (patterns: readonly string[]) => RegExp;
export declare const group: (pattern: string) => string;
export declare const join: (patterns: readonly string[]) => string;
export declare const optional: (pattern: string) => string;
export declare const when: (condition: boolean, pattern: string, fallback?: string) => string;
