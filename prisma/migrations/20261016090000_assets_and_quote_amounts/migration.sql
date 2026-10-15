-- Nothing may assume one chain or one currency: assets become explicit, each
-- launch says which asset it is sold for, and columns named after the native
-- currency are renamed after the quote asset. Every step keeps the data:
-- columns are renamed, never dropped and created again.

-- 1. Assets
CREATE TYPE "AssetKind" AS ENUM ('native', 'crypto', 'stablecoin', 'stock', 'rwa');

CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "chain_key" VARCHAR(32) NOT NULL,
    "address" VARCHAR(64) NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "decimals" INTEGER NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "issuer" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "assets_chain_key_address_key" ON "assets"("chain_key", "address");

-- Every launch indexed so far was sold for the native currency of an EVM test
-- chain (ETH, 18 decimals). The API corrects the symbol, name and decimals of
-- each native currency from its configuration when it starts.
INSERT INTO "assets" ("id", "chain_key", "address", "symbol", "name", "decimals", "kind", "updated_at")
SELECT gen_random_uuid(), c."chain_key", 'native', 'ETH', 'Ether', 18, 'native', now()
  FROM (SELECT DISTINCT "chain_key" FROM "launches") AS c;

-- 2. The quote asset and token decimals of each launch
ALTER TABLE "launches" ADD COLUMN "quote_asset_id" UUID;
UPDATE "launches" AS l
   SET "quote_asset_id" = a."id"
  FROM "assets" AS a
 WHERE a."chain_key" = l."chain_key" AND a."address" = 'native';
ALTER TABLE "launches" ALTER COLUMN "quote_asset_id" SET NOT NULL;
ALTER TABLE "launches" ADD CONSTRAINT "launches_quote_asset_id_fkey" FOREIGN KEY ("quote_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "launches" ADD COLUMN "token_decimals" INTEGER NOT NULL DEFAULT 18;

-- 3. Amounts are in the quote asset, whatever it is
ALTER TABLE "launches" RENAME COLUMN "liquidity_native" TO "liquidity_quote";
ALTER TABLE "launches" RENAME COLUMN "creator_native" TO "creator_quote";
ALTER TABLE "launches" RENAME COLUMN "vesting_released_native" TO "vesting_released_quote";
ALTER TABLE "notifications" RENAME COLUMN "native_amount" TO "quote_amount";
