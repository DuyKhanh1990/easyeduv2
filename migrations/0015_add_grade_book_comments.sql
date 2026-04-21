ALTER TABLE "class_grade_books" ADD COLUMN IF NOT EXISTS "student_comments" jsonb DEFAULT '{}';
