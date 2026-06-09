ALTER TABLE "newapi_portal"."users" ADD COLUMN "username" TEXT;

CREATE UNIQUE INDEX "users_username_key" ON "newapi_portal"."users"("username");

UPDATE "newapi_portal"."users"
SET "username" = split_part("email", '@', 1)
WHERE "username" IS NULL
  AND "email" LIKE '%@newapi.local'
  AND "email" NOT LIKE 'newapi-user-%@newapi.local';
