import { assertHardhatInvariant } from "@nomicfoundation/hardhat-errors";
import { assertTxHash } from "../../assertions.js";
export async function dropTransaction(provider, txHash) {
    assertTxHash(txHash);
    const success = await provider.request({
        method: "hardhat_dropTransaction",
        params: [txHash],
    });
    assertHardhatInvariant(success === true || success === false, "The value should be either true or false");
    return success;
}
//# sourceMappingURL=drop-transaction.js.map