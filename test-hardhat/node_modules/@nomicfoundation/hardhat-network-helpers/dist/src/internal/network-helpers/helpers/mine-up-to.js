import { assertLargerThan } from "../../assertions.js";
import { toBigInt, toRpcQuantity } from "../../conversion.js";
export async function mineUpTo(provider, blockNumber, time) {
    const normalizedBlockNumber = await toBigInt(blockNumber);
    const latestHeight = await toBigInt(await time.latestBlock());
    assertLargerThan(normalizedBlockNumber, latestHeight);
    const blockParam = normalizedBlockNumber - latestHeight;
    await provider.request({
        method: "hardhat_mine",
        params: [toRpcQuantity(blockParam)],
    });
}
//# sourceMappingURL=mine-up-to.js.map