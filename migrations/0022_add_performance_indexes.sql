-- Performance indexes: fix slow dashboard queries (3+ seconds)
-- Run on production with: psql $DATABASE_URL -f migrations/0022_add_performance_indexes.sql
-- CREATE INDEX CONCURRENTLY does not lock tables during build.

-- 1. student_locations: used in JOIN/EXISTS on almost every student query
CREATE INDEX CONCURRENTLY IF NOT EXISTS student_locations_student_id_idx
  ON student_locations (student_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS student_locations_location_id_idx
  ON student_locations (location_id);

-- 2. students: array columns used with ANY() in getStudentsByStaff and filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS students_user_id_idx
  ON students (user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS students_sales_by_ids_gin_idx
  ON students USING gin (sales_by_ids);

CREATE INDEX CONCURRENTLY IF NOT EXISTS students_managed_by_ids_gin_idx
  ON students USING gin (managed_by_ids);

CREATE INDEX CONCURRENTLY IF NOT EXISTS students_teacher_ids_gin_idx
  ON students USING gin (teacher_ids);

-- 3. tasks: locationIds array used with && operator
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_location_ids_gin_idx
  ON tasks USING gin (location_ids);

-- 4. staff_assignments: staffId used in my-permissions query
CREATE INDEX CONCURRENTLY IF NOT EXISTS staff_assignments_staff_id_idx
  ON staff_assignments (staff_id);

-- 5. role_permissions: roleId used in inArray lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS role_permissions_role_id_idx
  ON role_permissions (role_id);

-- 6. student_notification_channels: studentId used in inArray on student list load
CREATE INDEX CONCURRENTLY IF NOT EXISTS student_notification_channels_student_id_idx
  ON student_notification_channels (student_id);

-- 7. staff: userId queried on EVERY request by locationAccessMiddleware (auth)
--    Most critical index — missing this causes 200ms+ overhead per request
CREATE INDEX CONCURRENTLY IF NOT EXISTS staff_user_id_idx
  ON staff (user_id);
