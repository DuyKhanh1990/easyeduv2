CREATE TABLE "class_session_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"from_session_id" uuid NOT NULL,
	"to_session_id" uuid NOT NULL,
	"from_session_order" integer NOT NULL,
	"to_session_order" integer NOT NULL,
	"from_session_date" date NOT NULL,
	"to_session_date" date NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_session_id" uuid NOT NULL,
	"content_type" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"resource_url" text,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_session_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_content_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"custom_title" text,
	"custom_description" text,
	"status" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_session_exclusions" ADD CONSTRAINT "class_session_exclusions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session_exclusions" ADD CONSTRAINT "class_session_exclusions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_contents" ADD CONSTRAINT "session_contents_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_session_contents" ADD CONSTRAINT "student_session_contents_session_content_id_session_contents_id_fk" FOREIGN KEY ("session_content_id") REFERENCES "public"."session_contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_session_contents" ADD CONSTRAINT "student_session_contents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;