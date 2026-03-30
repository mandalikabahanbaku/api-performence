import { LogActivities } from "../../../generated/prisma/enums.js";
import z from "zod";

export const LoggingActivitySchema = z.object({
    email: z.email(),
    activity: z.enum(LogActivities),
    description: z.string(),
});

export const ResponseLoggingActivitySchema = LoggingActivitySchema.extend({
    id: z.number(),
    created_at: z.date(),
});

export type CreateLoggingActivityDTO = z.infer<typeof LoggingActivitySchema>;
export type ResponseLoggingActivityDTO = z.infer<typeof ResponseLoggingActivitySchema>;
