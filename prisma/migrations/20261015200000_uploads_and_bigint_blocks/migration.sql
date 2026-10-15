-- AlterTable
ALTER TABLE "chain_cursors" ALTER COLUMN "last_block" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "chain_events" ALTER COLUMN "block_number" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "launches" ALTER COLUMN "created_block" SET DATA TYPE BIGINT;

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "file_name" VARCHAR(80) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uploads_user_id_created_at_idx" ON "uploads"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "uploads_file_name_idx" ON "uploads"("file_name");

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

