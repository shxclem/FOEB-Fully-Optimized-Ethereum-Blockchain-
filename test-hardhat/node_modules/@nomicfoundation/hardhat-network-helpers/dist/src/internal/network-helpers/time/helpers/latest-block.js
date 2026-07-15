import { assertHardhatInvariant } from "@nomicfoundation/hardhat-errors";
export async function latestBlock(provider) {
    const height = await provider.request({
        method: "eth_blockNumber",
        params: [],
    });
    assertHardhatInvariant(typeof height === "string", "height should be a string");
    return parseInt(height, 16);
}
//# sourceMappingURL=latest-block.js.map