// Acesso a dados e regras da Agenda de Preventiva (implementação do contrato
// docs/ESQUEMA_API_PREVENTIVAS.md). Comportamento idêntico ao servidor de referência
// tools/mock_siga_server.py — os testes tests_v4/test_contract.py valem para os dois.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as S from './scheduler.mjs';
import * as siga from './siga-adapter.mjs';
import * as movidesk from './movidesk.mjs';

export const TEAMS = { SP: 'São Paulo', BR: 'Brasil' };
const TEAM_BY_NAME = Object.fromEntries(Object.entries(TEAMS).map(([id, name]) => [name, id]));
const SCHEMA_SQL = readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');
const WRITE_LOCK = 731100;

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const newId = (prefix) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
export const normalize = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean).join(' ');
// instantes sempre no horário de Brasília (ex.: 2026-11-13T15:25:00-03:00)
const iso = (value) => (value instanceof Date ? S.nowIso(value) : value ?? null);

function parseDate(value, field) {
  if (!S.parseIso(String(value ?? ''))) throw new ApiError(400, 'validation', `Data inválida em '${field}'. Use AAAA-MM-DD.`);
  return String(value);
}

const VISIT_SELECT = `
  SELECT v.id, v.legacy_id, v.plan_id, v.client_id, coalesce(c.name, '') AS client_name, v.team_id,
         v.reference_date::text AS reference_date, v.original_date::text AS original_date,
         v.scheduled_date::text AS scheduled_date, v.completed_date::text AS completed_date,
         v.technician, v.os_number, v.ticket_number, v.summary, v.resolution, v.problems,
         v.notified_client, v.override_date, v.rescheduled, v.movidesk_ticket_id, v.movidesk_protocol,
         v.movidesk_url, v.movidesk_created_at, v.movidesk_last_error, v.active, v.rev
    FROM preventive_visits v LEFT JOIN clients c ON c.id = v.client_id`;

function visitJson(row, today = S.todayIso()) {
  return {
    id: row.id, legacyId: row.legacy_id, clientId: row.client_id, clientName: row.client_name,
    teamId: row.team_id, teamName: TEAMS[row.team_id] || row.team_id,
    referenceDate: row.reference_date, originalDate: row.original_date, scheduledDate: row.scheduled_date,
    completedDate: row.completed_date, technician: row.technician, osNumber: row.os_number,
    ticketNumber: row.ticket_number, summary: row.summary, resolution: row.resolution, problems: row.problems,
    notifiedClient: row.notified_client, overrideDate: row.override_date, rescheduled: row.rescheduled,
    movidesk: {
      ticketId: row.movidesk_ticket_id, protocol: row.movidesk_protocol, url: row.movidesk_url,
      createdAt: iso(row.movidesk_created_at), lastError: row.movidesk_last_error,
    },
    status: S.calculateStatus(row.scheduled_date, row.completed_date, today),
    rev: Number(row.rev),
  };
}

const PLAN_SELECT = `SELECT id, client_id, legacy_id, period_months, start_month, start_year, team_id, movidesk_client_id,
  contacts, status, anchor_date::text AS anchor_date, rev FROM preventive_plans`;

function planJson(plan) {
  return {
    periodMonths: plan.period_months, startMonth: plan.start_month, startYear: plan.start_year,
    teamId: plan.team_id, teamName: TEAMS[plan.team_id], movideskClientId: plan.movidesk_client_id,
    contacts: plan.contacts || [], active: plan.status === 'active', rev: Number(plan.rev),
  };
}

function clientJson(client, plan) {
  return {
    id: client.id, name: client.name, city: client.city, state: client.state, active: client.active,
    legacyId: plan?.legacy_id ?? null, plan: plan ? planJson(plan) : null,
  };
}

