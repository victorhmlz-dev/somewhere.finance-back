-- What people add about a launch must survive reading the chain again. The
-- launch row is a copy of the chain and can be deleted and rebuilt; its id is
-- now derived from the chain (see src/launchpad/launch-id.ts), so the rebuilt
-- row has the same id, and everything that points to it finds it again.

-- 1. Each launch records the Launchpad contract that created it, so the same
--    chain can be read from a new contract without mixing or deleting launches.
ALTER TABLE "launches" ADD COLUMN "launchpad" VARCHAR(42);
UPDATE "launches" AS l
   SET "launchpad" = c."launchpad"
  FROM "chain_cursors" AS c
 WHERE c."chain_key" = l."chain_key" AND c."launchpad" IS NOT NULL;
-- Launches of a chain whose contract is unknown (indexed before it was
-- recorded) keep a placeholder; resetting that chain reads them again.
UPDATE "launches" SET "launchpad" = '' WHERE "launchpad" IS NULL;
ALTER TABLE "launches" ALTER COLUMN "launchpad" SET NOT NULL;

-- 2. Gives every launch the id the indexer would give it. The foreign keys
--    are ON UPDATE CASCADE, so contributions, comments, reactions and
--    notifications follow the new id. Same formula as launch-id.ts: a UUIDv7
--    with the block time, then the number of the launch, then the SHA-256 of
--    "<chain>:<launchpad>:<number>".
WITH derived AS (
  SELECT
    "id" AS old_id,
    "launch_id",
    lpad(to_hex((extract(epoch FROM "created_at") * 1000)::bigint), 12, '0') AS ms,
    encode(sha256(convert_to("chain_key" || ':' || "launchpad" || ':' || "launch_id"::text, 'UTF8')), 'hex') AS h
  FROM "launches"
  WHERE "launchpad" <> ''
)
UPDATE "launches" AS l
   SET "id" = (
     substr(d.ms, 1, 8) || '-' || substr(d.ms, 9, 4) || '-7' || lpad(to_hex(d.launch_id & 4095), 3, '0') || '-' ||
     substr('89ab', (('x' || substr(d.h, 1, 1))::bit(4)::int & 3) + 1, 1) || substr(d.h, 2, 3) || '-' ||
     substr(d.h, 5, 12)
   )::uuid
  FROM derived AS d
 WHERE l."id" = d.old_id;

-- 3. The description and image move to their own table, by launch id.
CREATE TABLE "launch_profiles" (
    "launch_id" UUID NOT NULL,
    "description" VARCHAR(280) NOT NULL DEFAULT '',
    "image_url" TEXT,
    "details_set_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "launch_profiles_pkey" PRIMARY KEY ("launch_id")
);
INSERT INTO "launch_profiles" ("launch_id", "description", "image_url", "details_set_at")
SELECT "id", "description", "image_url", coalesce("details_set_at", now())
  FROM "launches"
 WHERE "details_set_at" IS NOT NULL OR "description" <> '' OR "image_url" IS NOT NULL;

ALTER TABLE "launches" DROP COLUMN "description",
DROP COLUMN "details_set_at",
DROP COLUMN "image_url";

-- 4. Comments, reactions and notifications keep the launch id without a
--    foreign key: deleting the chain copy of a launch must not touch them.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_launch_id_fkey";
ALTER TABLE "posts" DROP CONSTRAINT "posts_launch_id_fkey";
ALTER TABLE "reactions" DROP CONSTRAINT "reactions_launch_id_fkey";

-- 5. A launch is unique by its contract and number, not only its chain.
DROP INDEX "launches_chain_key_launch_id_key";
CREATE UNIQUE INDEX "launches_chain_key_launchpad_launch_id_key" ON "launches"("chain_key", "launchpad", "launch_id");

-- 6. A notification caused by an event on chain carries the key of the event,
--    so reading the chain again does not repeat it.
ALTER TABLE "notifications" ADD COLUMN "source_key" VARCHAR(120);
CREATE UNIQUE INDEX "notifications_recipient_id_type_source_key_key" ON "notifications"("recipient_id", "type", "source_key");
