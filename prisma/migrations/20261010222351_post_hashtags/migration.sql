-- CreateTable
CREATE TABLE "post_hashtags" (
    "post_id" UUID NOT NULL,
    "tag" VARCHAR(50) NOT NULL,
    "label" VARCHAR(50) NOT NULL,

    CONSTRAINT "post_hashtags_pkey" PRIMARY KEY ("post_id","tag")
);

-- CreateIndex
CREATE INDEX "post_hashtags_tag_post_id_idx" ON "post_hashtags"("tag", "post_id");

-- AddForeignKey
ALTER TABLE "post_hashtags" ADD CONSTRAINT "post_hashtags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
