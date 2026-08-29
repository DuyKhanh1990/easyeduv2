-- Gateway registry: route BIDV requests đến đúng backend của từng trung tâm.
-- provider + routing_key (service_id từ BIDV) → base_url của trung tâm.
-- center_id tham chiếu center_config.id để xác định self-route (không phụ thuộc domain).

CREATE TABLE gateway_registry (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    TEXT        NOT NULL,
  routing_key TEXT        NOT NULL,
  center_id   UUID,
  name        TEXT        NOT NULL,
  base_url    TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX gateway_registry_provider_key_idx
  ON gateway_registry (provider, routing_key);
