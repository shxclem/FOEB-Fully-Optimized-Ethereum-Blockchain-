import { Typed } from "ethers";
export function tryDereference(value, type) {
    try {
        return Typed.dereference(value, type);
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=typed.js.map