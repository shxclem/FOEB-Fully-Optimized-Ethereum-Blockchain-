import { assertValidAddress } from "../../assertions.js";
import { toRpcQuantity } from "../../conversion.js";
import { toPaddedRpcQuantity } from "../../padding.js";
export async function setStorageAt(provider, address, index, value) {
    await assertValidAddress(address);
    const indexParam = toRpcQuantity(index);
    const codeParam = toPaddedRpcQuantity(value, 32);
    await provider.request({
        method: "hardhat_setStorageAt",
        params: [address, indexParam, codeParam],
    });
}
//# sourceMappingURL=set-storage-at.js.map