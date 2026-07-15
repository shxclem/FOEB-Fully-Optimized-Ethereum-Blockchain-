import { assertValidAddress } from "../../assertions.js";
import { toRpcQuantity } from "../../conversion.js";
export async function setNonce(provider, address, nonce) {
    await assertValidAddress(address);
    const nonceHex = toRpcQuantity(nonce);
    await provider.request({
        method: "hardhat_setNonce",
        params: [address, nonceHex],
    });
}
//# sourceMappingURL=set-nonce.js.map