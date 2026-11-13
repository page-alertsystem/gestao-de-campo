// Criação de ticket no Movidesk para a Agenda de Preventiva (porte de preventiva_app/movidesk_service.py),
// feita pelo servidor com o token do SIGA. Antes de criar, procura o ticket pela tag única,
// para que uma nova tentativa depois de timeout nunca gere ticket duplicado.

export class MovideskError extends Error {}

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function movideskConfigFromEnv(env = process.env) {
  return {
    token: (env.MOVIEDESK_TOKEN || env.MOVIDESK_TOKEN || '').trim(),
    apiBase: (env.MOVIEDESK_API_BASE || env.MOVIDESK_API_BASE || 'https://api.movidesk.com/public/v1').replace(/\/+$/, ''),
    createdById: (env.PREVENTIVA_MOVIDESK_CREATED_BY || '').trim(),
    ownerTeam: (env.PREVENTIVA_MOVIDESK_OWNER_TEAM || '').trim(),
    category: (env.PREVENTIVA_MOVIDESK_CATEGORY || '').trim(),
    urgency: (env.PREVENTIVA_MOVIDESK_URGENCY || '').trim(),
    serviceFirstLevelId: (env.PREVENTIVA_MOVIDESK_SERVICE_ID || '').trim(),
    ticketType: Number(env.PREVENTIVA_MOVIDESK_TICKET_TYPE || 2),
    ticketUrl: (env.PREVENTIVA_MOVIDESK_TICKET_URL || 'https://app.movidesk.com/Account#/tickets/{id}').trim(),
    timeoutMs: Number(env.PREVENTIVA_MOVIDESK_TIMEOUT_MS || 30000),
  };
}

export function ticketTags(visit) {
  const key = visit.legacyId || visit.id;
  const tags = [`PREVENTIVA-${key}-${visit.referenceDate.slice(0, 7)}`];
  if (visit.legacyId) tags.push(`PREVENTIVA-${visit.legacyId}-${visit.scheduledDate.slice(0, 7)}`); // tag usada pela V3
  return tags;
}

export function buildTicketPayload(visit, plan, clientName, config) {
  if (!plan.movideskClientId) throw new MovideskError('O cliente não possui o código de referência do Movidesk.');
  if (!config.createdById) throw new MovideskError('Configure PREVENTIVA_MOVIDESK_CREATED_BY (código do gerador) no .env.server.');
  const [tag] = ticketTags(visit);
  const competence = visit.referenceDate.slice(0, 7);
  const description = '<p>Atividade preventiva programada.</p>'
    + `<p><b>Cliente:</b> ${escapeHtml(clientName)}<br>`
    + `<b>Equipe:</b> ${escapeHtml(visit.teamName)}<br>`
    + `<b>Data agendada:</b> ${br(visit.scheduledDate)}<br>`
    + `<b>Competência:</b> ${competence}<br>`
    + `<b>Identificação:</b> ${tag}</p>`;
  const payload = {
    type: config.ticketType || 2,
    subject: `Atividade preventiva ${visit.scheduledDate.slice(5, 7)}/${visit.scheduledDate.slice(0, 4)} - ${clientName}`,
    createdBy: { id: config.createdById },
    clients: [{ id: plan.movideskClientId }],
    actions: [{ type: 2, description }],
    tags: ['PREVENTIVA', tag],
  };
  if (config.ownerTeam) payload.ownerTeam = config.ownerTeam;
  if (config.category) payload.category = config.category;
  if (config.urgency) payload.urgency = config.urgency;
  if (config.serviceFirstLevelId) {
    const service = Number(config.serviceFirstLevelId);
    if (!Number.isInteger(service)) throw new MovideskError('PREVENTIVA_MOVIDESK_SERVICE_ID deve ser numérico.');
    payload.serviceFirstLevelId = service;
  }
  return payload;
}

async function call(config, method, path, query, body) {
  if (!config.token) throw new MovideskError('O token do Movidesk não está configurado no servidor.');
  const params = new URLSearchParams({ token: config.token, ...query });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  try {
    response = await fetch(`${config.apiBase}${path}?${params}`, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new MovideskError('O Movidesk demorou demais para responder.');
    throw new MovideskError(`Não foi possível conectar ao Movidesk: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
  const raw = (await response.text()).trim();
  if (response.status === 429) {
    throw new MovideskError(`O Movidesk limitou temporariamente as tentativas. Aguarde ${response.headers.get('retry-after') || 'alguns'} segundos.`);
  }
  if (!response.ok) throw new MovideskError(`Movidesk respondeu com erro ${response.status}: ${raw.slice(0, 300) || response.statusText}`);
  try { return raw ? JSON.parse(raw) : null; } catch { return raw.replace(/^"|"$/g, ''); }
}

/** Procura um ticket pela tag. >>> CONFERIR em homologação o filtro OData de tags do Movidesk. */
export async function findTicketByTag(config, tag) {
  const escaped = tag.replace(/'/g, "''");
  const result = await call(config, 'GET', '/tickets', { $select: 'id,protocol', $filter: `tags/any(t: t eq '${escaped}')`, $top: '1' });
  const list = Array.isArray(result) ? result : [];
  if (!list.length) return null;
  return { ticketId: String(list[0].id), protocol: String(list[0].protocol || list[0].id) };
}

export async function createTicket(config, payload) {
  const result = await call(config, 'POST', '/tickets', { returnAllProperties: 'true' }, payload);
  const ticketId = String((result && typeof result === 'object' ? result.id : result) || '').trim();
  if (!ticketId) throw new MovideskError('O Movidesk não retornou o número do ticket.');
  const protocol = String((result && typeof result === 'object' && result.protocol) || '').trim();
  return { ticketId, protocol };
}

export const ticketUrl = (config, ticketId) => (config.ticketUrl ? config.ticketUrl.replace('{id}', ticketId) : '');
