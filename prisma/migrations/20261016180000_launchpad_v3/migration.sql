-- Launchpad v3: launches paired with any allowed asset, several Launchpad
-- contracts read per chain. Nothing is deleted but cursors without a known
-- contract, which only makes the indexer read those blocks again: reading a
-- block twice changes nothing.

-- Launches: the version of their contract and the tier their buyers need.
ALTER TABLE "launches"
  ADD COLUMN "launchpad_version" SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN "required_tier" SMALLINT NOT NULL DEFAULT 0;

-- Assets: whether their issuer can freeze or take balances.
ALTER TABLE "assets" ADD COLUMN "can_freeze" BOOLEAN NOT NULL DEFAULT false;

-- One cursor per chain and Launchpad contract.
DELETE FROM "chain_cursors" WHERE "launchpad" IS NULL;
ALTER TABLE "chain_cursors" DROP CONSTRAINT "chain_cursors_pkey";
ALTER TABLE "chain_cursors" ALTER COLUMN "launchpad" SET NOT NULL;
ALTER TABLE "chain_cursors" ADD CONSTRAINT "chain_cursors_pkey" PRIMARY KEY ("chain_key", "launchpad");

-- The assets each v3 Launchpad allows.
CREATE TABLE "launchpad_quote_assets" (
    "chain_key" VARCHAR(32) NOT NULL,
    "launchpad" VARCHAR(42) NOT NULL,
    "asset_id" UUID NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "min_soft_cap" DECIMAL(78,0) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "launchpad_quote_assets_pkey" PRIMARY KEY ("chain_key","launchpad","asset_id")
);

ALTER TABLE "launchpad_quote_assets" ADD CONSTRAINT "launchpad_quote_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
