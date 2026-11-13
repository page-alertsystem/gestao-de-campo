// SOMENTE PARA TESTE. Servidor mínimo que imita o SIGA (login, health, sessões) e um Movidesk falso,
// montando o módulo real da Agenda de Preventiva sobre um PostgreSQL de teste.
//
//   DATABASE_URL=postgres://... node dev/harness.mjs --port 8787
//   PREVENTIVA_CONTRACT_URL=http://127.0.0.1:8787 python -m pytest tests_v4/test_contract.py
//
// Rotas extras só de teste: POST /__test/reset, POST /__test/movidesk-mode, GET /__test/movidesk-tickets.

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { createPreventivesModule } from '../server/preventives/index.mjs';
import { nearestAvailable, todayIso } from '../server/preventives/scheduler.mjs';

const port = Number(process.argv[process.argv.indexOf('--port') + 1] || 8787);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const sha = (value) => createHash('sha256').update(value).digest('hex');
const hashPassword = (password) => sha(`gio-alert-v1:${password}`); // mesmo esquema do SIGA hoje

// ---------- Movidesk falso ----------
const fake = { mode: 'ok', tickets: [], next: 50000 };

const preventives = createPreventivesModule({
  pool,
  movideskConfig: {
    token: 'token-falso', apiBase: `http://127.0.0.1:${port}/__movidesk`, createdById: 'GERADOR', ticketType: 2,
    ticketUrl: 'https://alertsystem.movidesk.example/Ticket/Edit/{id}', timeoutMs: 5000,
  },
  logger: { info() {}, error: console.error },
});

const send = (response, status, payload) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
};
async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function reset() {
  await pool.query(`DROP TABLE IF EXISTS preventive_history, preventive_visits, preventive_plans, preventive_dismissed_clients,
    preventive_holidays, preventive_meta, people, clients, sessions, change_log, gio_meta CASCADE`);
  await pool.query(readFileSync(new URL('./siga-base.sql', import.meta.url), 'utf8'));
  await preventives.repo.ensureSchema();
  for (const [id, name, email, groups] of [
    ['p_1', 'Service Desk Teste', 'servicedesk@teste.local', ['Service Desk']],
    ['p_2', 'Administrador Teste', 'admin@teste.local', ['Administrador']],
    ['p_3', 'Técnico Teste', 'tecnico@teste.local', ['Técnico']],
  ]) {
    await pool.query('INSERT INTO people (id, data, password_hash) VALUES ($1, $2, $3)', [id, { name, email, groups }, hashPassword('teste123')]);
  }
  for (const [id, name, city, state] of [
    ['c_1', 'Cliente Exemplo Alfa', 'São Paulo', 'SP'], ['c_2', 'Cliente Exemplo Beta', 'Belo Horizonte', 'MG'],
    ['c_3', 'Cliente Exemplo Gama', 'Campinas', 'SP'], ['c_4', 'Cliente Exemplo Delta', 'Curitiba', 'PR'],
  ]) {
    await pool.query('INSERT INTO clients (id, data) VALUES ($1, $2)', [id, { id, name, city, state, active: true }]);
  }
  const year = Number(todayIso().slice(0, 4));
  const business = (day, months, team) => months.map((m) => nearestAvailable(`${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`, new Set(), { teamId: team }).selected);
  await preventives.repo.createClient({ clientId: 'c_1', plannedDates: business(5, [1, 4, 7, 10], 'SP'), plan: {
    periodMonths: 3, startMonth: 1, startYear: year, teamId: 'SP', movideskClientId: 'CLI-ALFA',
    contacts: [{ name: 'Contato Alfa', email: 'contato@alfa.example', type: 'TO' }] } }, 'p_2');
  await preventives.repo.createClient({ clientId: 'c_2', plannedDates: business(6, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'BR'), plan: {
    periodMonths: 1, startMonth: 1, startYear: year, teamId: 'BR', movideskClientId: '',
    contacts: [{ name: '', email: 'contato@beta.example', type: 'TO' }] } }, 'p_2');
  fake.mode = 'ok';
  fake.tickets = [];
}

async function fakeMovidesk(request, response, url) {
  if (url.searchParams.get('token') !== 'token-falso') return send(response, 401, { error: 'token' });
  if (request.method === 'GET') {
    const filter = url.searchParams.get('$filter') || '';
    const tag = (filter.match(/t eq '(.*)'\)$/) || [])[1]?.replace(/''/g, "'");
    return send(response, 200, fake.tickets.filter((t) => t.tags.includes(tag)).map((t) => ({ id: t.id, protocol: t.protocol })));
  }
  const payload = await readJson(request);
  if (fake.mode === 'fail') return send(response, 500, { error: 'falha simulada' });
  fake.next += 1;
  const ticket = { id: fake.next, protocol: String(fake.next), tags: payload.tags || [], payload };
  fake.tickets.push(ticket);
  if (fake.mode === 'timeout_after_create') return send(response, 504, { error: 'gateway timeout simulado' });
  return send(response, 200, { id: ticket.id, protocol: ticket.protocol });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname === '/api/health') return send(response, 200, { status: 'online', storageType: 'PostgreSQL', movideskConfigured: true });
    if (url.pathname.startsWith('/__movidesk/tickets')) return await fakeMovidesk(request, response, url);
    if (url.pathname.startsWith('/__dev/')) { // página de teste do menu web (dev/web/dist)
      const name = url.pathname.slice('/__dev/'.length) || 'index.html';
      if (!/^[\w.-]+$/.test(name)) return send(response, 404, {});
      const types = { html: 'text/html', js: 'text/javascript', css: 'text/css' };
      try {
        const file = readFileSync(new URL(`./web/dist/${name}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': `${types[name.split('.').pop()] || 'application/octet-stream'}; charset=utf-8` });
        return response.end(file);
      } catch { return send(response, 404, {}); }
    }
    if (url.pathname === '/__test/reset') { await reset(); return send(response, 200, { ok: true }); }
    if (url.pathname === '/__test/movidesk-mode') { fake.mode = (await readJson(request)).mode; return send(response, 200, { ok: true }); }
    if (url.pathname === '/__test/movidesk-tickets') return send(response, 200, { count: fake.tickets.length });
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      const { email, password } = await readJson(request);
      const { rows } = await pool.query('SELECT id, password_hash FROM people WHERE email = lower(trim($1)) AND deleted_at IS NULL', [email || '']);
      if (!rows.length || rows[0].password_hash !== hashPassword(password || '')) return send(response, 401, { error: 'E-mail ou senha inválidos.' });
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 12 * 3600 * 1000);
      await pool.query('INSERT INTO sessions (token_hash, person_id, expires_at) VALUES ($1, $2, $3)', [sha(token), rows[0].id, expiresAt]);
      return send(response, 200, { token, expiresAt: expiresAt.toISOString() });
    }
    const auth = request.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const { rows } = await pool.query('SELECT person_id FROM sessions WHERE token_hash = $1 AND expires_at > now()', [sha(token)]);
    if (!rows.length) return send(response, 401, { error: 'Sessão expirada.', code: 'unauthorized' });
    const session = { personId: rows[0].person_id };
    if (url.pathname === '/api/auth/logout') {
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha(token)]);
      return send(response, 200, { ok: true });
    }
    if (url.pathname.startsWith('/api/v1/preventives')) return await preventives.handle(request, response, session, url);
    return send(response, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    console.error(error);
    return send(response, 500, { error: String(error) });
  }
});

await reset();
await preventives.start();
server.listen(port, '127.0.0.1', () => console.log(`harness em http://127.0.0.1:${port}`));
