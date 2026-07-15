import { toPaddedRpcQuantity } from "../../padding.js";
export async function setPrevRandao(provider, prevRandao) {
    const paddedPrevRandao = toPaddedRpcQuantity(prevRandao, 32);
    await provider.request({
        method: "hardhat_setPrevRandao",
        params: [paddedPrevRandao],
    });
}
//# sourceMappingURL=set-prev-randao.js.map