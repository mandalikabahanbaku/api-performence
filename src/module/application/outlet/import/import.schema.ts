export type OutletImportPreviewDTO = {
    code: string;
    name: string;
    supply_by_1: string | null;
    supply_by_2: string | null;
    store_type: "RETAIL" | "MARKETPLACE";
    is_active: boolean;
    errors: string[];
};

export type ResponseOutletImportDTO = {
    import_id: string;
    total: number;
    valid: number;
    invalid: number;
};
