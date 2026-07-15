import { validateUserConfigZodType } from "@nomicfoundation/hardhat-zod-utils";
import { z } from "zod";
const typechainUserConfigSchema = z
    .object({
    outDir: z
        .string({
        message: "It should be an absolute path specifying where to store the generated types",
    })
        .optional(),
    alwaysGenerateOverloads: z.boolean().optional(),
    dontOverrideCompile: z.boolean().optional(),
    discriminateTypes: z.boolean().optional(),
    tsNocheck: z.boolean().optional(),
})
    .optional();
export async function validateTypechainUserConfig(userConfig) {
    return validateUserConfigZodType(userConfig.typechain, typechainUserConfigSchema);
}
//# sourceMappingURL=validation.js.map