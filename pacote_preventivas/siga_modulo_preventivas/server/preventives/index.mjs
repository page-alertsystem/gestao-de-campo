// Agenda de Preventiva — módulo do servidor do SIGA.
//
// Integração no server/local-server.mjs (depois da verificação de sessão, antes do 404):
//
//   import { createPreventivesModule } from './preventives/index.mjs';
//   const preventives = createPreventivesModule({ pool, sendJson, readJsonBody });
//   await preventives.start();                      // cria as tabelas e liga a extensão diária
//   ...
//   if (url.pathname.startsWith('/api/v1/preventives')) {
//     return await preventives.handle(request, response, session, url);
//   }
//
// Rotas e regras: docs/ESQUEMA_API_PREVENTIVAS.md.

import { ApiError, TEAMS, createPreventivesRepository } from './repository.mjs';
import { ALLOWED_PROFILES, IMPORT_PROFILES, personIdFromSession } from './siga-adapter.mjs';
import { movideskConfigFromEnv } from './movidesk.mjs';
import { nowIso, todayIso } from './scheduler.mjs';

export const API_VERSION = '1.0';
export const PREFIX = '/api/v1/preventives';

const defaultSendJson = (response, status, payload) => {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(body);
};

async function defaultReadJsonBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new ApiError(413, 'validation', 'Requisição grande demais.');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

