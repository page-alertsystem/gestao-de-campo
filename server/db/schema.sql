-- Esquema PostgreSQL do GIO
-- Cada coleção do sistema tem a sua própria tabela. O registro completo fica em
-- "data" (jsonb), e os campos mais usados em consultas/relatórios são colunas
-- geradas automaticamente a partir dele (sempre consistentes com o registro).
-- "rev" guarda a revisão global em que o registro foi alterado pela última vez;
-- ela é usada para detectar edições simultâneas sem perder dados.
-- Exclusões são lógicas (deleted_at), para manter histórico.

CREATE TABLE IF NOT EXISTS gio_meta (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);
INSERT INTO gio_meta (key, value) VALUES ('revision', '0'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO gio_meta (key, value) VALUES ('schema_version', '1'::jsonb) ON CONFLICT (key) DO NOTHING;

-- Pessoas (usuários). A senha fica fora do jsonb.
CREATE TABLE IF NOT EXISTS people (
  id                   text PRIMARY KEY,
  data                 jsonb NOT NULL,
  password_hash        text,
  must_change_password boolean NOT NULL DEFAULT false,
  name      text GENERATED ALWAYS AS (data->>'name') STORED,
  email     text GENERATED ALWAYS AS (lower(trim(data->>'email'))) STORED,
  groups    jsonb GENERATED ALWAYS AS (coalesce(data->'groups', '[]'::jsonb)) STORED,
  active    boolean GENERATED ALWAYS AS (coalesce((data->>'active')::boolean, true)) STORED,
  can_login boolean GENERATED ALWAYS AS (coalesce((data->>'canLogin')::boolean, false)) STORED,
  rev        bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS people_email ON people (email);

CREATE TABLE IF NOT EXISTS clients (
  id text PRIMARY KEY, data jsonb NOT NULL,
  name   text GENERATED ALWAYS AS (data->>'name') STORED,
  city   text GENERATED ALWAYS AS (data->>'city') STORED,
  state  text GENERATED ALWAYS AS (data->>'state') STORED,
  active boolean GENERATED ALWAYS AS (coalesce((data->>'active')::boolean, true)) STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS vehicles (
  id text PRIMARY KEY, data jsonb NOT NULL,
  plate   text GENERATED ALWAYS AS (upper(data->>'plate')) STORED,
  model   text GENERATED ALWAYS AS (data->>'model') STORED,
  mileage numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(data->'mileage') = 'number' THEN (data->>'mileage')::numeric END) STORED,
  active  boolean GENERATED ALWAYS AS (coalesce((data->>'active')::boolean, true)) STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id text PRIMARY KEY, data jsonb NOT NULL,
  code      text GENERATED ALWAYS AS (data->>'code') STORED,
  equipment text GENERATED ALWAYS AS (data->>'equipment') STORED,
  category  text GENERATED ALWAYS AS (data->>'category') STORED,
  quantity  numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(data->'quantity') = 'number' THEN (data->>'quantity')::numeric END) STORED,
  minimum   numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(data->'minimum') = 'number' THEN (data->>'minimum')::numeric END) STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS inventory_items_code ON inventory_items (code);

CREATE TABLE IF NOT EXISTS stock_requests (
  id text PRIMARY KEY, data jsonb NOT NULL,
  code       text GENERATED ALWAYS AS (data->>'code') STORED,
  status     text GENERATED ALWAYS AS (data->>'status') STORED,
  requester  text GENERATED ALWAYS AS (data->>'requester') STORED,
  technician text GENERATED ALWAYS AS (data->>'technician') STORED,
  client     text GENERATED ALWAYS AS (data->>'client') STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS stock_assignments (
  id text PRIMARY KEY, data jsonb NOT NULL,
  person_id         text GENERATED ALWAYS AS (data->>'personId') STORED,
  inventory_item_id text GENERATED ALWAYS AS (data->>'inventoryItemId') STORED,
  status            text GENERATED ALWAYS AS (data->>'status') STORED,
  quantity          numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(data->'quantity') = 'number' THEN (data->>'quantity')::numeric END) STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS stock_assignments_person ON stock_assignments (person_id);

CREATE TABLE IF NOT EXISTS material_usages (
  id text PRIMARY KEY, data jsonb NOT NULL,
  person_id         text GENERATED ALWAYS AS (data->>'personId') STORED,
  inventory_item_id text GENERATED ALWAYS AS (data->>'inventoryItemId') STORED,
  workflow_status   text GENERATED ALWAYS AS (data->>'workflowStatus') STORED,
  quantity          numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(data->'quantity') = 'number' THEN (data->>'quantity')::numeric END) STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS material_usages_person ON material_usages (person_id);

CREATE TABLE IF NOT EXISTS trajectories (
  id text PRIMARY KEY, data jsonb NOT NULL,
  author        text GENERATED ALWAYS AS (data->>'author') STORED,
  type          text GENERATED ALWAYS AS (data->>'type') STORED,
  declared_date text GENERATED ALWAYS AS (data->>'declaredDate') STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS km_records (
  id text PRIMARY KEY, data jsonb NOT NULL,
  driver        text GENERATED ALWAYS AS (data->>'driver') STORED,
  vehicle       text GENERATED ALWAYS AS (data->>'vehicle') STORED,
  mileage       numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(data->'mileage') = 'number' THEN (data->>'mileage')::numeric END) STORED,
  declared_date text GENERATED ALWAYS AS (data->>'declaredDate') STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS audits (
  id text PRIMARY KEY, data jsonb NOT NULL,
  person_id    text GENERATED ALWAYS AS (data->>'personId') STORED,
  category     text GENERATED ALWAYS AS (data->>'category') STORED,
  auditor_name text GENERATED ALWAYS AS (data->>'auditorName') STORED,
  completed_at text GENERATED ALWAYS AS (data->>'completedAt') STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS audits_person ON audits (person_id);

CREATE TABLE IF NOT EXISTS rma_requests (
  id text PRIMARY KEY, data jsonb NOT NULL,
  local_code         text GENERATED ALWAYS AS (data->>'localCode') STORED,
  movidesk_ticket_id text GENERATED ALWAYS AS (data->>'movideskTicketId') STORED,
  technician_id      text GENERATED ALWAYS AS (data->>'technicianId') STORED,
  status             text GENERATED ALWAYS AS (data->>'status') STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS survey_requests (
  id text PRIMARY KEY, data jsonb NOT NULL,
  local_code         text GENERATED ALWAYS AS (data->>'localCode') STORED,
  movidesk_ticket_id text GENERATED ALWAYS AS (data->>'movideskTicketId') STORED,
  requested_by_id    text GENERATED ALWAYS AS (data->>'requestedById') STORED,
  status             text GENERATED ALWAYS AS (data->>'status') STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS apr_records (
  id text PRIMARY KEY, data jsonb NOT NULL,
  created_by_id text GENERATED ALWAYS AS (data->>'createdById') STORED,
  client        text GENERATED ALWAYS AS (data->>'client') STORED,
  release_date  text GENERATED ALWAYS AS (data->>'releaseDate') STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY, data jsonb NOT NULL,
  title text GENERATED ALWAYS AS (data->>'title') STORED,
  read  boolean GENERATED ALWAYS AS (coalesce((data->>'read')::boolean, false)) STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);

-- Categorias de ferramentas/EPIs (com perguntas de auditoria)
CREATE TABLE IF NOT EXISTS equipment_categories (
  id text PRIMARY KEY, data jsonb NOT NULL,
  name   text GENERATED ALWAYS AS (data->>'name') STORED,
  type   text GENERATED ALWAYS AS (data->>'type') STORED,
  active boolean GENERATED ALWAYS AS (coalesce((data->>'active')::boolean, true)) STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);

-- Baixas/trocas aguardando análise do TST
CREATE TABLE IF NOT EXISTS equipment_approval_requests (
  id text PRIMARY KEY, data jsonb NOT NULL,
  person_id text GENERATED ALWAYS AS (data->>'personId') STORED,
  situation text GENERATED ALWAYS AS (data->>'situation') STORED,
  status    text GENERATED ALWAYS AS (data->>'status') STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS equipment_approval_requests_person ON equipment_approval_requests (person_id);

-- Solicitações de ferramentas/EPIs ao Estoque
CREATE TABLE IF NOT EXISTS equipment_stock_requests (
  id text PRIMARY KEY, data jsonb NOT NULL,
  person_id text GENERATED ALWAYS AS (data->>'personId') STORED,
  status    text GENERATED ALWAYS AS (data->>'status') STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS equipment_stock_requests_person ON equipment_stock_requests (person_id);

-- Chamados de retorno (Movidesk)
CREATE TABLE IF NOT EXISTS return_call_requests (
  id text PRIMARY KEY, data jsonb NOT NULL,
  local_code         text GENERATED ALWAYS AS (data->>'localCode') STORED,
  movidesk_ticket_id text GENERATED ALWAYS AS (data->>'movideskTicketId') STORED,
  opened_by_id       text GENERATED ALWAYS AS (data->>'openedById') STORED,
  status             text GENERATED ALWAYS AS (data->>'status') STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);

-- Preventivas sistêmicas (servidores, workstations, storage)
CREATE TABLE IF NOT EXISTS system_preventives (
  id text PRIMARY KEY, data jsonb NOT NULL,
  code          text GENERATED ALWAYS AS (data->>'code') STORED,
  created_by_id text GENERATED ALWAYS AS (data->>'createdById') STORED,
  client        text GENERATED ALWAYS AS (data->>'client') STORED,
  asset_type    text GENERATED ALWAYS AS (data->>'assetType') STORED,
  service_date  text GENERATED ALWAYS AS (data->>'serviceDate') STORED,
  rev bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text, deleted_at timestamptz
);

-- PDFs (auditorias, troca de veículo, APR) guardados no próprio banco.
CREATE TABLE IF NOT EXISTS documents (
  storage_key text PRIMARY KEY,
  record_type text NOT NULL,
  record_id   text NOT NULL,
  file_name   text NOT NULL,
  content     bytea NOT NULL,
  size_bytes  integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Sessões de login (sobrevivem ao reinício do servidor). Guarda só o hash do token.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  person_id  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);

-- Histórico de alterações: quem mudou o quê e quando.
CREATE TABLE IF NOT EXISTS change_log (
  id         bigserial PRIMARY KEY,
  changed_at timestamptz NOT NULL DEFAULT now(),
  person_id  text,
  collection text NOT NULL,
  record_id  text NOT NULL,
  action     text NOT NULL,
  rev        bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS change_log_record ON change_log (collection, record_id);
