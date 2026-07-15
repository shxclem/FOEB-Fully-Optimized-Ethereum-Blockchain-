import { toRpcQuantity } from "../../conversion.js";
export async function setBlockGasLimit(provider, blockGasLimit) {
    const blockGasLimitHex = toRpcQuantity(blockGasLimit);
    await provider.request({
        method: "evm_setBlockGasLimit",
        params: [blockGasLimitHex],
    });
}
//# sourceMappingURL=set-block-gas-limit.js.map