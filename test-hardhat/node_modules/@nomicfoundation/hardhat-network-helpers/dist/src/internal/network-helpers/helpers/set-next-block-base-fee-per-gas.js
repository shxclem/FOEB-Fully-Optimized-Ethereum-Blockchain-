import { toRpcQuantity } from "../../conversion.js";
export async function setNextBlockBaseFeePerGas(provider, baseFeePerGas) {
    const baseFeePerGasHex = toRpcQuantity(baseFeePerGas);
    await provider.request({
        method: "hardhat_setNextBlockBaseFeePerGas",
        params: [baseFeePerGasHex],
    });
}
//# sourceMappingURL=set-next-block-base-fee-per-gas.js.map