-- Phase 5: drop legacy business tables and thin User auth columns.

DROP TABLE IF EXISTS "newapi_portal"."wallet_ledger";
DROP TABLE IF EXISTS "newapi_portal"."checkins";
DROP TABLE IF EXISTS "newapi_portal"."referrals";
DROP TABLE IF EXISTS "newapi_portal"."orders";

ALTER TABLE "newapi_portal"."users" DROP CONSTRAINT IF EXISTS "users_referred_by_user_id_fkey";
DROP INDEX IF EXISTS "newapi_portal"."users_referred_by_user_id_idx";
DROP INDEX IF EXISTS "newapi_portal"."users_invite_code_key";

ALTER TABLE "newapi_portal"."users" DROP COLUMN IF EXISTS "password_hash";
ALTER TABLE "newapi_portal"."users" DROP COLUMN IF EXISTS "invite_code";
ALTER TABLE "newapi_portal"."users" DROP COLUMN IF EXISTS "referred_by_user_id";

DROP TYPE IF EXISTS "newapi_portal"."CheckinStatus";
DROP TYPE IF EXISTS "newapi_portal"."ReferralStatus";
DROP TYPE IF EXISTS "newapi_portal"."OrderStatus";
DROP TYPE IF EXISTS "newapi_portal"."WalletLedgerType";
