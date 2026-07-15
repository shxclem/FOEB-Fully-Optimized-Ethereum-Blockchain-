import { assertValidAddress, assertHexString } from "../../assertions.js";
export async function setCode(provider, address, code) {
    await assertValidAddress(address);
    assertHexString(code);
    await provider.request({
        method: "hardhat_setCode",
        params: [address, code],
    });
}
//# sourceMappingURL=set-code.js.map