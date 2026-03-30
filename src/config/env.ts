import { config } from "dotenv";
import { bool, cleanEnv, makeValidator, num, port, str, url } from "envalid";
const envPath = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
config({ path: envPath });

// Validator kustom untuk array string
const array = makeValidator<string[]>((x) => {
    if (!x) return [];
    return x.split(",").map((item) => item.trim());
});

// Validator kustom untuk number dengan default
const numWithDefault = (defaultValue: number) => num({ default: defaultValue });
export const env = cleanEnv(process.env, {
    // APP
    NODE_ENV: str({ default: "production", desc: "Environment" }),
    APP_NAME: str({ default: "Eveterinary" }),
    BASE_URL: url({ default: "http://localhost" }),
    PORT: port({ default: 3000 }),
    HOSTNAME: str({ default: "localhost" }),

    // Database
    DATABASE_URL: str(),

    // Log
    LOG_LEVEL: str({
        choices: ["error", "warn", "info", "http", "verbose", "debug", "silly"],
        default: "info",
    }),

    // REDIS
    REDIS_HOST: str({}),
    REDIS_PORT: port({}),
    REDIS_PASSWORD: str(),
    REDIS_DB: num({ default: 0 }),

    // SESSION
    SESSION_COOKIE_NAME: str({}),
    SESSION_TTL: num({}),

    // CSRF
    CSRF_COOKIE_NAME: str({}),
    CSRF_HEADER_NAME: str({}),

    // CORS
    CORS_ORIGINS: array({ default: [] }),
    CORS_METHODS: array({ default: ["GET", "POST", "PUT", "DELETE", "PATCH"] }),
    CORS_ALLOWED_HEADERS: array({ default: ["Content-Type", "Authorization"] }),
    CORS_EXPOSED_HEADERS: array({ default: ["Content-Length"] }),
    CORS_MAX_AGE: numWithDefault(86400), // Default 1 hari

    // RATE
    RATE_VIOLATION: num({ default: 3 }),

    // EMAIL VERIFICATION AUTH
    EMAIL_VERIFICATION: bool({ default: false }),

    // BCRPTY
    SALT_ROUND: num(),

    // Google API
    GOOGLE_SERVICE_ACCOUNT_EMAIL: str(),
    GOOGLE_PRIVATE_KEY: str(),
    GOOGLE_SHEET_ID: str(),
    SHEET_FORECAST: str(),
});

export const corsConfig = {
    origins: env.CORS_ORIGINS,
    methods: env.CORS_METHODS,
    allowedHeaders: env.CORS_ALLOWED_HEADERS,
    exposedHeaders: env.CORS_EXPOSED_HEADERS,
    maxAge: env.CORS_MAX_AGE,
};
