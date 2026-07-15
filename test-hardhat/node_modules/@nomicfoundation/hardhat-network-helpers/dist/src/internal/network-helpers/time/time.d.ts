import type { NumberLike, Time as TimeI } from "../../../types.js";
import type { NetworkHelpers } from "../network-helpers.js";
import type { ChainType } from "hardhat/types/network";
import type { EthereumProvider } from "hardhat/types/providers";
import { Duration } from "../duration/duration.js";
export declare class Time<ChainTypeT extends ChainType | string> implements TimeI {
    #private;
    readonly duration: Duration;
    constructor(networkHelpers: NetworkHelpers<ChainTypeT>, provider: EthereumProvider);
    increase(amountInSeconds: NumberLike): Promise<number>;
    increaseTo(timestamp: NumberLike | Date): Promise<void>;
    latest(): Promise<number>;
    latestBlock(): Promise<number>;
    setNextBlockTimestamp(timestamp: NumberLike | Date): Promise<void>;
}
//# sourceMappingURL=time.d.ts.map