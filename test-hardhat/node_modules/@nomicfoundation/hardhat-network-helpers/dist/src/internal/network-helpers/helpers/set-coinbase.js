import { assertValidAddress } from "../../assertions.js";
export async function setCoinbase(provider, address) {
    await assertValidAddress(address);
    await provider.request({
        method: "hardhat_setCoinbase",
        params: [address],
    });
}
//# sourceMappingURL=set-coinbase.js.map