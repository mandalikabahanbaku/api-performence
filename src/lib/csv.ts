import { parse } from "csv-parse/sync";

export function ParseCSV(buffer: Buffer): any[] {
    const content = buffer.toString("utf8");
    const delimiter = content.includes(";") && !content.includes(",") ? ";" : ",";

    return parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        delimiter,
        relax_column_count: true,
    });
}
