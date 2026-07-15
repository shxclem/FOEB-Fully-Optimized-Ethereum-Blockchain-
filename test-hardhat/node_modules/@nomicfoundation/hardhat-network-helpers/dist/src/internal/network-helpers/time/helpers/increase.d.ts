import type { NetworkHelpers, NumberLike } from "../../../../types.js";
import type { ChainType } from "hardhat/types/network";
import type { EthereumProvider } from "hardhat/types/providers";
export declare function increase<ChainTypeT extends ChainType | string>(provider: EthereumProvider, networkHelpers: NetworkHelpers<ChainTypeT>, amountInSeconds: NumberLike): Promise<number>;
//# sourceMappingURL=increase.d.ts.map