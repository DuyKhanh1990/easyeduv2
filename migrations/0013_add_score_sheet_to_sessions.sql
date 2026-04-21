ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS score_sheet_id uuid REFERENCES score_sheets(id) ON DELETE SET NULL;
