import type { Fixture, NetworkHelpers, Snapshot } from "../../../types.js";
import type { ChainType, NetworkConnection } from "hardhat/types/network";
export declare function loadFixture<T, ChainTypeT extends ChainType | string>(networkHelpers: NetworkHelpers<ChainTypeT>, fixture: Fixture<T, ChainTypeT>, snapshots: Array<Snapshot<T, ChainTypeT>>, connection: NetworkConnection<ChainTypeT>): Promise<{
    snapshots: Array<Snapshot<T, ChainTypeT>>;
    snapshotData: T;
}>;
//# sourceMappingURL=load-fixture.d.ts.map