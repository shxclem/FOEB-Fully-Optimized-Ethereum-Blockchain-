import type { HardhatEthers } from "@nomicfoundation/hardhat-ethers/types";
import type { Addressable, BaseContract, BaseContractMethod, BigNumberish, ContractTransactionResponse } from "ethers";
import type { TransactionResponse } from "ethers/providers";
export type Token = BaseContract & {
    balanceOf: BaseContractMethod<[string], bigint, bigint>;
    name: BaseContractMethod<[], string, string>;
    transfer: BaseContractMethod<[
        string,
        BigNumberish
    ], boolean, ContractTransactionResponse>;
    symbol: BaseContractMethod<[], string, string>;
};
export declare function supportChangeTokenBalance(Assertion: Chai.AssertionStatic, chaiUtils: Chai.ChaiUtils): void;
export declare function getBalanceChange(ethers: HardhatEthers, transaction: TransactionResponse | Promise<TransactionResponse>, token: Token, account: Addressable | string): Promise<bigint>;
export declare function clearTokenDescriptionsCache(): void;
//# sourceMappingURL=changeTokenBalance.d.ts.map