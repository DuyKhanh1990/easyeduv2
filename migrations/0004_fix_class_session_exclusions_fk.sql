-- Remove foreign key constraints from class_session_exclusions
-- These constraints prevent deleting sessions that are referenced by exclusion records
-- The exclusion record only needs to keep a historical audit trail with IDs, not FK references

ALTER TABLE "class_session_exclusions" DROP CONSTRAINT IF EXISTS "class_session_exclusions_from_session_id_class_sessions_id_fk";
ALTER TABLE "class_session_exclusions" DROP CONSTRAINT IF EXISTS "class_session_exclusions_to_session_id_class_sessions_id_fk";
