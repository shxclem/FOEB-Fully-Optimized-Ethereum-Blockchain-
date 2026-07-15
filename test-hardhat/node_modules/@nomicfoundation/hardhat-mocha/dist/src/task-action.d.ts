import type { NewTaskActionFunction } from "hardhat/types/tasks";
interface TestActionArguments {
    testFiles: string[];
    bail: boolean;
    grep?: string;
    noCompile: boolean;
}
declare const testWithHardhat: NewTaskActionFunction<TestActionArguments>;
export default testWithHardhat;
//# sourceMappingURL=task-action.d.ts.map