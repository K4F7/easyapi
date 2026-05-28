import { z } from "zod";

const quotaSchema = z.coerce.number().int().nonnegative();

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL URL"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  APP_URL: z.string().url("APP_URL must be a valid URL"),
  NEWAPI_BASE_URL: z.string().url("NEWAPI_BASE_URL must be a valid URL"),
  NEWAPI_ADMIN_TOKEN: z.string().min(1, "NEWAPI_ADMIN_TOKEN is required"),
  NEWAPI_ADMIN_USER_ID: z.string().min(1, "NEWAPI_ADMIN_USER_ID is required"),
  REGISTER_QUOTA: quotaSchema,
  CHECKIN_QUOTA: quotaSchema,
  INVITE_REWARD_QUOTA: quotaSchema,
});

const authSecretSchema = serverEnvSchema.shape.AUTH_SECRET;
const newApiBaseUrlSchema = serverEnvSchema.shape.NEWAPI_BASE_URL;
const newApiAdminEnvSchema = serverEnvSchema.pick({
  NEWAPI_ADMIN_TOKEN: true,
  NEWAPI_ADMIN_USER_ID: true,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid server environment. ${details}`);
  }

  return parsed.data;
}

export function getAuthSecret(): string {
  return parseEnvValue("AUTH_SECRET", authSecretSchema);
}

export function getNewApiBaseUrl(): string {
  return parseEnvValue("NEWAPI_BASE_URL", newApiBaseUrlSchema);
}

export function getNewApiAdminEnv(): Pick<
  ServerEnv,
  "NEWAPI_ADMIN_TOKEN" | "NEWAPI_ADMIN_USER_ID"
> {
  const parsed = newApiAdminEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(`Invalid server environment. ${formatZodIssues(parsed.error)}`);
  }

  return parsed.data;
}

function parseEnvValue<T>(
  key: string,
  schema: z.ZodType<T>,
): T {
  const parsed = schema.safeParse(process.env[key]);

  if (!parsed.success) {
    throw new Error(`Invalid server environment. ${formatZodIssues(parsed.error, key)}`);
  }

  return parsed.data;
}

function formatZodIssues(error: z.ZodError, prefix?: string): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      const key = prefix && !path ? prefix : [prefix, path].filter(Boolean).join(".");

      return `${key}: ${issue.message}`;
    })
    .join("; ");
}

export const plannedServerEnvKeys = serverEnvSchema.keyof().options;
