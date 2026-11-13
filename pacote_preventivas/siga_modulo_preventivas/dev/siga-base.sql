-- SOMENTE PARA TESTE: reprodução mínima das tabelas do SIGA usadas pelo módulo,
-- conforme o levantamento técnico (server/db/schema.sql do SIGA). Não rodar em produção.

CREATE TABLE IF NOT EXISTS gio_meta (key text PRIMARY KEY, value jsonb NOT NULL);
INSERT INTO gio_meta (key, value) VALUES ('revision', '0'), ('schema_version', '1') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS people (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  password_hash text,
  must_change_password boolean NOT NULL DEFAULT false,
  name text GENERATED ALWAYS AS (data->>'name') STORED,
  email text GENERATED ALWAYS AS (lower(trim(data->>'email'))) STORED,
  groups jsonb GENERATED ALWAYS AS (coalesce(data->'groups', '[]'::jsonb)) STORED,
  active boolean GENERATED ALWAYS AS (coalesce((data->>'active')::boolean, true)) STORED,
  rev bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS clients (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  name text GENERATED ALWAYS AS (data->>'name') STORED,
  city text GENERATED ALWAYS AS (data->>'city') STORED,
  state text GENERATED ALWAYS AS (data->>'state') STORED,
  active boolean GENERATED ALWAYS AS (coalesce((data->>'active')::boolean, true)) STORED,
  rev bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  person_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS change_log (
  id bigserial PRIMARY KEY,
  changed_at timestamptz NOT NULL DEFAULT now(),
  person_id text,
  collection text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL,
  rev bigint
);
