-- CreateTable
CREATE TABLE "launches" (
    "id" UUID NOT NULL,
    "chain_key" VARCHAR(32) NOT NULL,
    "launch_id" INTEGER NOT NULL,
    "token_address" VARCHAR(42) NOT NULL,
    "sale_address" VARCHAR(42) NOT NULL,
    "vesting_address" VARCHAR(42) NOT NULL,
    "creator_address" VARCHAR(42) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "total_supply" DECIMAL(78,0) NOT NULL,
    "tokens_for_sale" DECIMAL(78,0) NOT NULL,
    "creator_allocation" DECIMAL(78,0) NOT NULL,
    "soft_cap" DECIMAL(78,0) NOT NULL,
    "hard_cap" DECIMAL(78,0) NOT NULL,
    "min_contribution" DECIMAL(78,0) NOT NULL,
    "max_contribution" DECIMAL(78,0) NOT NULL,
    "start_time" TIMESTAMPTZ(0) NOT NULL,
    "end_time" TIMESTAMPTZ(0) NOT NULL,
    "creator_allocation_bps" INTEGER NOT NULL,
    "liquidity_bps" INTEGER NOT NULL,
    "fee_bps" INTEGER NOT NULL,
    "vesting_tranches" INTEGER NOT NULL,
    "total_raised" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "contributor_count" INTEGER NOT NULL DEFAULT 0,
    "hard_cap_reached_at" TIMESTAMPTZ(0),
    "finalized_at" TIMESTAMPTZ(0),
    "pair_address" VARCHAR(42),
    "liquidity_native" DECIMAL(78,0),
    "liquidity_tokens" DECIMAL(78,0),
    "creator_native" DECIMAL(78,0),
    "fee" DECIMAL(78,0),
    "tokens_burned" DECIMAL(78,0),
    "fee_collected_at" TIMESTAMPTZ(0),
    "vesting_released_native" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "vesting_released_tokens" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "description" VARCHAR(280) NOT NULL DEFAULT '',
    "image_url" TEXT,
    "created_at" TIMESTAMPTZ(0) NOT NULL,
    "created_block" INTEGER NOT NULL,
    "created_tx_hash" VARCHAR(66) NOT NULL,

    CONSTRAINT "launches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "launch_contributions" (
    "id" UUID NOT NULL,
    "launch_row_id" UUID NOT NULL,
    "contributor" VARCHAR(42) NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "claimed_tokens" DECIMAL(78,0),
    "claimed_at" TIMESTAMPTZ(0),
    "refunded_amount" DECIMAL(78,0),
    "refunded_at" TIMESTAMPTZ(0),
    "first_contributed_at" TIMESTAMPTZ(0) NOT NULL,

    CONSTRAINT "launch_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_events" (
    "id" UUID NOT NULL,
    "chain_key" VARCHAR(32) NOT NULL,
    "block_number" INTEGER NOT NULL,
    "block_hash" VARCHAR(66) NOT NULL,
    "block_time" TIMESTAMPTZ(0) NOT NULL,
    "tx_hash" VARCHAR(66) NOT NULL,
    "log_index" INTEGER NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "args" JSONB NOT NULL,

    CONSTRAINT "chain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_cursors" (
    "chain_key" VARCHAR(32) NOT NULL,
    "last_block" INTEGER NOT NULL,
    "last_hash" VARCHAR(66) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chain_cursors_pkey" PRIMARY KEY ("chain_key")
);

-- CreateIndex
CREATE INDEX "launches_chain_key_sale_address_idx" ON "launches"("chain_key", "sale_address");

-- CreateIndex
CREATE INDEX "launches_chain_key_vesting_address_idx" ON "launches"("chain_key", "vesting_address");

-- CreateIndex
CREATE INDEX "launches_creator_address_idx" ON "launches"("creator_address");

-- CreateIndex
CREATE UNIQUE INDEX "launches_chain_key_launch_id_key" ON "launches"("chain_key", "launch_id");

-- CreateIndex
CREATE INDEX "launch_contributions_contributor_idx" ON "launch_contributions"("contributor");

-- CreateIndex
CREATE UNIQUE INDEX "launch_contributions_launch_row_id_contributor_key" ON "launch_contributions"("launch_row_id", "contributor");

-- CreateIndex
CREATE INDEX "chain_events_chain_key_address_idx" ON "chain_events"("chain_key", "address");

-- CreateIndex
CREATE UNIQUE INDEX "chain_events_chain_key_tx_hash_log_index_key" ON "chain_events"("chain_key", "tx_hash", "log_index");

-- AddForeignKey
ALTER TABLE "launch_contributions" ADD CONSTRAINT "launch_contributions_launch_row_id_fkey" FOREIGN KEY ("launch_row_id") REFERENCES "launches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
