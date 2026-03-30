export type CleanOptions = {
    emptyStringToNull?: boolean;
    trimStrings?: boolean;
    removeEmptyRows?: boolean;
    removeEmptyColumns?: boolean;
    defaultValueForEmpty?: any; // default: null
};

export class SheetDataCleaner {
    static clean(data: any[][], options: CleanOptions = {}): any[][] {
        const {
            emptyStringToNull = true,
            trimStrings = true,
            removeEmptyRows = false,
            removeEmptyColumns = false,
            defaultValueForEmpty = null,
        } = options;

        let cleanedData = [...data];

        // Clean individual cells
        cleanedData = cleanedData.map((row) =>
            row.map((cell) => {
                let value = cell;

                // Trim strings
                if (trimStrings && typeof value === "string") {
                    value = value.trim();
                }

                // Convert empty string to null/default
                if (emptyStringToNull && value === "") {
                    return defaultValueForEmpty;
                }

                // Convert whitespace-only strings
                if (emptyStringToNull && typeof value === "string" && value.trim() === "") {
                    return defaultValueForEmpty;
                }

                return value;
            })
        );

        // Remove completely empty rows
        if (removeEmptyRows) {
            cleanedData = cleanedData.filter((row) =>
                row.some(
                    (cell) =>
                        cell !== defaultValueForEmpty &&
                        cell !== "" &&
                        cell !== null &&
                        cell !== undefined
                )
            );
        }

        // Remove completely empty columns (lebih kompleks)
        if (removeEmptyColumns && cleanedData.length > 0) {
            const columnCount = Math.max(...cleanedData.map((row) => row.length));
            const columnsToKeep: number[] = [];

            for (let col = 0; col < columnCount; col++) {
                const columnHasData = cleanedData.some((row) => {
                    const cell = row[col];
                    return (
                        cell !== defaultValueForEmpty &&
                        cell !== "" &&
                        cell !== null &&
                        cell !== undefined
                    );
                });

                if (columnHasData) {
                    columnsToKeep.push(col);
                }
            }

            cleanedData = cleanedData.map((row) =>
                columnsToKeep.map((colIndex) => row[colIndex] || defaultValueForEmpty)
            );
        }

        return cleanedData;
    }

    /**
     * Transform data untuk Prisma/DB (converting empty to null)
     */
    static forDatabase(data: any[][], headers?: string[]): Record<string, any>[] {
        const cleanedData = this.clean(data, {
            emptyStringToNull: true,
            trimStrings: true,
            removeEmptyRows: true,
        });

        // Jika ada headers, konversi ke object
        if (headers && cleanedData.length > 0) {
            // Skip header row jika data pertama adalah header
            const startIndex = headers.length > 0 ? 0 : 1;
            const rows = cleanedData.slice(startIndex);

            return rows.map((row) => {
                const obj: Record<string, any> = {};

                headers.forEach((header, index) => {
                    obj[header] = row[index] || null;
                });

                return obj;
            });
        }

        return cleanedData;
    }
}
