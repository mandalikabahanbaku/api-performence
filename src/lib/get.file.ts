import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
export const MAX_ROWS = 5000;
export const BATCH_SIZE = 25;
export const ALLOWED_FILE_TYPES = [
    "text/csv",
    "application/vnd.ms-excel",
    "application/csv",
    "text/x-csv",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function GetUploadedFile(c: Context): Promise<{
    buffer: Buffer;
    filename: string;
    mimetype: string;
}> {
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file) {
        throw new HTTPException(400, { message: "FILE_NOT_FOUND" });
    }

    if (!(file instanceof File)) {
        throw new HTTPException(400, { message: "INVALID_FILE_TYPE" });
    }

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        throw new HTTPException(400, {
            message: `Invalid file type. Allowed: ${ALLOWED_FILE_TYPES.join(", ")}`,
        });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        throw new HTTPException(400, {
            message: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
        });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    return { buffer, filename, mimetype: file.type };
}
