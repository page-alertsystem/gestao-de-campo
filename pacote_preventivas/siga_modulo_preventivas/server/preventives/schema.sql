-- Agenda de Preventiva — tabelas do módulo (contrato: docs/ESQUEMA_API_PREVENTIVAS.md)
-- Executado pelo próprio módulo na inicialização (ensureSchema). Só cria; nunca apaga.
-- Não altera nenhuma tabela existente do SIGA.

CREATE TABLE IF NOT EXISTS preventive_plans (
  id text PRIMARY KEY,
  client_id text NOT NULL UNIQUE,              -- clients.id do SIGA
  legacy_id integer UNIQUE,                    -- id do cliente na V3 (importação)
  period_months smallint NOT NULL CHECK (period_months IN (1, 2, 3, 6)),
  start_month smallint NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  start_year smallint NOT NULL,
  team_id text NOT NULL CHECK (team_id IN ('SP', 'BR')),
  movidesk_client_id text NOT NULL DEFAULT '',
  contacts jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  anchor_date date,                            -- base para gerar/estender o cronograma
  rev bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS preventive_dismissed_clients (
  client_id text PRIMARY KEY,
  reason text NOT NULL,
  dismissed_by text,
  dismissed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preventive_visits (
  id text PRIMARY KEY,
  plan_id text NOT NULL REFERENCES preventive_plans (id),
  client_id text NOT NULL,
  legacy_id integer UNIQUE,                    -- id da atividade na V3
  team_id text NOT NULL,
  reference_date date NOT NULL,
  original_date date NOT NULL,
  scheduled_date date NOT NULL,
  completed_date date,
  technician text NOT NULL DEFAULT '',
  os_number text NOT NULL DEFAULT '',
  ticket_number text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  resolution text NOT NULL DEFAULT '',
  problems text NOT NULL DEFAULT '',
  notified_client boolean NOT NULL DEFAULT false,
  override_date boolean NOT NULL DEFAULT false,
  rescheduled boolean NOT NULL DEFAULT false,
  movidesk_ticket_id text,
  movidesk_protocol text,
  movidesk_url text,
  movidesk_created_at timestamptz,
  movidesk_created_by text,
  movidesk_last_error text,
  active boolean NOT NULL DEFAULT true,
  rev bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
CREATE INDEX IF NOT EXISTS preventive_visits_team_date ON preventive_visits (team_id, scheduled_date) WHERE active;
CREATE INDEX IF NOT EXISTS preventive_visits_client ON preventive_visits (client_id, scheduled_date) WHERE active;
CREATE INDEX IF NOT EXISTS preventive_visits_date ON preventive_visits (scheduled_date) WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS preventive_visits_ticket ON preventive_visits (movidesk_ticket_id) WHERE movidesk_ticket_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS preventive_history (
  id bigserial PRIMARY KEY,
  visit_id text NOT NULL,
  person_id text,
  user_name text,                              -- usado no histórico importado da V3
  action text NOT NULL,
  old_date date,
  new_date date,
  details text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS preventive_history_visit ON preventive_history (visit_id, created_at);

CREATE TABLE IF NOT EXISTS preventive_holidays (
  date date NOT NULL,
  name text NOT NULL,
  team_ids text[] NOT NULL DEFAULT '{}',       -- vazio = todas as equipes
  PRIMARY KEY (date, name)
);

CREATE TABLE IF NOT EXISTS preventive_meta (
  key text PRIMARY KEY,
  value text NOT NULL
);
