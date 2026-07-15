import type { TypechainConfig } from "../types.js";
export declare function generateTypes(rootPath: string, config: TypechainConfig, noTypechain: boolean, artifactsPaths: string[]): Promise<void>;
/**
 * This function is exported solely for testing purposes.
 *
 * Modifies the content to ensure that all the wildcard imports include the
 * "/index.js" extension. For example:
 *
 * import type * as src from './src';
 * will be converted into:
 * import type * as src from './src/index.js';
 *
 * However, imports like:
 * import * from "npmPackage";
 * will not be converted, as the import path does not start with a ".".
 */
export declare function addJsExtensionsIfNeeded(content: string): string;
//# sourceMappingURL=generate-types.d.ts.map