CREATE TABLE IF NOT EXISTS "student_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "student_comments" ADD CONSTRAINT "student_comments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE cascade;
ALTER TABLE "student_comments" ADD CONSTRAINT "student_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action;

CREATE INDEX IF NOT EXISTS "student_comments_student_id_idx" ON "student_comments" ("student_id");
