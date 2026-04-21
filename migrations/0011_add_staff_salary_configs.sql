CREATE TABLE "staff_salary_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "staff_id" uuid NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "salary_package_id" uuid NOT NULL REFERENCES "teacher_salary_packages"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);
