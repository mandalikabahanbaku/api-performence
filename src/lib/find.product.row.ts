export function FindProductRow(sheet: any[][], productCode: string, rowPlus = 0): number {
    for (let i = 2; i < sheet.length; i++) {
        if ((sheet[i] || [])[1] === productCode) {
            return i + rowPlus;
        }
    }
    return -1;
}
