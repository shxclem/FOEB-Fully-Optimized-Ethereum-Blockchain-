import { toRpcQuantity } from "../../conversion.js";
export async function mine(provider, blocks = 1, options = { interval: 1 }) {
    const blocksHex = toRpcQuantity(blocks);
    const intervalHex = toRpcQuantity(options.interval ?? 1);
    await provider.request({
        method: "hardhat_mine",
        params: [blocksHex, intervalHex],
    });
}
//# sourceMappingURL=mine.js.map