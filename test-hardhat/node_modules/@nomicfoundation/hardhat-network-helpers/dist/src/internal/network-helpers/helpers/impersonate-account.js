import { assertValidAddress } from "../../assertions.js";
export async function impersonateAccount(provider, address) {
    await assertValidAddress(address);
    await provider.request({
        method: "hardhat_impersonateAccount",
        params: [address],
    });
}
//# sourceMappingURL=impersonate-account.js.map