function validatePlan(input = {}, full) {
  const out = {};
  const has = (key) => full || Object.prototype.hasOwnProperty.call(input, key);
  if (has('periodMonths')) {
    if (!S.PERIODICITIES.has(input.periodMonths)) throw new ApiError(400, 'validation', 'Periodicidade inválida.');
    out.period_months = input.periodMonths;
  }
  if (has('startMonth')) {
    if (!Number.isInteger(input.startMonth) || input.startMonth < 1 || input.startMonth > 12) throw new ApiError(400, 'validation', 'Mês de início inválido.');
    out.start_month = input.startMonth;
  }
  if (has('startYear')) {
    if (!Number.isInteger(input.startYear) || input.startYear < 2000 || input.startYear > 2100) throw new ApiError(400, 'validation', 'Ano de início inválido.');
    out.start_year = input.startYear;
  }
  if (has('teamId')) {
    if (!TEAMS[input.teamId]) throw new ApiError(400, 'validation', 'Equipe inválida.');
    out.team_id = input.teamId;
  }
  if (has('movideskClientId')) out.movidesk_client_id = String(input.movideskClientId || '').trim();
  if (has('contacts')) {
    const contacts = [];
    for (const contact of input.contacts || []) {
      const email = String(contact?.email || '').trim();
      if (!email) continue;
      if (!email.includes('@')) throw new ApiError(400, 'validation', `E-mail inválido: ${email}`);
      contacts.push({ name: String(contact.name || '').trim(), email, type: contact.type === 'CC' ? 'CC' : 'TO' });
    }
    out.contacts = contacts;
  }
  return out;
}

const isLocked = (v) => Boolean(v.completed_date || v.movidesk_ticket_id || v.notified_client || v.rescheduled);

function checkRev(record, body, current) {
  if (body?.rev === undefined || body?.rev === null) throw new ApiError(400, 'validation', "Informe o 'rev' do registro.");
  if (Number(body.rev) !== Number(record.rev)) {
    throw new ApiError(409, 'conflict', 'Outra pessoa alterou este registro. Os dados foram atualizados.', { current });
  }
}

