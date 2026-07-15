import { assertHardhatInvariant } from "@nomicfoundation/hardhat-errors";
import { assertValidAddress } from "../../assertions.js";
import { toRpcQuantity } from "../../conversion.js";
import { toPaddedRpcQuantity } from "../../padding.js";
export async function getStorageAt(provider, address, index, block = "latest") {
    await assertValidAddress(address);
    const indexParam = toPaddedRpcQuantity(index, 32);
    const blockParam = block === "latest" || block === "earliest" || block === "pending"
        ? block
        : toRpcQuantity(block);
    const data = await provider.request({
        method: "eth_getStorageAt",
        params: [address, indexParam, blockParam],
    });
    assertHardhatInvariant(typeof data === "string", "Storage data should be a string");
    return data;
}
//# sourceMappingURL=get-storage-at.js.map