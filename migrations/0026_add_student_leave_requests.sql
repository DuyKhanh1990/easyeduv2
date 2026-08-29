-- Student leave requests used by /learning-overview -> Xin nghỉ.
-- The table definition already exists in shared/schema.ts; this migration
-- brings development databases in sync with that source of truth.

CREATE TABLE IF NOT EXISTS student_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  schedule_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  schedule_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_date date NOT NULL,
  end_date date NOT NULL,
  description text,
  status varchar(20) NOT NULL DEFAULT 'pending',
  attendance_approval_mode varchar(20),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_leave_requests_student_created_at_idx
  ON student_leave_requests (student_id, created_at);

CREATE INDEX IF NOT EXISTS student_leave_requests_location_status_idx
  ON student_leave_requests (location_id, status);

CREATE INDEX IF NOT EXISTS student_leave_requests_status_idx
  ON student_leave_requests (status);