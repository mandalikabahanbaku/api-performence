import prisma from "../../../config/prisma.js";
import { CreateLoggingActivityDTO } from "./log.schema.js";

export async function CreateLogger(data: CreateLoggingActivityDTO) {
    await prisma.loggingActivity.create({
        data,
    });
}
