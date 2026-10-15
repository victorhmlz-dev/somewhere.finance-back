-- CreateEnum
CREATE TYPE "ReactionKind" AS ENUM ('rocket', 'fire', 'gem', 'eyes', 'joy', 'thumbs_down');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'launch_purchase';
ALTER TYPE "NotificationType" ADD VALUE 'purchase';
ALTER TYPE "NotificationType" ADD VALUE 'launch_comment';
ALTER TYPE "NotificationType" ADD VALUE 'reaction';

-- DropIndex
DROP INDEX "notifications_recipient_id_actor_id_type_post_id_key";

-- AlterTable
ALTER TABLE "chain_cursors" ADD COLUMN     "launchpad" VARCHAR(42);

-- AlterTable
ALTER TABLE "launches" ADD COLUMN     "details_set_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "actor_address" VARCHAR(42),
ADD COLUMN     "launch_id" UUID,
ADD COLUMN     "native_amount" DECIMAL(78,0),
ADD COLUMN     "reaction" "ReactionKind",
ADD COLUMN     "token_amount" DECIMAL(78,0),
ALTER COLUMN "actor_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "launch_id" UUID;

-- CreateTable
CREATE TABLE "reactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "ReactionKind" NOT NULL,
    "post_id" UUID,
    "launch_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_launch_details" (
    "id" UUID NOT NULL,
    "chain_key" VARCHAR(32) NOT NULL,
    "tx_hash" VARCHAR(66) NOT NULL,
    "user_id" UUID NOT NULL,
    "description" VARCHAR(280) NOT NULL,
    "image_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_launch_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reactions_post_id_idx" ON "reactions"("post_id");

-- CreateIndex
CREATE INDEX "reactions_launch_id_idx" ON "reactions"("launch_id");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_user_id_post_id_kind_key" ON "reactions"("user_id", "post_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_user_id_launch_id_kind_key" ON "reactions"("user_id", "launch_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "pending_launch_details_chain_key_tx_hash_user_id_key" ON "pending_launch_details"("chain_key", "tx_hash", "user_id");

-- CreateIndex
CREATE INDEX "notifications_launch_id_idx" ON "notifications"("launch_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_recipient_id_actor_id_type_post_id_launch_id__key" ON "notifications"("recipient_id", "actor_id", "type", "post_id", "launch_id", "reaction");

-- CreateIndex
CREATE INDEX "posts_launch_id_id_idx" ON "posts"("launch_id", "id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_launch_id_fkey" FOREIGN KEY ("launch_id") REFERENCES "launches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_launch_id_fkey" FOREIGN KEY ("launch_id") REFERENCES "launches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_launch_id_fkey" FOREIGN KEY ("launch_id") REFERENCES "launches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_launch_details" ADD CONSTRAINT "pending_launch_details_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A reaction is to a post or to a launch, never both nor neither.
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_one_target"
  CHECK (("post_id" IS NULL) <> ("launch_id" IS NULL));

-- Launches that already have a description or an image keep them as final.
UPDATE "launches" SET "details_set_at" = now()
  WHERE "description" <> '' OR "image_url" IS NOT NULL;
