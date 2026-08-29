-- Migration: Add class_grade_book_student_comments table
-- Stores per-student comments for grade books in a proper relational table

CREATE TABLE IF NOT EXISTS class_grade_book_student_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_book_id UUID NOT NULL REFERENCES class_grade_books(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(grade_book_id, student_id)
);
