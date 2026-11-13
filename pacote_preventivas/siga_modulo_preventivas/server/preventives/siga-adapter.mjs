// Ponto ÚNICO de contato do módulo com as tabelas que já existem no SIGA
// (people, clients, gio_meta, change_log). Se algo no SIGA for diferente do
// levantamento técnico de 13/11/2026, ajuste SOMENTE este arquivo.
//
// Pontos marcados com  >>> CONFERIR  devem ser verificados no código do SIGA
// (server/db/postgres.mjs) durante a integração.

import { randomUUID } from 'node:crypto';

export const ALLOWED_PROFILES = ['Service Desk', 'Administrador'];
export const IMPORT_PROFILES = ['Administrador'];

/** Extrai o id da pessoa do objeto de sessão que o local-server.mjs entrega às rotas.
 *  >>> CONFERIR o formato real do objeto `session` (ex.: session.personId). */
export function personIdFromSession(session) {
  return session?.personId ?? session?.person_id ?? session?.person?.id ?? session?.id ?? null;
}

/** Pessoa logada: nome, e-mail, perfis (people.groups) e se precisa trocar a senha. */
export async function getPerson(db, personId) {
  const { rows } = await db.query(
    `SELECT id, name, email, groups, must_change_password
       FROM people WHERE id = $1 AND deleted_at IS NULL`,
    [personId],
  );
  if (!rows.length) return null;
  const row = rows[0];
  const groups = Array.isArray(row.groups) ? row.groups : [];
  return {
    id: row.id,
    name: row.name || '',
    email: row.email || '',
    profiles: groups.map(String),
    mustChangePassword: Boolean(row.must_change_password),
  };
}

const CLIENT_COLUMNS = `id, name, coalesce(city, '') AS city, coalesce(state, '') AS state,
  coalesce(active, true) AS active, created_at`;

export async function listSigaClients(db) {
  const { rows } = await db.query(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE deleted_at IS NULL`);
  return rows;
}

export async function getSigaClient(db, id) {
  const { rows } = await db.query(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return rows[0] || null;
}

/** Avança a revisão global do SIGA (gio_meta.revision), para que o site e o app
 *  recebam a mudança na próxima sincronização do /api/state.
 *  >>> CONFERIR como postgres.mjs incrementa a revisão (formato do valor em gio_meta). */
async function nextRevision(db) {
  const { rows } = await db.query(
    `UPDATE gio_meta SET value = to_jsonb(((value #>> '{}')::bigint) + 1)
      WHERE key = 'revision' RETURNING (value #>> '{}')::bigint AS rev`,
  );
  if (!rows.length) throw new Error("gio_meta sem a chave 'revision'.");
  return Number(rows[0].rev);
}

async function logChange(db, personId, recordId, action, rev) {
  await db.query(
    `INSERT INTO change_log (person_id, collection, record_id, action, rev) VALUES ($1, 'clients', $2, $3, $4)`,
    [personId, recordId, action, rev],
  );
}

/** Cria um cliente no cadastro do SIGA (tabela clients).
 *  >>> CONFERIR: formato do id e campos obrigatórios do jsonb `data` de um cliente
 *  (comparar com um cliente criado pela tela Cadastros do SIGA). */
export async function createSigaClient(db, { name, city = '', state = '' }, personId) {
  const id = `cli-${randomUUID()}`;
  const rev = await nextRevision(db);
  const data = { id, name, city, state, active: true };
  await db.query(
    `INSERT INTO clients (id, data, rev, created_at, updated_at, updated_by) VALUES ($1, $2, $3, now(), now(), $4)`,
    [id, data, rev, personId],
  );
  await logChange(db, personId, id, 'create', rev);
  return { id, name, city, state, active: true, created_at: new Date() };
}

/** Renomeia um cliente do SIGA (edição do nome feita na Agenda de Preventiva). */
export async function renameSigaClient(db, id, name, personId) {
  const rev = await nextRevision(db);
  await db.query(
    `UPDATE clients SET data = jsonb_set(data, '{name}', to_jsonb($2::text)), rev = $3, updated_at = now(), updated_by = $4
      WHERE id = $1`,
    [id, name, rev, personId],
  );
  await logChange(db, personId, id, 'update', rev);
}