export function createPreventivesModule({
  pool,
  sendJson = defaultSendJson,
  readJsonBody = defaultReadJsonBody,
  movideskConfig = movideskConfigFromEnv(),
  minDesktopVersion = process.env.PREVENTIVA_MIN_DESKTOP_VERSION || '4.0.0',
  bodyLimit = 25 * 1024 * 1024, // importação da V3 pode ser grande
  rateLimitPerMinute = Number(process.env.PREVENTIVA_RATE_LIMIT || 240),
  logger = console,
} = {}) {
  const repo = createPreventivesRepository(pool, { movideskConfig });
  const hits = new Map();
  let timer = null;

  function rateLimit(key) {
    const minute = Math.floor(Date.now() / 60000);
    const entry = hits.get(key);
    if (!entry || entry.minute !== minute) {
      hits.set(key, { minute, count: 1 });
      if (hits.size > 5000) hits.clear();
      return;
    }
    entry.count += 1;
    if (entry.count > rateLimitPerMinute) throw new ApiError(429, 'rate_limited', 'Muitas requisições. Aguarde um minuto.');
  }

  async function body(request) {
    try {
      const value = await readJsonBody(request, bodyLimit);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, 'validation', 'JSON inválido.');
    }
  }

  async function route(request, url, person) {
    const method = request.method;
    const sub = url.pathname.slice(PREFIX.length).replace(/\/+$/, '') || '/';
    const q = Object.fromEntries(url.searchParams.entries());
    const actor = person.id;
    let m;

    if (sub === '/me' && method === 'GET') {
      return [200, {
        person: { id: person.id, name: person.name, email: person.email, profiles: person.profiles },
        canAccess: true, canImport: person.profiles.some((p) => IMPORT_PROFILES.includes(p)),
        apiVersion: API_VERSION, minDesktopVersion, serverTime: nowIso(), timezone: 'America/Sao_Paulo',
      }];
    }
    if (sub === '/teams' && method === 'GET') return [200, Object.entries(TEAMS).map(([id, name]) => ({ id, name }))];
    if (sub === '/holidays' && method === 'GET') return [200, await repo.holidays(q.from || '1900-01-01', q.to || '2999-12-31')];
    if (sub === '/dashboard' && method === 'GET') {
      return [200, await repo.dashboard(Number(q.year || todayIso().slice(0, 4)), q.month ? Number(q.month) : null)];
    }

    if (sub === '/clients' && method === 'GET') return [200, await repo.listClients(q.includeInactive === 'true')];
    if (sub === '/clients/pending' && method === 'GET') return [200, await repo.pendingClients()];
    if (sub === '/clients' && method === 'POST') return [201, await repo.createClient(await body(request), actor)];
    if ((m = sub.match(/^\/clients\/([^/]+)$/))) {
      const id = decodeURIComponent(m[1]);
      if (method === 'GET') return [200, await repo.getClient(id)];
      if (method === 'PUT') return [200, await repo.updateClient(id, await body(request), actor)];
    }
    if ((m = sub.match(/^\/clients\/([^/]+)\/(schedule|active|dismiss)$/))) {
      const id = decodeURIComponent(m[1]);
      const action = m[2];
      if (action === 'schedule' && method === 'PUT') return [200, await repo.replanSchedule(id, await body(request), actor)];
      if (action === 'active' && method === 'POST') return [200, await repo.setClientActive(id, Boolean((await body(request)).active), actor)];
      if (action === 'dismiss' && method === 'POST') return [200, await repo.dismissPending(id, (await body(request)).reason, actor)];
    }

    if (sub === '/visits' && method === 'GET') return [200, await repo.listVisits(q)];
    if (sub === '/visits/occupied' && method === 'GET') return [200, await repo.occupiedDates(q.teamId, q.excludeClientId, q.excludeVisitId)];
    if ((m = sub.match(/^\/visits\/([^/]+)(\/history|\/reschedule|\/execution|\/notified|\/notified\/undo|\/movidesk-ticket)?$/))) {
      const id = decodeURIComponent(m[1]);
      const action = m[2] || '';
      if (!action && method === 'GET') return [200, await repo.getVisit(id)];
      if (action === '/history' && method === 'GET') return [200, await repo.visitHistory(id)];
      if (action === '/reschedule' && method === 'POST') return [200, await repo.reschedule(id, await body(request), actor)];
      if (action === '/execution' && method === 'PUT') return [200, await repo.saveExecution(id, await body(request), actor)];
      if (action === '/notified' && method === 'POST') return [200, await repo.setNotified(id, await body(request), actor, true)];
      if (action === '/notified/undo' && method === 'POST') return [200, await repo.setNotified(id, await body(request), actor, false)];
      if (action === '/movidesk-ticket' && method === 'POST') {
        const result = await repo.movideskTicket(id, actor);
        return [result.status, result.body];
      }
    }

    if (sub === '/import/v3' && method === 'POST') {
      if (!person.profiles.some((p) => IMPORT_PROFILES.includes(p))) throw new ApiError(403, 'forbidden', 'Somente o Administrador pode importar dados.');
      const payload = await body(request);
      return [200, await repo.importV3(payload.data || {}, payload.dryRun !== false, actor)];
    }
    throw new ApiError(404, 'not_found', 'Rota não encontrada.');
  }

  return {
    repo,

    /** Cria as tabelas, estende os cronogramas e agenda a verificação diária (a cada hora). */
    async start() {
      await repo.ensureSchema();
      const run = () => repo.extendIfNeeded()
        .then((n) => { if (n) logger.info?.(`[preventivas] cronogramas estendidos: ${n} visitas`); })
        .catch((error) => logger.error?.('[preventivas] falha na extensão automática', error));
      await run();
      timer = setInterval(run, 60 * 60 * 1000);
      timer.unref?.();
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },

    /** Trata qualquer rota /api/v1/preventives/*. `session` = sessão já validada pelo SIGA. */
    async handle(request, response, session, url) {
      try {
        const personId = personIdFromSession(session);
        if (!personId) throw new ApiError(401, 'unauthorized', 'Sessão expirada. Entre novamente.');
        rateLimit(personId);
        const person = await repo.getPerson(personId);
        if (!person) throw new ApiError(401, 'unauthorized', 'Sessão expirada. Entre novamente.');
        if (person.mustChangePassword) throw new ApiError(403, 'password_change_required', 'Troque sua senha provisória no SIGA antes de continuar.');
        if (!person.profiles.some((p) => ALLOWED_PROFILES.includes(p))) {
          throw new ApiError(403, 'forbidden', 'Seu perfil no SIGA não tem acesso à Agenda de Preventiva.');
        }
        const [status, payload] = await route(request, url, person);
        return sendJson(response, status, payload);
      } catch (error) {
        if (error instanceof ApiError) {
          return sendJson(response, error.status, { error: error.message, code: error.code, ...error.extra });
        }
        logger.error?.('[preventivas] erro interno', error);
        return sendJson(response, 500, { error: 'Erro interno no servidor.', code: 'internal' });
      }
    },
  };
}
