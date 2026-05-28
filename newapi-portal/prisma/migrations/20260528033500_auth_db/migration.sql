-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "newapi_portal";

-- CreateEnum
CREATE TYPE "newapi_portal"."OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "newapi_portal"."WalletLedgerType" AS ENUM ('CREDIT', 'DEBIT', 'HOLD', 'RELEASE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "newapi_portal"."CheckinStatus" AS ENUM ('CLAIMED', 'REVERSED');

-- CreateEnum
CREATE TYPE "newapi_portal"."ReferralStatus" AS ENUM ('PENDING', 'REWARDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "newapi_portal"."AuditActorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "newapi_portal"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "invite_code" TEXT NOT NULL,
    "newapi_user_id" TEXT,
    "newapi_access_token_ciphertext" TEXT,
    "newapi_access_token_key_id" TEXT,
    "newapi_access_token_updated_at" TIMESTAMP(3),
    "referred_by_user_id" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newapi_portal"."sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newapi_portal"."checkins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "checked_in_on" DATE NOT NULL,
    "status" "newapi_portal"."CheckinStatus" NOT NULL DEFAULT 'CLAIMED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newapi_portal"."referrals" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "referred_user_id" TEXT NOT NULL,
    "invite_code_used" TEXT NOT NULL,
    "status" "newapi_portal"."ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "rewarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newapi_portal"."orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "newapi_portal"."OrderStatus" NOT NULL DEFAULT 'PENDING',
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "product_code" TEXT,
    "quota_amount" INTEGER,
    "idempotency_key" TEXT,
    "provider" TEXT,
    "provider_trade_no" TEXT,
    "paid_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newapi_portal"."wallet_ledger" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "newapi_portal"."WalletLedgerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER,
    "reason" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "order_id" TEXT,
    "referral_id" TEXT,
    "checkin_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newapi_portal"."audit_logs" (
    "id" TEXT NOT NULL,
    "actor_type" "newapi_portal"."AuditActorType" NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "newapi_portal"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_invite_code_key" ON "newapi_portal"."users"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_newapi_user_id_key" ON "newapi_portal"."users"("newapi_user_id");

-- CreateIndex
CREATE INDEX "users_referred_by_user_id_idx" ON "newapi_portal"."users"("referred_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "newapi_portal"."sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "newapi_portal"."sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "newapi_portal"."sessions"("expires_at");

-- CreateIndex
CREATE INDEX "checkins_checked_in_on_idx" ON "newapi_portal"."checkins"("checked_in_on");

-- CreateIndex
CREATE UNIQUE INDEX "checkins_user_id_checked_in_on_key" ON "newapi_portal"."checkins"("user_id", "checked_in_on");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referred_user_id_key" ON "newapi_portal"."referrals"("referred_user_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_idx" ON "newapi_portal"."referrals"("referrer_id");

-- CreateIndex
CREATE INDEX "referrals_invite_code_used_idx" ON "newapi_portal"."referrals"("invite_code_used");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "newapi_portal"."orders"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "orders_provider_trade_no_key" ON "newapi_portal"."orders"("provider_trade_no");

-- CreateIndex
CREATE INDEX "orders_user_id_status_idx" ON "newapi_portal"."orders"("user_id", "status");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "newapi_portal"."orders"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_ledger_idempotency_key_key" ON "newapi_portal"."wallet_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_ledger_user_id_created_at_idx" ON "newapi_portal"."wallet_ledger"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_ledger_order_id_idx" ON "newapi_portal"."wallet_ledger"("order_id");

-- CreateIndex
CREATE INDEX "wallet_ledger_referral_id_idx" ON "newapi_portal"."wallet_ledger"("referral_id");

-- CreateIndex
CREATE INDEX "wallet_ledger_checkin_id_idx" ON "newapi_portal"."wallet_ledger"("checkin_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "newapi_portal"."audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "newapi_portal"."audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "newapi_portal"."audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "newapi_portal"."users" ADD CONSTRAINT "users_referred_by_user_id_fkey" FOREIGN KEY ("referred_by_user_id") REFERENCES "newapi_portal"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newapi_portal"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "newapi_portal"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newapi_portal"."checkins" ADD CONSTRAINT "checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "newapi_portal"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newapi_portal"."referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "newapi_portal"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newapi_portal"."referrals" ADD CONSTRAINT "referrals_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "newapi_portal"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newapi_portal"."orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "newapi_portal"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newapi_portal"."wallet_ledger" ADD CONSTRAINT "wallet_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "newapi_portal"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newapi_portal"."wallet_ledger" ADD CONSTRAINT "wallet_ledger_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "newapi_portal"."orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newapi_portal"."wallet_ledger" ADD CONSTRAINT "wallet_ledger_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "newapi_portal"."referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newapi_portal"."wallet_ledger" ADD CONSTRAINT "wallet_ledger_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "newapi_portal"."checkins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newapi_portal"."audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "newapi_portal"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
