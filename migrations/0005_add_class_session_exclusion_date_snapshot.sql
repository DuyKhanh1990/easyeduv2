-- Add date snapshot columns to class_session_exclusions for historical audit trail
-- Drop deprecated FK columns that reference class_sessions
-- This allows sessions to be deleted without affecting exclusion history

ALTER TABLE "class_session_exclusions"
ADD COLUMN "from_session_date" date NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE "class_session_exclusions"
ADD COLUMN "to_session_date" date NOT NULL DEFAULT CURRENT_DATE;

-- Keep the ID columns for reference but they're no longer FK
-- No constraint, just plain UUIDs for historical tracking
