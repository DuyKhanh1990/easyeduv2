ALTER TABLE "classes" ADD COLUMN "shift_template_ids" uuid[];

UPDATE "classes"
SET "shift_template_ids" = ARRAY["shift_template_id"]::uuid[]
WHERE "shift_template_id" IS NOT NULL;

ALTER TABLE "classes" DROP COLUMN "shift_template_id";
