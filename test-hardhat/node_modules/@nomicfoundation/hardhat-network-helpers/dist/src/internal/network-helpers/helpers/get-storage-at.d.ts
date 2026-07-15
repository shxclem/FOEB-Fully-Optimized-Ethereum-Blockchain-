import type { BlockTag, NumberLike } from "../../../types.js";
import type { EthereumProvider } from "hardhat/types/providers";
export declare function getStorageAt(provider: EthereumProvider, address: string, index: NumberLike, block?: NumberLike | BlockTag): Promise<string>;
//# sourceMappingURL=get-storage-at.d.ts.map