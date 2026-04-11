export const EXPORT_ROW_LIMIT = 5000;

export const PRODUCT_INCLUDE = {
    include: { product_type: true, size: true, unit: true },
} as const;

export function generateDocNumber(prefix: string, padLength = 4): string {
    const d = new Date();
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    return `${prefix}-${ym}-${Math.floor(Math.random() * 10 ** padLength)
        .toString()
        .padStart(padLength, "0")}`;
}

export function generateDocBarcode(prefix: string): string {
    return `${prefix}${Math.floor(Math.random() * 1_000_000_000_000)
        .toString()
        .padStart(12, "0")}`;
}
