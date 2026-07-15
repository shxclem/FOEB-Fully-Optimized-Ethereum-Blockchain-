import { assertHardhatInvariant } from "@nomicfoundation/hardhat-errors";
export async function latest(provider) {
    const latestBlock = await provider.request({
        method: "eth_getBlockByNumber",
        params: ["latest", false],
    });
    assertHardhatInvariant(typeof latestBlock === "object" &&
        latestBlock !== null &&
        "timestamp" in latestBlock &&
        typeof latestBlock.timestamp === "string", "latestBlock should have a timestamp");
    return parseInt(latestBlock.timestamp, 16);
}
//# sourceMappingURL=latest.js.map