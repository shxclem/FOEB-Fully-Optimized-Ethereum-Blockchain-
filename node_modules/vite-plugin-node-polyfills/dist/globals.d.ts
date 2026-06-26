import { type BooleanOrBuildTarget, type BuildTarget } from './utils';
export declare type GlobalName = typeof globals[number];
export declare const globals: readonly ["buffer", "global", "process"];
export declare const getGlobalsToHandle: (options: {
    globals: {
        buffer: BooleanOrBuildTarget;
        process: BooleanOrBuildTarget;
        global: BooleanOrBuildTarget;
    };
    target: BuildTarget;
}) => GlobalName[];
