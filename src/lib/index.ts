import * as crypto from "crypto";
import slugify from "slugify";
export const normalizeSlug = (v: string) => slugify.default(v, { lower: true, strict: true });

export const generateHexToken = (): string => {
    return crypto.randomBytes(32).toString("hex");
};
