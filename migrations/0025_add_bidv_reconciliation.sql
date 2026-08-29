CREATE TABLE IF NOT EXISTS bidv_reconciliation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id varchar(3) NOT NULL,
  service_id varchar(6),
  location_id uuid,
  reconcile_date date NOT NULL,
  file_type varchar(100) NOT NULL DEFAULT '1',
  request_type varchar(2) NOT NULL DEFAULT '1',
  status varchar(20) NOT NULL DEFAULT 'queued',
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp,
  completed_at timestamp,
  record_count integer NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  error_code varchar(100),
  error_message text,
  request_id varchar(100),
  signature_verified boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bidv_recon_sessions_lookup_idx
  ON bidv_reconciliation_sessions(provider_id, reconcile_date, file_type);
CREATE INDEX IF NOT EXISTS bidv_recon_sessions_status_idx
  ON bidv_reconciliation_sessions(status);
CREATE UNIQUE INDEX IF NOT EXISTS bidv_recon_sessions_unique_request_idx
  ON bidv_reconciliation_sessions(provider_id, reconcile_date, file_type);

CREATE TABLE IF NOT EXISTS bidv_reconciliation_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES bidv_reconciliation_sessions(id) ON DELETE CASCADE,
  file_name varchar(500),
  mime_type varchar(100) NOT NULL DEFAULT 'text/plain',
  size integer NOT NULL DEFAULT 0,
  checksum varchar(128) NOT NULL,
  raw_content text NOT NULL,
  raw_response_metadata jsonb,
  signature_verified boolean NOT NULL DEFAULT false,
  encrypted boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bidv_reconciliation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES bidv_reconciliation_sessions(id) ON DELETE CASCADE,
  external_transaction_id varchar(200),
  trace_number varchar(100),
  va_code varchar(100),
  bill_id varchar(200),
  transaction_date timestamp,
  value_date timestamp,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  transaction_type varchar(20),
  bank_status varchar(20),
  bank_description text,
  currency varchar(3) NOT NULL DEFAULT 'VND',
  channel_code varchar(20),
  service_id varchar(20),
  raw_data jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bidv_recon_records_session_idx
  ON bidv_reconciliation_records(session_id);
CREATE INDEX IF NOT EXISTS bidv_recon_records_external_idx
  ON bidv_reconciliation_records(external_transaction_id);