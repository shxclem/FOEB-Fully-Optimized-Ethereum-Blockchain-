import type { BalanceChangeOptions } from "../utils/balance.js";
import type { HardhatEthers } from "@nomicfoundation/hardhat-ethers/types";
import type { Addressable } from "ethers/address";
import type { TransactionResponse } from "ethers/providers";
export declare function supportChangeEtherBalances(Assertion: Chai.AssertionStatic, chaiUtils: Chai.ChaiUtils): void;
export declare function getBalanceChanges(ethers: HardhatEthers, transaction: TransactionResponse | Promise<TransactionResponse>, accounts: Array<Addressable | string>, options?: BalanceChangeOptions): Promise<bigint[]>;
//# sourceMappingURL=changeEtherBalances.d.ts.map