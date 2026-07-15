import { assertValidAddress } from "../../assertions.js";
export async function stopImpersonatingAccount(provider, address) {
    await assertValidAddress(address);
    await provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [address],
    });
}
//# sourceMappingURL=stop-impersonating-account.js.map