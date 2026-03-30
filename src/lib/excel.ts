import ExcelJS from "exceljs";

export async function ParseXLSX(buffer: Buffer<ArrayBufferLike> | Uint8Array): Promise<any[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("NO_SHEET_FOUND");

    const headers: string[] = [];
    const rows: any[] = [];

    sheet.getRow(1).eachCell((cell, col) => {
        headers[col - 1] = String(cell.value).trim();
    });

    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const obj: any = {};
        headers.forEach((key, i) => {
            obj[key] = row.getCell(i + 1).value ?? null;
        });

        rows.push(obj);
    });

    return rows;
}
