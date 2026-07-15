import { assertValidAddress } from "../../assertions.js";
import { toRpcQuantity } from "../../conversion.js";
export async function setBalance(provider, address, balance) {
    await assertValidAddress(address);
    const balanceHex = toRpcQuantity(balance);
    await provider.request({
        method: "hardhat_setBalance",
        params: [address, balanceHex],
    });
}
//# sourceMappingURL=set-balance.js.map