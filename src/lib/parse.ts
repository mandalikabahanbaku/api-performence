// lib/parse-file.ts

import { ParseCSV } from "./csv.js";
import { ParseXLSX } from "./excel.js";

export async function ParseFileByName(buffer: Buffer, filename: string): Promise<any[]> {
    if (filename.endsWith(".csv")) return ParseCSV(buffer);
    if (filename.endsWith(".xlsx")) return ParseXLSX(buffer);

    throw new Error("UNSUPPORTED_FILE_EXTENSION");
}
