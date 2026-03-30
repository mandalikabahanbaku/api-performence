import { env } from "../config/env.js";
import winston from "winston";

const isDev = env.isDevelopment;

const baseFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true })
);

const devFormat = winston.format.combine(
    baseFormat,
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, label, ...meta }) => {
        let output = `${timestamp} ${level}`;

        if (label) output += ` [${label}]`;
        output += `: ${message}`;

        if (Object.keys(meta).length) {
            output += `\n${JSON.stringify(meta, null, 2)}`;
        }

        return `\n\n==== INIT ====\n${output} \n==== END ====`;
    })
);

const prodFormat = winston.format.combine(baseFormat, winston.format.json());

export const logger = winston.createLogger({
    level: env.LOG_LEVEL ?? "info",
    format: isDev ? devFormat : prodFormat,
    transports: [new winston.transports.Console()],
    exceptionHandlers: [new winston.transports.File({ filename: "logs/exceptions.log" })],
    rejectionHandlers: [new winston.transports.File({ filename: "logs/rejections.log" })],
});

/**
 * Child logger khusus database
 */
export const dbLogger = logger.child({ label: "DATABASE" });
