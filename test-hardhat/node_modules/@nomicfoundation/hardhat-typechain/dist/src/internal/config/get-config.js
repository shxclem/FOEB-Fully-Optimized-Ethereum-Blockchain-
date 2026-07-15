import { DEFAULT_CONFIG } from "./default.js";
export function getConfig(userConfig) {
    return {
        ...DEFAULT_CONFIG,
        ...userConfig,
    };
}
//# sourceMappingURL=get-config.js.map