import { toBigInt, toRpcQuantity } from "../../../conversion.js";
export async function increaseTo(provider, networkHelpers, timestamp, duration) {
    const normalizedTimestamp = await toBigInt(timestamp instanceof Date
        ? duration.millis(timestamp.valueOf())
        : timestamp);
    await provider.request({
        method: "evm_setNextBlockTimestamp",
        params: [toRpcQuantity(normalizedTimestamp)],
    });
    await networkHelpers.mine();
}
//# sourceMappingURL=increase-to.js.map