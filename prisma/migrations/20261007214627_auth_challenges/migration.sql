-- CreateTable
CREATE TABLE "auth_challenges" (
    "id" UUID NOT NULL,
    "nonce" VARCHAR(96) NOT NULL,
    "family" "WalletFamily" NOT NULL,
    "address" VARCHAR(64) NOT NULL,
    "message" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_challenges_nonce_key" ON "auth_challenges"("nonce");

-- CreateIndex
CREATE INDEX "auth_challenges_family_address_idx" ON "auth_challenges"("family", "address");
