import { HardhatError } from "@nomicfoundation/hardhat-errors";
export async function loadFixture(networkHelpers, fixture, snapshots, connection) {
    if (fixture.name === "") {
        throw new HardhatError(HardhatError.ERRORS.NETWORK_HELPERS.GENERAL.FIXTURE_ANONYMOUS_FUNCTION_ERROR);
    }
    const snapshot = snapshots.find((s) => s.fixture === fixture);
    if (snapshot !== undefined) {
        try {
            await snapshot.restorer.restore();
            snapshots = snapshots.filter((s) => Number(s.restorer.snapshotId) <= Number(snapshot.restorer.snapshotId));
        }
        catch (e) {
            if (HardhatError.isHardhatError(e) &&
                e.number ===
                    HardhatError.ERRORS.NETWORK_HELPERS.GENERAL.INVALID_SNAPSHOT.number) {
                throw new HardhatError(HardhatError.ERRORS.NETWORK_HELPERS.GENERAL.FIXTURE_SNAPSHOT_ERROR);
            }
            throw e;
        }
        return {
            snapshots,
            snapshotData: snapshot.data,
        };
    }
    else {
        const data = await fixture(connection);
        const restorer = await networkHelpers.takeSnapshot();
        snapshots.push({
            restorer,
            fixture,
            data,
        });
        return {
            snapshots,
            snapshotData: data,
        };
    }
}
//# sourceMappingURL=load-fixture.js.map