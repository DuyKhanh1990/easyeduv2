CREATE TABLE IF NOT EXISTS "class_grade_books" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_id" uuid NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "score_sheet_id" uuid NOT NULL REFERENCES "score_sheets"("id") ON DELETE RESTRICT,
  "session_id" uuid REFERENCES "class_sessions"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "class_grade_book_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "grade_book_id" uuid NOT NULL REFERENCES "class_grade_books"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "category_id" uuid NOT NULL REFERENCES "score_categories"("id") ON DELETE CASCADE,
  "score" varchar(50),
  "created_at" timestamp DEFAULT now() NOT NULL
);
