import type { NumberLike } from "../../../types.js";
import type { Time } from "../time/time.js";
import type { ChainType } from "hardhat/types/network";
import type { EthereumProvider } from "hardhat/types/providers";
export declare function mineUpTo<ChainTypeT extends ChainType | string>(provider: EthereumProvider, blockNumber: NumberLike, time: Time<ChainTypeT>): Promise<void>;
//# sourceMappingURL=mine-up-to.d.ts.map