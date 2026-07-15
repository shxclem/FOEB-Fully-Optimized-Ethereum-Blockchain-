import type { BlockTag, Fixture, NetworkHelpers as NetworkHelpersI, NumberLike, SnapshotRestorer } from "../../types.js";
import type { ChainType, NetworkConnection } from "hardhat/types/network";
import { Time } from "./time/time.js";
export declare class NetworkHelpers<ChainTypeT extends ChainType | string> implements NetworkHelpersI<ChainTypeT> {
    #private;
    time: Time<ChainTypeT>;
    constructor(connection: NetworkConnection<ChainTypeT>);
    clearSnapshots(): void;
    dropTransaction(txHash: string): Promise<boolean>;
    getStorageAt(address: string, index: NumberLike, block?: NumberLike | BlockTag): Promise<string>;
    impersonateAccount(address: string): Promise<void>;
    loadFixture<T>(fixture: Fixture<T, ChainTypeT>): Promise<T>;
    mine(blocks?: NumberLike, options?: {
        interval?: NumberLike;
    }): Promise<void>;
    mineUpTo(blockNumber: NumberLike): Promise<void>;
    setBalance(address: string, balance: NumberLike): Promise<void>;
    setBlockGasLimit(blockGasLimit: NumberLike): Promise<void>;
    setCode(address: string, code: string): Promise<void>;
    setCoinbase(address: string): Promise<void>;
    setNextBlockBaseFeePerGas(baseFeePerGas: NumberLike): Promise<void>;
    setNonce(address: string, nonce: NumberLike): Promise<void>;
    setPrevRandao(prevRandao: NumberLike): Promise<void>;
    setStorageAt(address: string, index: NumberLike, value: NumberLike): Promise<void>;
    stopImpersonatingAccount(address: string): Promise<void>;
    takeSnapshot(): Promise<SnapshotRestorer>;
    throwIfNotDevelopmentNetwork(): Promise<void>;
}
//# sourceMappingURL=network-helpers.d.ts.map