export function createPreventivesRepository(pool, { movideskConfig = movidesk.movideskConfigFromEnv() } = {}) {
  async function tx(fn) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK]);
      const result = await fn(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      db.release();
    }
  }

  async function history(db, visitId, personId, action, { oldDate = null, newDate = null, details = '', createdAt = null, userName = null } = {}) {
    await db.query(
      `INSERT INTO preventive_history (visit_id, person_id, user_name, action, old_date, new_date, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()))`,
      [visitId, personId, userName, action, oldDate, newDate, details || '', createdAt],
    );
  }

  async function loadHolidays(db) {
    const { rows } = await db.query('SELECT date::text AS date, name, team_ids FROM preventive_holidays');
    return new Map(rows.map((r) => [r.date, { name: r.name, teamIds: r.team_ids || [] }]));
  }

  async function occupied(db, teamId, { excludeClient = null, excludeVisit = null } = {}) {
    const { rows } = await db.query(
      `SELECT scheduled_date::text AS d FROM preventive_visits
        WHERE active AND team_id = $1 AND ($2::text IS NULL OR client_id <> $2) AND ($3::text IS NULL OR id <> $3)`,
      [teamId, excludeClient, excludeVisit],
    );
    return new Set(rows.map((r) => r.d));
  }

  async function getPlanRow(db, clientId, { lock = false } = {}) {
    const { rows } = await db.query(`${PLAN_SELECT} WHERE client_id = $1${lock ? ' FOR UPDATE' : ''}`, [clientId]);
    return rows[0] || null;
  }

  async function requireClient(db, clientId) {
    const client = await siga.getSigaClient(db, clientId);
    if (!client) throw new ApiError(404, 'not_found', 'Cliente não encontrado.');
    return client;
  }

  async function requirePlan(db, clientId, opts) {
    await requireClient(db, clientId);
    const plan = await getPlanRow(db, clientId, opts);
    if (!plan) throw new ApiError(404, 'not_found', 'Este cliente não possui cronograma.');
    return plan;
  }

  async function getVisitRow(db, visitId, { lock = false } = {}) {
    const { rows } = await db.query(`${VISIT_SELECT} WHERE v.id = $1 AND v.active${lock ? ' FOR UPDATE OF v' : ''}`, [visitId]);
    if (!rows.length) throw new ApiError(404, 'not_found', 'Preventiva não encontrada.');
    return rows[0];
  }

  async function insertVisit(db, plan, reference, selected, override, personId, action, reason) {
    const id = newId('pv');
    await db.query(
      `INSERT INTO preventive_visits (id, plan_id, client_id, team_id, reference_date, original_date, scheduled_date, override_date, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8)`,
      [id, plan.id, plan.client_id, plan.team_id, reference, selected, override, personId],
    );
    await history(db, id, personId, action, { newDate: selected, details: reason });
    return id;
  }

  async function generate(db, plan, planned, personId, replace) {
    const sorted = [...planned].sort();
    const first = sorted[0];
    const extra = await loadHolidays(db);
    const custom = new Map(sorted.map((d) => [d.slice(0, 7), d]));
    let replaced = 0;
    let kept = 0;
    if (replace) {
      const { rows } = await db.query(
        `SELECT id, scheduled_date::text AS scheduled_date, completed_date, movidesk_ticket_id, notified_client, rescheduled
           FROM preventive_visits WHERE client_id = $1 AND active AND reference_date >= $2`,
        [plan.client_id, `${first.slice(0, 7)}-01`],
      );
      for (const visit of rows) {
        if (isLocked(visit)) { kept += 1; continue; }
        await db.query('UPDATE preventive_visits SET active = false, rev = rev + 1, updated_at = now(), updated_by = $2 WHERE id = $1', [visit.id, personId]);
        await history(db, visit.id, personId, 'schedule_replaced', { oldDate: visit.scheduled_date, details: 'Cronograma replanejado' });
        replaced += 1;
      }
    }
    const { rows: takenRows } = await db.query(
      `SELECT DISTINCT to_char(reference_date, 'YYYY-MM') AS m FROM preventive_visits WHERE client_id = $1 AND active`, [plan.client_id],
    );
    const taken = new Set(takenRows.map((r) => r.m));
    const busy = await occupied(db, plan.team_id);
    let created = 0;
    for (const requested of S.generateRequestedDates(first, plan.period_months, S.horizonEnd())) {
      const key = requested.slice(0, 7);
      if (taken.has(key)) continue;
      const isCustom = custom.has(key);
      const target = custom.get(key) || requested;
      const choice = S.nearestAvailable(target, busy, { teamId: plan.team_id, extra, allowOverride: isCustom });
      const override = isCustom && S.isRestricted(choice.selected, busy, plan.team_id, extra);
      await insertVisit(db, plan, requested, choice.selected, override, personId, 'schedule_created', choice.reason);
      busy.add(choice.selected);
      taken.add(key);
      created += 1;
    }
    await db.query('UPDATE preventive_plans SET anchor_date = $2 WHERE id = $1', [plan.id, first]);
    return { visitsCreated: created, visitsKept: kept, visitsReplaced: replaced };
  }

  async function insertPlan(db, clientId, planInput, personId, { legacyId = null, status = 'active' } = {}) {
    const values = validatePlan(planInput, true);
    const id = newId('pp');
    await db.query(
      `INSERT INTO preventive_plans (id, client_id, legacy_id, period_months, start_month, start_year, team_id, movidesk_client_id, contacts, status, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, clientId, legacyId, values.period_months, values.start_month, values.start_year, values.team_id,
        values.movidesk_client_id, JSON.stringify(values.contacts), status, personId],
    );
    await db.query('DELETE FROM preventive_dismissed_clients WHERE client_id = $1', [clientId]);
    return getPlanRow(db, clientId);
  }

  async function extendAll(db, personId = null) {
    const end = S.horizonEnd();
    const extra = await loadHolidays(db);
    const { rows: plans } = await db.query(`${PLAN_SELECT} WHERE status = 'active' AND anchor_date IS NOT NULL`);
    let created = 0;
    const busyByTeam = new Map();
    for (const plan of plans) {
      const { rows } = await db.query(
        `SELECT DISTINCT to_char(reference_date, 'YYYY-MM') AS m FROM preventive_visits WHERE client_id = $1 AND active`, [plan.client_id],
      );
      if (!rows.length) continue;
      const taken = new Set(rows.map((r) => r.m));
      const last = [...taken].sort().pop();
      if (!busyByTeam.has(plan.team_id)) busyByTeam.set(plan.team_id, await occupied(db, plan.team_id));
      const busy = busyByTeam.get(plan.team_id);
      for (const requested of S.generateRequestedDates(plan.anchor_date, plan.period_months, end)) {
        const key = requested.slice(0, 7);
        if (key <= last || taken.has(key)) continue;
        const choice = S.nearestAvailable(requested, busy, { teamId: plan.team_id, extra });
        await insertVisit(db, plan, requested, choice.selected, false, personId, 'schedule_extended', choice.reason);
        busy.add(choice.selected);
        created += 1;
      }
    }
    await db.query(
      `INSERT INTO preventive_meta (key, value) VALUES ('last_extension', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [S.todayIso()],
    );
    return created;
  }

  async function recordTicket(db, visitId, ticket, personId, note) {
    await db.query(
      `UPDATE preventive_visits SET movidesk_ticket_id = $2, movidesk_protocol = $3, movidesk_url = $4, movidesk_created_at = now(),
              movidesk_created_by = $5, movidesk_last_error = NULL, rev = rev + 1, updated_at = now(), updated_by = $5 WHERE id = $1`,
      [visitId, ticket.ticketId, ticket.protocol, ticket.url, personId],
    );
    await history(db, visitId, personId, 'movidesk_ticket_created',
      { details: `Ticket ${ticket.ticketId}; protocolo ${ticket.protocol}${note ? ` (${note})` : ''}` });
  }

  async function recordTicketError(visitId, personId, message) {
    await tx(async (db) => {
      await db.query('UPDATE preventive_visits SET movidesk_last_error = $2, rev = rev + 1, updated_at = now(), updated_by = $3 WHERE id = $1',
        [visitId, message.slice(0, 2000), personId]);
      await history(db, visitId, personId, 'movidesk_error', { details: message.slice(0, 2000) });
    });
  }

  return {
    // ---------- inicialização ----------
    async ensureSchema({ seedHolidays = true } = {}) {
      await pool.query(SCHEMA_SQL);
      if (seedHolidays) {
        const { rows } = await pool.query('SELECT count(*)::int AS n FROM preventive_holidays');
        if (!rows[0].n) {
          const year = Number(S.todayIso().slice(0, 4));
          for (let y = year - 3; y <= year + 8; y += 1) {
            await pool.query(`INSERT INTO preventive_holidays (date, name, team_ids) VALUES
              ($1, 'Aniversário de São Paulo', '{SP}'), ($2, 'Revolução Constitucionalista (SP)', '{SP}') ON CONFLICT DO NOTHING`,
            [`${y}-01-25`, `${y}-07-09`]);
          }
        }
      }
    },

    async extendIfNeeded() {
      const { rows } = await pool.query("SELECT value FROM preventive_meta WHERE key = 'last_extension'");
      if (rows[0]?.value === S.todayIso()) return 0;
      return tx((db) => extendAll(db, null));
    },

    // ---------- pessoas ----------
    getPerson: (personId) => siga.getPerson(pool, personId),

    // ---------- referência ----------
    async holidays(from = '0000-01-01', to = '9999-12-31') {
      const { rows } = await pool.query(
        'SELECT date::text AS date, name, team_ids FROM preventive_holidays WHERE date BETWEEN $1 AND $2 ORDER BY date',
        [parseDate(from, 'from'), parseDate(to, 'to')],
      );
      return rows.map((r) => ({ date: r.date, name: r.name, teamIds: r.team_ids || [] }));
    },

    async dashboard(year, month) {
      const { rows } = await pool.query(
        `${VISIT_SELECT} JOIN preventive_plans p ON p.id = v.plan_id
          WHERE v.active AND p.status = 'active' AND extract(year FROM v.scheduled_date) = $1
            AND ($2::int IS NULL OR extract(month FROM v.scheduled_date) = $2)`,
        [year, month ?? null],
      );
      const counts = Object.fromEntries(S.STATUS_NAMES.map((name) => [name, 0]));
      const today = S.todayIso();
      for (const row of rows) counts[S.calculateStatus(row.scheduled_date, row.completed_date, today)] += 1;
      counts.Total = rows.length;
      return counts;
    },

    // ---------- clientes ----------
    async listClients(includeInactive) {
      const clients = new Map((await siga.listSigaClients(pool)).map((c) => [c.id, c]));
      const { rows } = await pool.query(`${PLAN_SELECT}${includeInactive ? '' : " WHERE status = 'active'"}`);
      return rows.filter((p) => clients.has(p.client_id))
        .map((p) => clientJson(clients.get(p.client_id), p))
        .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name), 'pt-BR'));
    },

    async getClient(clientId) {
      const client = await requireClient(pool, clientId);
      const plan = await getPlanRow(pool, clientId);
      if (!plan) throw new ApiError(404, 'not_found', 'Este cliente não possui cronograma.');
      return clientJson(client, plan);
    },

    async pendingClients() {
      const { rows: planned } = await pool.query('SELECT client_id FROM preventive_plans UNION SELECT client_id FROM preventive_dismissed_clients');
      const skip = new Set(planned.map((r) => r.client_id));
      return (await siga.listSigaClients(pool))
        .filter((c) => c.active && !skip.has(c.id))
        .map((c) => ({ id: c.id, name: c.name, city: c.city, state: c.state, createdAt: iso(c.created_at) }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    dismissPending: (clientId, reason, personId) => tx(async (db) => {
      if (!String(reason || '').trim()) throw new ApiError(400, 'validation', 'Informe o motivo.');
      await requireClient(db, clientId);
      if (await getPlanRow(db, clientId)) throw new ApiError(409, 'plan_exists', 'Este cliente já possui cronograma.');
      await db.query(
        `INSERT INTO preventive_dismissed_clients (client_id, reason, dismissed_by) VALUES ($1, $2, $3)
         ON CONFLICT (client_id) DO UPDATE SET reason = excluded.reason, dismissed_by = excluded.dismissed_by, dismissed_at = now()`,
        [clientId, String(reason).trim(), personId],
      );
      return { ok: true };
    }),

    createClient: (body, personId) => tx(async (db) => {
      const planned = (body.plannedDates || []).map((d) => parseDate(d, 'plannedDates'));
      if (!planned.length) throw new ApiError(400, 'validation', 'Informe pelo menos uma data no planejamento.');
      validatePlan(body.plan || {}, true);
      let client;
      if (body.clientId) {
        client = await requireClient(db, body.clientId);
      } else {
        const name = String(body.client?.name || '').trim();
        if (!name) throw new ApiError(400, 'validation', 'Informe o nome do cliente.');
        const existing = (await siga.listSigaClients(db)).find((c) => normalize(c.name) === normalize(name));
        if (existing) {
          const hasPlan = Boolean(await getPlanRow(db, existing.id));
          throw new ApiError(409, 'client_exists', 'Já existe um cliente com este nome no SIGA.', { existing: { id: existing.id, name: existing.name, hasPlan } });
        }
        client = await siga.createSigaClient(db, { name, city: body.client?.city || '', state: body.client?.state || '' }, personId);
      }
      if (await getPlanRow(db, client.id)) throw new ApiError(409, 'plan_exists', 'Este cliente já possui cronograma de preventivas.');
      const plan = await insertPlan(db, client.id, body.plan, personId);
      const stats = await generate(db, plan, planned, personId, false);
      return { ...clientJson(client, await getPlanRow(db, client.id)), ...stats };
    }),

    updateClient: (clientId, body, personId) => tx(async (db) => {
      const client = await requireClient(db, clientId);
      const plan = await requirePlan(db, clientId, { lock: true });
      checkRev(plan, body, clientJson(client, plan));
      const name = String(body.name || client.name).trim();
      if (normalize(name) !== normalize(client.name) || name !== client.name) {
        const other = (await siga.listSigaClients(db)).find((c) => c.id !== clientId && normalize(c.name) === normalize(name));
        if (other) throw new ApiError(409, 'client_exists', 'Já existe outro cliente com este nome no SIGA.', { existing: { id: other.id, name: other.name } });
        if (name !== client.name) await siga.renameSigaClient(db, clientId, name, personId);
      }
      const input = Object.fromEntries(Object.entries(body.plan || {}).filter(([k]) => ['movideskClientId', 'contacts'].includes(k)));
      const values = validatePlan(input, false);
      await db.query(
        `UPDATE preventive_plans SET movidesk_client_id = coalesce($2, movidesk_client_id), contacts = coalesce($3::jsonb, contacts),
                rev = rev + 1, updated_at = now(), updated_by = $4 WHERE client_id = $1`,
        [clientId, values.movidesk_client_id ?? null, values.contacts ? JSON.stringify(values.contacts) : null, personId],
      );
      return clientJson({ ...client, name }, await getPlanRow(db, clientId));
    }),

    replanSchedule: (clientId, body, personId) => tx(async (db) => {
      const client = await requireClient(db, clientId);
      const plan = await requirePlan(db, clientId, { lock: true });
      checkRev(plan, body, clientJson(client, plan));
      const planned = (body.plannedDates || []).map((d) => parseDate(d, 'plannedDates'));
      if (!planned.length) throw new ApiError(400, 'validation', 'Informe pelo menos uma data no planejamento.');
      const input = Object.fromEntries(Object.entries(body.plan || {}).filter(([k]) => ['periodMonths', 'startMonth', 'startYear', 'teamId'].includes(k)));
      const values = validatePlan(input, false);
      await db.query(
        `UPDATE preventive_plans SET period_months = coalesce($2, period_months), start_month = coalesce($3, start_month),
                start_year = coalesce($4, start_year), team_id = coalesce($5, team_id), rev = rev + 1, updated_at = now(), updated_by = $6
          WHERE client_id = $1`,
        [clientId, values.period_months ?? null, values.start_month ?? null, values.start_year ?? null, values.team_id ?? null, personId],
      );
      const stats = await generate(db, await getPlanRow(db, clientId), planned, personId, true);
      return { ...clientJson(client, await getPlanRow(db, clientId)), ...stats };
    }),

    setClientActive: (clientId, active, personId) => tx(async (db) => {
      const client = await requireClient(db, clientId);
      await requirePlan(db, clientId);
      await db.query('UPDATE preventive_plans SET status = $2, rev = rev + 1, updated_at = now(), updated_by = $3 WHERE client_id = $1',
        [clientId, active ? 'active' : 'inactive', personId]);
      return clientJson(client, await getPlanRow(db, clientId));
    }),

    // ---------- visitas ----------
    async listVisits({ from, to, clientId, teamId }) {
      if (!from || !to) throw new ApiError(400, 'validation', "Informe 'from' e 'to'.");
      parseDate(from, 'from');
      parseDate(to, 'to');
      if ((S.parseIso(to) - S.parseIso(from)) / 86400000 > 6 * 366) throw new ApiError(400, 'validation', 'Período máximo de 6 anos.');
      const { rows } = await pool.query(
        `${VISIT_SELECT} JOIN preventive_plans p ON p.id = v.plan_id
          WHERE v.active AND v.scheduled_date BETWEEN $1 AND $2
            AND ($3::text IS NULL OR v.client_id = $3) AND ($4::text IS NULL OR v.team_id = $4)
            AND ($3::text IS NOT NULL OR p.status = 'active')
          ORDER BY v.scheduled_date`,
        [from, to, clientId || null, teamId || null],
      );
      const today = S.todayIso();
      return rows.map((r) => visitJson(r, today))
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || normalize(a.clientName).localeCompare(normalize(b.clientName), 'pt-BR'));
    },

    async occupiedDates(teamId, excludeClient, excludeVisit) {
      if (!TEAMS[teamId]) throw new ApiError(400, 'validation', 'Equipe inválida.');
      return [...await occupied(pool, teamId, { excludeClient: excludeClient || null, excludeVisit: excludeVisit || null })].sort();
    },

    async getVisit(visitId) {
      return visitJson(await getVisitRow(pool, visitId));
    },

    async visitHistory(visitId) {
      await getVisitRow(pool, visitId);
      const { rows } = await pool.query(
        `SELECT h.created_at, coalesce(h.user_name, pe.name, '') AS user_name, h.action, h.old_date::text AS old_date,
                h.new_date::text AS new_date, h.details
           FROM preventive_history h LEFT JOIN people pe ON pe.id = h.person_id
          WHERE h.visit_id = $1 ORDER BY h.created_at DESC, h.id DESC`,
        [visitId],
      );
      return rows.map((r) => ({ createdAt: iso(r.created_at), userName: r.user_name, action: r.action,
        oldDate: r.old_date, newDate: r.new_date, details: r.details }));
    },

    reschedule: (visitId, body, personId) => tx(async (db) => {
      const visit = await getVisitRow(db, visitId, { lock: true });
      checkRev(visit, body, visitJson(visit));
      const reason = String(body.reason || '').trim();
      if (!reason) throw new ApiError(400, 'validation', 'Informe o motivo do reagendamento.');
      const newDate = parseDate(body.date, 'date');
      const extra = await loadHolidays(db);
      const busy = await occupied(db, visit.team_id, { excludeVisit: visitId });
      const restricted = S.isRestricted(newDate, busy, visit.team_id, extra);
      if (restricted && !body.override) {
        const suggestion = S.nearestAvailable(newDate, busy, { teamId: visit.team_id, extra }).selected;
        throw new ApiError(422, 'date_restricted', 'A data é final de semana, feriado ou já possui preventiva desta equipe.', { suggestedDate: suggestion });
      }
      await db.query(
        `UPDATE preventive_visits SET scheduled_date = $2, override_date = $3, rescheduled = true, rev = rev + 1, updated_at = now(), updated_by = $4
          WHERE id = $1`,
        [visitId, newDate, restricted, personId],
      );
      await history(db, visitId, personId, 'reschedule', { oldDate: visit.scheduled_date, newDate, details: reason });
      return visitJson(await getVisitRow(db, visitId));
    }),

    saveExecution: (visitId, body, personId) => tx(async (db) => {
      const visit = await getVisitRow(db, visitId, { lock: true });
      checkRev(visit, body, visitJson(visit));
      let completed = body.completedDate || null;
      if (completed) {
        completed = parseDate(completed, 'completedDate');
        if (completed > S.todayIso()) throw new ApiError(400, 'validation', 'A data da realização não pode estar no futuro.');
      }
      const text = (key) => String(body[key] ?? '').trim();
      await db.query(
        `UPDATE preventive_visits SET completed_date = $2, technician = $3, os_number = $4, ticket_number = $5, summary = $6,
                resolution = $7, problems = $8, rev = rev + 1, updated_at = now(), updated_by = $9 WHERE id = $1`,
        [visitId, completed, text('technician'), text('osNumber'), text('ticketNumber'), text('summary'), text('resolution'), text('problems'), personId],
      );
      await history(db, visitId, personId, 'execution_saved', { newDate: completed, details: 'Execução registrada/atualizada' });
      return visitJson(await getVisitRow(db, visitId));
    }),

    setNotified: (visitId, body, personId, notified) => tx(async (db) => {
      const visit = await getVisitRow(db, visitId, { lock: true });
      checkRev(visit, body, visitJson(visit));
      const reason = String(body.reason || '').trim();
      if (!notified) {
        if (!reason) throw new ApiError(400, 'validation', 'Informe o motivo para desfazer a notificação.');
        if (!visit.notified_client) throw new ApiError(400, 'validation', 'Esta atividade não está marcada como cliente notificado.');
      }
      await db.query('UPDATE preventive_visits SET notified_client = $2, rev = rev + 1, updated_at = now(), updated_by = $3 WHERE id = $1',
        [visitId, notified, personId]);
      await history(db, visitId, personId, notified ? 'client_notified' : 'client_notification_undone',
        { details: notified ? 'Mensagem preparada no Outlook' : reason });
      return visitJson(await getVisitRow(db, visitId));
    }),

    /** Ticket idempotente: trava por visita, procura pela tag, só então cria. */
    async movideskTicket(visitId, personId) {
      const lockDb = await pool.connect();
      const lockKey = `preventive-ticket:${visitId}`;
      try {
        await lockDb.query('SELECT pg_advisory_lock(hashtext($1))', [lockKey]);
        const row = await getVisitRow(pool, visitId);
        const visit = visitJson(row);
        if (visit.movidesk.ticketId) {
          return { status: 200, body: { ticketId: visit.movidesk.ticketId, protocol: visit.movidesk.protocol, url: visit.movidesk.url, created: false, visit } };
        }
        const plan = await requirePlan(pool, row.client_id);
        if (!plan.movidesk_client_id) throw new ApiError(400, 'validation', 'O cliente não possui o código de referência do Movidesk.');
        let found = null;
        let created = false;
        try {
          const payload = movidesk.buildTicketPayload(visit, planJson(plan), row.client_name, movideskConfig);
          for (const tag of movidesk.ticketTags(visit)) {
            found = await movidesk.findTicketByTag(movideskConfig, tag);
            if (found) break;
          }
          if (!found) {
            found = await movidesk.createTicket(movideskConfig, payload);
            created = true;
          }
        } catch (error) {
          if (!(error instanceof movidesk.MovideskError)) throw error;
          await recordTicketError(visitId, personId, error.message);
          throw new ApiError(502, 'movidesk_error', error.message);
        }
        const ticket = { ...found, protocol: found.protocol || found.ticketId, url: movidesk.ticketUrl(movideskConfig, found.ticketId) };
        await tx((db) => recordTicket(db, visitId, ticket, personId, created ? '' : 'Ticket já existente localizado pela tag'));
        return { status: created ? 201 : 200, body: { ...ticket, created, visit: visitJson(await getVisitRow(pool, visitId)) } };
      } finally {
        await lockDb.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]).catch(() => {});
        lockDb.release();
      }
    },

    // ---------- importação da V3 ----------
    async importV3(data, dryRun, personId) {
      if (data?.format !== 'preventiva-v3-export') throw new ApiError(400, 'validation', 'Arquivo de importação inválido.');
      const report = { dryRun, clientsMatched: 0, clientsCreated: 0, plansCreated: 0, visitsImported: 0, historyImported: 0, skipped: 0, matches: [] };
      const DRY_RUN = Symbol('dry-run');
      try {
        await tx(async (db) => {
          const byName = new Map((await siga.listSigaClients(db)).map((c) => [normalize(c.name), c]));
          const { rows: legacyRows } = await db.query('SELECT legacy_id FROM preventive_plans WHERE legacy_id IS NOT NULL');
          const legacyPlans = new Set(legacyRows.map((r) => r.legacy_id));
          const clientMap = new Map();
          for (const item of data.clients || []) {
            const legacy = Number(item.legacyId);
            if (legacyPlans.has(legacy)) {
              report.skipped += 1;
              report.matches.push({ legacyId: legacy, name: item.name, action: 'already_imported' });
              continue;
            }
            let client = byName.get(normalize(item.name));
            let action = 'matched';
            if (client) {
              report.clientsMatched += 1;
            } else {
              client = await siga.createSigaClient(db, { name: String(item.name).trim() }, personId);
              byName.set(normalize(item.name), client);
              report.clientsCreated += 1;
              action = 'created';
            }
            if (await getPlanRow(db, client.id)) {
              report.skipped += 1;
              report.matches.push({ legacyId: legacy, name: item.name, sigaClientId: client.id, action: 'plan_exists' });
              continue;
            }
            const year = Number(S.todayIso().slice(0, 4));
            await insertPlan(db, client.id, {
              periodMonths: item.periodMonths, startMonth: item.startMonth || 1, startYear: item.startYear || year,
              teamId: TEAM_BY_NAME[item.teamName] || 'SP', movideskClientId: item.movideskClientId || '', contacts: item.contacts || [],
            }, personId, { legacyId: legacy, status: item.active === false ? 'inactive' : 'active' });
            clientMap.set(legacy, client.id);
            report.plansCreated += 1;
            report.matches.push({ legacyId: legacy, name: item.name, sigaClientId: client.id, action });
          }
          const visitMap = new Map();
          for (const item of data.activities || []) {
            const clientId = clientMap.get(Number(item.clientLegacyId));
            if (!clientId) continue;
            const plan = await getPlanRow(db, clientId);
            const id = newId('pv');
            await db.query(
              `INSERT INTO preventive_visits (id, plan_id, client_id, legacy_id, team_id, reference_date, original_date, scheduled_date, completed_date,
                 technician, os_number, ticket_number, summary, resolution, problems, notified_client, override_date, rescheduled,
                 movidesk_ticket_id, movidesk_protocol, movidesk_url, movidesk_created_at, movidesk_last_error, updated_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::timestamptz,$23,$24)`,
              [id, plan.id, clientId, Number(item.legacyId), TEAM_BY_NAME[item.teamName] || plan.team_id, item.referenceDate, item.originalDate,
                item.scheduledDate, item.completedDate || null, item.technician || '', item.osNumber || '', item.ticketNumber || '',
                item.summary || '', item.resolution || '', item.problems || '', Boolean(item.notifiedClient), Boolean(item.overrideDate),
                Boolean(item.rescheduled), item.movideskTicketId || null, item.movideskProtocol || null, item.movideskUrl || null,
                item.movideskCreatedAt || null, item.movideskLastError || null, personId],
            );
            visitMap.set(Number(item.legacyId), id);
            report.visitsImported += 1;
          }
          for (const legacy of clientMap.keys()) {
            const clientId = clientMap.get(legacy);
            await db.query(
              `UPDATE preventive_plans SET anchor_date = (SELECT max(reference_date) FROM preventive_visits WHERE client_id = $1 AND active)
                WHERE client_id = $1`, [clientId],
            );
          }
          for (const item of data.history || []) {
            const visitId = visitMap.get(Number(item.activityLegacyId));
            if (!visitId) continue;
            await history(db, visitId, null, item.action || 'imported', {
              oldDate: item.oldDate || null, newDate: item.newDate || null, details: `[V3] ${item.details || ''}`.trim(),
              createdAt: item.createdAt || null, userName: item.userName || null,
            });
            report.historyImported += 1;
          }
          if (dryRun) throw DRY_RUN;
          await extendAll(db, personId);
        });
      } catch (error) {
        if (error !== DRY_RUN) throw error;
      }
      return report;
    },

    extendAll: () => tx((db) => extendAll(db, null)),
  };
}
