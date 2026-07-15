import { toRpcQuantity } from "../../../conversion.js";
export async function setNextBlockTimestamp(provider, timestamp, duration) {
    const timestampRpc = toRpcQuantity(timestamp instanceof Date
        ? duration.millis(timestamp.valueOf())
        : timestamp);
    await provider.request({
        method: "evm_setNextBlockTimestamp",
        params: [timestampRpc],
    });
}
//# sourceMappingURL=set-next-block-timestamp.js.map