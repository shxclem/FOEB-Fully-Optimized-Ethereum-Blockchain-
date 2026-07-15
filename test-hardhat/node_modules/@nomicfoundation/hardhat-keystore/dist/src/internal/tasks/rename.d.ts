import type { KeystoreConsoleLog, KeystoreLoader, KeystoreRequestSecretInput } from "../types.js";
import type { NewTaskActionFunction } from "hardhat/types/tasks";
interface TaskRenameArguments {
    dev: boolean;
    force: boolean;
    oldKey: string;
    newKey: string;
}
declare const taskRename: NewTaskActionFunction<TaskRenameArguments>;
export declare const rename: ({ dev, force, oldKey, newKey }: TaskRenameArguments, keystoreLoader: KeystoreLoader, requestSecretInput: KeystoreRequestSecretInput, consoleLog?: KeystoreConsoleLog) => Promise<void>;
export default taskRename;
//# sourceMappingURL=rename.d.ts.map