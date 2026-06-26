import { type Plugin } from 'vite';
import { type ModuleName } from './modules';
export declare const buildTrailingSlashNormalizer: ({ modules, protocolImports, }: {
    modules: ModuleName[];
    protocolImports: boolean;
}) => Plugin[];
