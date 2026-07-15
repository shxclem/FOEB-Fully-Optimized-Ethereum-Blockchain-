import type { Duration, NetworkHelpers, NumberLike } from "../../../../types.js";
import type { ChainType } from "hardhat/types/network";
import type { EthereumProvider } from "hardhat/types/providers";
export declare function increaseTo<ChainTypeT extends ChainType | string>(provider: EthereumProvider, networkHelpers: NetworkHelpers<ChainTypeT>, timestamp: NumberLike | Date, duration: Duration): Promise<void>;
//# sourceMappingURL=increase-to.d.ts.map