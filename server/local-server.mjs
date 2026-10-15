import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRepository } from './db/postgres.mjs'

const serverDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(serverDirectory, '..')
const distDirectory = join(projectDirectory, 'dist')

loadEnvironment(join(projectDirectory, '.env.server'))

const host = process.env.GIO_HOST?.trim() || '0.0.0.0'
const port = Number(process.env.GIO_PORT || 4173)
const movideskBaseUrl = (process.env.MOVIEDESK_API_BASE || 'https://api.movidesk.com/public/v1').replace(/\/$/, '')
const requestLimitBytes = 120 * 1024 * 1024
const smallRequestLimitBytes = 64 * 1024
const movideskRequests = []
const loginAttempts = new Map()
let returnCallCatalogCache = null

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL não encontrado no .env.server. Execute scripts\\instalar-postgres.ps1 para configurar o PostgreSQL.')
  process.exit(1)
}
const repository = createRepository(process.env.DATABASE_URL.trim())
try {
  await repository.migrate()
} catch (error) {
  console.error(`Não foi possível conectar ao PostgreSQL: ${error.message}`)
  process.exit(1)
}

const allowedOrigins = new Set([
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  ...String(process.env.GIO_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
])

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'], ['.ico', 'image/x-icon'], ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.apk', 'application/vnd.android.package-archive'],
])

if (!existsSync(join(distDirectory, 'index.html'))) {
  console.error('A pasta dist não foi encontrada. Compile o GIO antes de iniciar o servidor.')
  process.exit(1)
}

const server = createServer(async (request, response) => {
  setSecurityHeaders(request, response)

  try {
    let url
    try {
      url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
      decodeURIComponent(url.pathname)
    } catch {
      return sendJson(response, 400, { error: 'Endereço inválido.' })
    }
    if (request.method === 'OPTIONS') return handleOptions(request, response)
    if (!originAllowed(request)) return sendJson(response, 403, { error: 'Origem não autorizada para acessar o servidor GIO.' })
    if (url.pathname === '/api/health' && request.method === 'GET') return await sendHealth(response)
    if (url.pathname === '/api/setup/state' && request.method === 'POST') return await setupCentralState(request, response)
    if (url.pathname === '/api/auth/login' && request.method === 'POST') return await login(request, response)

    const session = url.pathname.startsWith('/api/') ? await authenticateRequest(request) : null
    if (url.pathname.startsWith('/api/') && !session) return sendJson(response, 401, { error: 'Sessão inválida ou expirada. Entre novamente na GIO.' })
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      await repository.deleteSession(session.token)
      return sendJson(response, 200, { ok: true })
    }
    if (url.pathname === '/api/state' && request.method === 'GET') return await getCentralState(response, session)
    if (url.pathname === '/api/state' && request.method === 'PUT') return await updateCentralState(request, response, session)
    if (session?.mustChangePassword && url.pathname.startsWith('/api/')) return sendJson(response, 403, { error: 'Troque a senha provisória antes de continuar.' })
    if (url.pathname.startsWith('/api/documents/') && request.method === 'GET') {
      const storageKey = decodeURIComponent(url.pathname.slice('/api/documents/'.length))
      return await downloadDocument(storageKey, response, session)
    }
    if (url.pathname === '/api/movidesk/rma' && request.method === 'POST') return await createRmaTicket(request, response)
    if (url.pathname === '/api/movidesk/rma/photo' && request.method === 'POST') return await uploadRmaPhoto(request, response)
    if (url.pathname === '/api/movidesk/tickets/photo' && request.method === 'POST') return await uploadRmaPhoto(request, response)
    if (url.pathname === '/api/movidesk/survey' && request.method === 'POST') return await createSurveyTicket(request, response)
    if (url.pathname === '/api/movidesk/return/categories' && request.method === 'GET') return await listReturnCallCategories(response)
    if (url.pathname === '/api/movidesk/return' && request.method === 'POST') return await createReturnCallTicket(request, response)
    if (url.pathname.startsWith('/api/movidesk/tickets/') && request.method === 'GET') {
      const ticketId = decodeURIComponent(url.pathname.slice('/api/movidesk/tickets/'.length))
      return await retrieveTicket(ticketId, response)
    }
    if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'Rota não encontrada.' })
    return await serveStatic(url.pathname, response)
  } catch (error) {
    if (error?.status && error.status < 500) return sendJson(response, error.status, { error: error.message })
    console.error(`[${new Date().toISOString()}]`, error)
    return sendJson(response, 500, { error: 'O servidor local encontrou um erro inesperado.' })
  }
})

server.listen(port, host, async () => {
  console.log(`GIO disponível em http://localhost:${port}`)
  console.log(`Rede local: http://IP-DESTA-MAQUINA:${port}`)
  console.log('Banco de dados: PostgreSQL conectado')
  console.log(`Movidesk: ${movideskConfiguration().configured ? 'configurado' : 'aguardando token e usuário de integração'}`)
})

const shutdown = () => server.close(() => {
  repository.close().finally(() => process.exit(0))
})
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function originAllowed(request) {
  const origin = String(request.headers.origin || '').trim()
  if (!origin || allowedOrigins.has(origin)) return true
  // Mesma origem: a página foi aberta pelo próprio servidor (ex.: http://IP-DO-SERVIDOR:4173).
  const host = String(request.headers.host || '').trim().toLowerCase()
  return Boolean(host) && origin.toLowerCase() === `http://${host}`
}

function handleOptions(request, response) {
  if (!originAllowed(request)) return sendJson(response, 403, { error: 'Origem não autorizada.' })
  response.writeHead(204)
  response.end()
}

// Só aceita como "local" a conexão direta desta máquina; requisições que chegam
// por túnel/proxy (cloudflared, etc.) trazem cabeçalhos de encaminhamento.
function isLoopbackRequest(request) {
  const address = String(request.socket.remoteAddress || '').replace(/^::ffff:/, '')
  const proxied = ['cf-connecting-ip', 'cf-ray', 'x-forwarded-for', 'forwarded', 'x-real-ip'].some(header => request.headers[header])
  return !proxied && (address === '127.0.0.1' || address === '::1')
}

async function setupCentralState(request, response) {
  if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'A configuração inicial só pode ser feita nesta máquina.' })
  if (await repository.isConfigured()) return sendJson(response, 409, { error: 'O armazenamento central já foi configurado.' })
  const body = await readJsonBody(request)
  const data = body?.data
  if (!validAppState(data)) return sendJson(response, 400, { error: 'Os dados locais não são válidos para iniciar o servidor.' })
  const result = await repository.setup(data)
  const session = await repository.createSession(result.accountId)
  return sendJson(response, 201, { configured: true, revision: result.revision, updatedAt: new Date().toISOString(), ...session })
}

function loginBlocked(key) {
  const entry = loginAttempts.get(key)
  if (!entry) return false
  if (entry.until && entry.until > Date.now()) return true
  if (entry.until && entry.until <= Date.now()) loginAttempts.delete(key)
  return false
}

// 5 erros seguidos para o mesmo e-mail (ou 50 vindos do mesmo endereço) bloqueiam por 5 minutos.
function registerLoginFailure(key) {
  const entry = loginAttempts.get(key) || { count: 0, until: 0 }
  entry.count += 1
  const limit = key.startsWith('ip:') ? 50 : 5
  if (entry.count >= limit) entry.until = Date.now() + 5 * 60 * 1000
  loginAttempts.set(key, entry)
}

async function login(request, response) {
  const body = await readJsonBody(request, smallRequestLimitBytes)
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')
  const socketAddress = String(request.socket.remoteAddress || '').replace(/^::ffff:/, '')
  const tunneled = (socketAddress === '127.0.0.1' || socketAddress === '::1') && request.headers['cf-connecting-ip']
  const address = tunneled ? String(request.headers['cf-connecting-ip']) : socketAddress
  const keys = [`ip:${address}`, `email:${email}`]
  if (keys.some(loginBlocked)) return sendJson(response, 429, { error: 'Muitas tentativas de login. Aguarde 5 minutos e tente novamente.' })
  if (!(await repository.isConfigured())) return sendJson(response, 503, { error: 'O armazenamento central ainda não foi configurado nesta máquina.' })
  const person = email && password ? await repository.verifyLogin(email, hashPassword(password)) : null
  if (!person) {
    keys.forEach(registerLoginFailure)
    return sendJson(response, 401, { error: 'E-mail ou senha inválidos.' })
  }
  loginAttempts.delete(`email:${email}`)
  const session = await repository.createSession(person.id)
  const state = await repository.loadState(person.id)
  return sendJson(response, 200, { ...session, data: state.data, revision: state.revision })
}

async function authenticateRequest(request) {
  const match = String(request.headers.authorization || '').match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const session = await repository.sessionFor(match[1])
  return session ? { ...session, token: match[1] } : null
}

function hashPassword(password) {
  return createHash('sha256').update(`gio-alert-v1:${password}`, 'utf8').digest('hex')
}

function validAppState(data) {
  return Boolean(data && typeof data === 'object' && data.account?.id && data.account?.email && data.account?.passwordHash && Array.isArray(data.people))
}

async function getCentralState(response, session) {
  const state = await repository.loadState(session.accountId)
  if (!state) return sendJson(response, 401, { error: 'Sessão inválida ou expirada. Entre novamente na GIO.' })
  return sendJson(response, 200, { ...state, updatedAt: new Date().toISOString() })
}

async function updateCentralState(request, response, session) {
  const body = await readJsonBody(request)
  const data = body?.data
  if (!data || typeof data !== 'object') return sendJson(response, 400, { error: 'Os dados enviados não são válidos.' })
  // Com senha provisória, só a troca de senha é aceita.
  const incoming = session.mustChangePassword ? { people: data.people, account: data.account } : data
  const result = await repository.applyState(session.accountId, incoming, body?.revision)
  const payload = { revision: result.revision, updatedAt: new Date().toISOString(), ...result.stats }
  if (result.needsRefresh) {
    const state = await repository.loadState(session.accountId)
    if (state) Object.assign(payload, { data: state.data, revision: state.revision })
  }
  return sendJson(response, 200, payload)
}

async function downloadDocument(storageKey, response, session) {
  if (!/^[a-zA-Z0-9_-]+$/.test(storageKey)) return sendJson(response, 400, { error: 'Identificação de documento inválida.' })
  const document = await repository.documentFor(session.accountId, storageKey)
  if (!document) return sendJson(response, 404, { error: 'Documento não encontrado no servidor.' })
  const safeName = String(document.fileName || `${storageKey}.pdf`).replace(/[\r\n"]/g, '')
  response.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': document.content.length,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    'Cache-Control': 'private, no-store',
  })
  response.end(document.content)
}

async function createRmaTicket(request, response) {
  const configuration = movideskConfiguration()
  if (!configuration.configured) return sendJson(response, 503, { error: 'Integração com o Movidesk ainda não configurada.', missing: configuration.missing })

  let body
  try {
    body = await readJsonBody(request)
  } catch (error) {
    const tooLarge = error?.status === 413 || String(error?.message || '').includes('120 MB')
    return sendJson(response, tooLarge ? 413 : 400, { error: tooLarge ? 'O conteúdo enviado ultrapassa o limite de 120 MB.' : 'O conteúdo enviado não é válido.' })
  }
  const required = ['localCode', 'title', 'client', 'equipment', 'withdrawalDate', 'technician', 'details']
  const missing = required.filter(field => !String(body[field] ?? '').trim())
  if (missing.length) return sendJson(response, 400, { error: 'Preencha todos os campos obrigatórios.', missing })

  const creator = { id: configuration.requesterId }
  const category = process.env.MOVIEDESK_CATEGORY?.trim() || String(body.category || 'RMA')
  const requestedUrgency = process.env.MOVIEDESK_URGENCY?.trim() || String(body.urgency || 'Média')
  const urgency = requestedUrgency === 'Normal' ? 'Média' : requestedUrgency === 'Urgente' ? 'Alta' : requestedUrgency
  const status = process.env.MOVIEDESK_STATUS?.trim() || '1 - Aberto'
  const baseStatus = process.env.MOVIEDESK_BASE_STATUS?.trim() || 'New'
  const description = buildDescription(body)
  const action = {
    type: Number(process.env.MOVIEDESK_ACTION_TYPE || 2),
    origin: Number(process.env.MOVIEDESK_ORIGIN || 9),
    description,
    status,
    createdBy: creator,
  }
  const ticket = {
    type: Number(process.env.MOVIEDESK_TICKET_TYPE || 2),
    subject: String(body.title).slice(0, 128),
    category,
    urgency,
    status,
    baseStatus,
    origin: Number(process.env.MOVIEDESK_ORIGIN || 9),
    createdBy: creator,
    actions: [action],
  }

  const clientId = process.env.MOVIEDESK_CLIENT_ID?.trim()
  if (clientId) ticket.clients = [{ id: clientId }]
  const serviceId = Number(process.env.MOVIEDESK_SERVICE_FIRST_LEVEL_ID || 0)
  if (serviceId > 0) ticket.serviceFirstLevelId = serviceId
  const ownerId = process.env.MOVIEDESK_OWNER_ID?.trim()
  const ownerTeam = process.env.MOVIEDESK_OWNER_TEAM?.trim()
  if (ownerId) ticket.owner = { id: ownerId }
  if (ownerTeam) ticket.ownerTeam = ownerTeam

  if (!allowMovideskRequest()) return sendJson(response, 429, { error: 'Limite temporário de chamadas ao Movidesk atingido. Aguarde um minuto.' })
  const movideskResponse = await fetch(`${movideskBaseUrl}/tickets?token=${encodeURIComponent(configuration.token)}&returnAllProperties=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(ticket),
    signal: AbortSignal.timeout(45000),
  })
  const responseText = await movideskResponse.text()
  if (!movideskResponse.ok) {
    console.error(`Movidesk ${movideskResponse.status}: ${responseText.slice(0, 1200)}`)
    return sendJson(response, 502, { error: 'O Movidesk recusou a criação do ticket.', status: movideskResponse.status, detail: safeMovideskError(responseText) })
  }
  const parsed = parseJson(responseText)
  let ticketDetails = parsed
  let internalId = extractInternalTicketId(parsed, responseText, movideskResponse.headers.get('location'))
  let ticketId = extractTicketId(parsed, responseText, movideskResponse.headers.get('location'))
  let actionId = extractActionId(parsed)
  if (internalId && (!actionId || !String(parsed?.protocol ?? '').trim())) {
    const retrieved = await retrieveTicketDetails(internalId, configuration)
    if (retrieved) {
      ticketDetails = retrieved
      ticketId = String(retrieved.protocol ?? ticketId).trim()
      actionId = extractActionId(retrieved) || actionId
    }
  }
  if (!ticketId) return sendJson(response, 502, { error: 'O Movidesk criou o registro, mas não devolveu o número do ticket.' })
  internalId = extractInternalTicketId(ticketDetails, String(internalId), '') || internalId

  let photoUploaded = !body.photo
  let attachmentError = ''
  if (body.photo) {
    if (!internalId || !actionId) {
      attachmentError = 'O ticket foi criado, mas o Movidesk não informou a ação para anexar a foto.'
    } else {
      try {
        await uploadPhotoToAction({ photo: body.photo, localCode: body.localCode, internalId, actionId, configuration })
        photoUploaded = true
      } catch (error) {
        attachmentError = safeAttachmentError(error)
        console.error(`Falha ao anexar foto ao ticket ${internalId}: ${attachmentError}`)
      }
    }
  }

  return sendJson(response, 201, {
    ticketId, id: ticketId, internalId, actionId, photoUploaded, attachmentError, localCode: body.localCode,
  })
}

async function uploadRmaPhoto(request, response) {
  const configuration = movideskConfiguration()
  if (!configuration.configured) return sendJson(response, 503, { error: 'Integração com o Movidesk ainda não configurada.', missing: configuration.missing })

  let body
  try {
    body = await readJsonBody(request)
  } catch (error) {
    const tooLarge = error?.status === 413 || String(error?.message || '').includes('120 MB')
    return sendJson(response, tooLarge ? 413 : 400, { error: tooLarge ? 'O conteúdo enviado ultrapassa o limite de 120 MB.' : 'O conteúdo enviado não é válido.' })
  }
  const internalId = String(body.internalId ?? '').trim()
  const actionId = String(body.actionId ?? '').trim()
  if (!/^\d+$/.test(internalId) || !/^\d+$/.test(actionId) || !String(body.photo ?? '').startsWith('data:image/')) {
    return sendJson(response, 400, { error: 'Os dados necessários para anexar a foto não são válidos.' })
  }

  try {
    await uploadPhotoToAction({ photo: body.photo, localCode: body.localCode, internalId, actionId, configuration })
    return sendJson(response, 200, { photoUploaded: true, internalId, actionId })
  } catch (error) {
    return sendJson(response, 502, { error: 'O Movidesk não recebeu a foto.', detail: safeAttachmentError(error) })
  }
}

async function createSurveyTicket(request, response) {
  const configuration = movideskConfiguration()
  if (!configuration.configured) return sendJson(response, 503, { error: 'Integração com o Movidesk ainda não configurada.', missing: configuration.missing })

  let body
  try {
    body = await readJsonBody(request)
  } catch (error) {
    const tooLarge = error?.status === 413 || String(error?.message || '').includes('120 MB')
    return sendJson(response, tooLarge ? 413 : 400, { error: tooLarge ? 'O conteúdo enviado ultrapassa o limite de 120 MB.' : 'O conteúdo enviado não é válido.' })
  }
  const required = ['localCode', 'client', 'startDate', 'endDate', 'area', 'details', 'requestedBy']
  const missing = required.filter(field => !String(body[field] ?? '').trim())
  if (missing.length) return sendJson(response, 400, { error: 'Preencha todos os campos obrigatórios.', missing })
  if (String(body.endDate) < String(body.startDate)) return sendJson(response, 400, { error: 'A data final não pode ser anterior à data inicial.' })

  const requesterId = process.env.MOVIEDESK_SURVEY_REQUESTER_ID?.trim() || '1128174077'
  const creator = { id: requesterId }
  const status = process.env.MOVIEDESK_STATUS?.trim() || '1 - Aberto'
  const baseStatus = process.env.MOVIEDESK_BASE_STATUS?.trim() || 'New'
  const origin = Number(process.env.MOVIEDESK_ORIGIN || 9)
  const action = {
    type: Number(process.env.MOVIEDESK_ACTION_TYPE || 2),
    origin,
    description: buildSurveyDescription(body),
    status,
    createdBy: creator,
  }
  const ticket = {
    type: Number(process.env.MOVIEDESK_TICKET_TYPE || 2),
    subject: `Levantamento: ${String(body.client).trim()} ${String(body.area).trim()}`.slice(0, 128),
    urgency: process.env.MOVIEDESK_SURVEY_URGENCY?.trim() || 'Média',
    status,
    baseStatus,
    origin,
    createdBy: creator,
    clients: [{ id: requesterId }],
    actions: [action],
  }
  const category = process.env.MOVIEDESK_SURVEY_CATEGORY?.trim()
  if (category) ticket.category = category
  const ownerId = process.env.MOVIEDESK_SURVEY_OWNER_ID?.trim()
  const ownerTeam = process.env.MOVIEDESK_SURVEY_OWNER_TEAM?.trim()
  if (ownerId) ticket.owner = { id: ownerId }
  if (ownerTeam) ticket.ownerTeam = ownerTeam

  if (!allowMovideskRequest()) return sendJson(response, 429, { error: 'Limite temporário de chamadas ao Movidesk atingido. Aguarde um minuto.' })
  const movideskResponse = await fetch(`${movideskBaseUrl}/tickets?token=${encodeURIComponent(configuration.token)}&returnAllProperties=true`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(ticket), signal: AbortSignal.timeout(45000),
  })
  const responseText = await movideskResponse.text()
  if (!movideskResponse.ok) {
    console.error(`Movidesk levantamento ${movideskResponse.status}: ${safeMovideskError(responseText)}`)
    return sendJson(response, 502, { error: 'O Movidesk recusou a criação do ticket de levantamento.', status: movideskResponse.status, detail: safeMovideskError(responseText) })
  }

  const parsed = parseJson(responseText)
  let ticketDetails = parsed
  let internalId = extractInternalTicketId(parsed, responseText, movideskResponse.headers.get('location'))
  let ticketId = extractTicketId(parsed, responseText, movideskResponse.headers.get('location'))
  let actionId = extractActionId(parsed)
  if (internalId && (!actionId || !String(parsed?.protocol ?? '').trim())) {
    const retrieved = await retrieveTicketDetails(internalId, configuration)
    if (retrieved) {
      ticketDetails = retrieved
      ticketId = String(retrieved.protocol ?? ticketId).trim()
      actionId = extractActionId(retrieved) || actionId
    }
  }
  if (!ticketId) return sendJson(response, 502, { error: 'O Movidesk criou o registro, mas não devolveu o número do ticket.' })
  internalId = extractInternalTicketId(ticketDetails, String(internalId), '') || internalId

  let photoUploaded = !body.photo
  let attachmentError = ''
  if (body.photo) {
    if (!internalId || !actionId) attachmentError = 'O ticket foi criado, mas o Movidesk não informou a ação para anexar a foto.'
    else {
      try {
        await uploadPhotoToAction({ photo: body.photo, localCode: body.localCode, internalId, actionId, configuration })
        photoUploaded = true
      } catch (error) {
        attachmentError = safeAttachmentError(error)
        console.error(`Falha ao anexar foto do levantamento ao ticket ${internalId}: ${attachmentError}`)
      }
    }
  }

  return sendJson(response, 201, {
    ticketId, id: ticketId, internalId, actionId, status, photoUploaded, attachmentError, localCode: body.localCode,
  })
}

async function listReturnCallCategories(response) {
  const configuration = movideskConfiguration()
  if (!configuration.configured) return sendJson(response, 503, { error: 'Integração com o Movidesk ainda não configurada.', missing: configuration.missing })

  if (returnCallCatalogCache && returnCallCatalogCache.expiresAt > Date.now()) {
    return sendJson(response, 200, returnCallCatalogCache.value)
  }
  if (!allowMovideskRequest()) return sendJson(response, 429, { error: 'Limite temporário de chamadas ao Movidesk atingido. Aguarde um minuto.' })

  const query = new URLSearchParams({ token: configuration.token })
  const movideskResponse = await fetch(`${movideskBaseUrl}/services?${query}`, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000),
  })
  const responseText = await movideskResponse.text()
  if (!movideskResponse.ok) {
    console.error(`Movidesk serviços ${movideskResponse.status}: ${safeMovideskError(responseText)}`)
    return sendJson(response, 502, { error: 'Não foi possível carregar as categorias do Movidesk.', status: movideskResponse.status, detail: safeMovideskError(responseText) })
  }

  const services = parseJson(responseText)
  const categoryMap = new Map()
  for (const service of Array.isArray(services) ? services : []) {
    const serviceForTicketType = Number(service?.serviceForTicketType)
    const allowSelection = Number(service?.allowSelection)
    if (service?.isActive === false || ![1, 2].includes(serviceForTicketType) || (Number.isFinite(allowSelection) && ![1, 3].includes(allowSelection))) continue
    const serviceId = Number(service?.id || 0)
    const entries = Array.isArray(service?.categories) ? service.categories : []
    if (service?.defaultCategory) entries.push(service.defaultCategory)
    for (const entry of entries) {
      if (entry && typeof entry === 'object' && entry.isActive === false) continue
      const name = String(typeof entry === 'string' ? entry : entry?.name || entry?.category || '').trim()
      if (!name) continue
      const key = normalizeText(name)
      if (!categoryMap.has(key)) categoryMap.set(key, {
        name,
        serviceFirstLevelId: serviceId > 0 ? serviceId : undefined,
        serviceName: String(service?.name || '').trim(),
        defaultUrgency: String((entry && typeof entry === 'object' ? entry.defaultUrgency : '') || service?.defaultUrgency || '').trim(),
      })
    }
  }

  const categories = [...categoryMap.values()].sort((first, second) => first.name.localeCompare(second.name, 'pt-BR'))
  if (!categories.length) return sendJson(response, 502, { error: 'O Movidesk não devolveu categorias internas disponíveis para este usuário de integração.' })
  const urgencies = [...new Set([
    ...categories.map(item => item.defaultUrgency).filter(Boolean),
    'Baixa', 'Média', 'Alta', 'Urgente',
  ])]
  const value = { categories, urgencies, loadedAt: new Date().toISOString() }
  returnCallCatalogCache = { value, expiresAt: Date.now() + 10 * 60 * 1000 }
  return sendJson(response, 200, value)
}

async function createReturnCallTicket(request, response) {
  const configuration = movideskConfiguration()
  if (!configuration.configured) return sendJson(response, 503, { error: 'Integração com o Movidesk ainda não configurada.', missing: configuration.missing })

  let body
  try {
    body = await readJsonBody(request)
  } catch (error) {
    const tooLarge = error?.status === 413 || String(error?.message || '').includes('120 MB')
    return sendJson(response, tooLarge ? 413 : 400, { error: tooLarge ? 'O conteúdo enviado ultrapassa o limite de 120 MB.' : 'O conteúdo enviado não é válido.' })
  }
  const required = ['localCode', 'client', 'urgency', 'category', 'date', 'description', 'openedBy', 'photo']
  const missing = required.filter(field => !String(body[field] ?? '').trim())
  if (missing.length) return sendJson(response, 400, { error: 'Preencha todos os campos obrigatórios e anexe uma foto.', missing })
  if (!String(body.photo).startsWith('data:image/')) return sendJson(response, 400, { error: 'A foto anexada não está em um formato válido.' })

  const requesterId = process.env.MOVIEDESK_RETURN_REQUESTER_ID?.trim() || 'acf45ae5-aae4-41df-'
  const creator = { id: requesterId }
  const origin = Number(process.env.MOVIEDESK_ORIGIN || 9)
  const status = process.env.MOVIEDESK_RETURN_STATUS?.trim() || process.env.MOVIEDESK_STATUS?.trim() || '1 - Aberto'
  const baseStatus = process.env.MOVIEDESK_RETURN_BASE_STATUS?.trim() || process.env.MOVIEDESK_BASE_STATUS?.trim() || 'New'
  const action = {
    type: 1,
    origin,
    description: buildReturnCallDescription(body),
    status,
    createdBy: creator,
  }
  const ticket = {
    type: 1,
    subject: `Chamado de retorno: ${String(body.client).trim()}`.slice(0, 128),
    category: String(body.category).trim(),
    urgency: String(body.urgency).trim(),
    status,
    baseStatus,
    origin,
    createdBy: creator,
    clients: [creator],
    actions: [action],
  }
  const serviceFirstLevelId = Number(body.serviceFirstLevelId || 0)
  if (serviceFirstLevelId > 0) ticket.serviceFirstLevelId = serviceFirstLevelId

  if (!allowMovideskRequest()) return sendJson(response, 429, { error: 'Limite temporário de chamadas ao Movidesk atingido. Aguarde um minuto.' })
  const movideskResponse = await fetch(`${movideskBaseUrl}/tickets?token=${encodeURIComponent(configuration.token)}&returnAllProperties=true`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(ticket), signal: AbortSignal.timeout(45000),
  })
  const responseText = await movideskResponse.text()
  if (!movideskResponse.ok) {
    console.error(`Movidesk chamado de retorno ${movideskResponse.status}: ${safeMovideskError(responseText)}`)
    return sendJson(response, 502, { error: 'O Movidesk recusou a criação do chamado interno.', status: movideskResponse.status, detail: safeMovideskError(responseText) })
  }

  const parsed = parseJson(responseText)
  let ticketDetails = parsed
  let internalId = extractInternalTicketId(parsed, responseText, movideskResponse.headers.get('location'))
  let ticketId = extractTicketId(parsed, responseText, movideskResponse.headers.get('location'))
  let actionId = extractActionId(parsed)
  if (internalId && (!actionId || !String(parsed?.protocol ?? '').trim())) {
    const retrieved = await retrieveTicketDetails(internalId, configuration)
    if (retrieved) {
      ticketDetails = retrieved
      ticketId = String(retrieved.protocol ?? ticketId).trim()
      actionId = extractActionId(retrieved) || actionId
    }
  }
  if (!ticketId) return sendJson(response, 502, { error: 'O Movidesk criou o registro, mas não devolveu o número do ticket.' })
  internalId = extractInternalTicketId(ticketDetails, String(internalId), '') || internalId

  let photoUploaded = false
  let attachmentError = ''
  if (!internalId || !actionId) attachmentError = 'O ticket foi criado, mas o Movidesk não informou a ação para anexar a foto.'
  else {
    try {
      await uploadPhotoToAction({ photo: body.photo, localCode: body.localCode, internalId, actionId, configuration })
      photoUploaded = true
    } catch (error) {
      attachmentError = safeAttachmentError(error)
      console.error(`Falha ao anexar foto do chamado de retorno ${internalId}: ${attachmentError}`)
    }
  }

  return sendJson(response, 201, {
    ticketId, id: ticketId, internalId, actionId, status, type: 1, photoUploaded, attachmentError, localCode: body.localCode,
  })
}

async function retrieveTicket(ticketId, response) {
  const configuration = movideskConfiguration()
  if (!configuration.configured) return sendJson(response, 503, { error: 'Integração com o Movidesk ainda não configurada.', missing: configuration.missing })
  if (!/^\d+$/.test(ticketId)) return sendJson(response, 400, { error: 'Número de ticket inválido.' })
  if (!allowMovideskRequest()) return sendJson(response, 429, { error: 'Limite temporário de chamadas ao Movidesk atingido. Aguarde um minuto.' })

  const query = new URLSearchParams({ token: configuration.token })
  query.set(ticketId.length > 10 ? 'protocol' : 'id', ticketId)
  const movideskResponse = await fetch(`${movideskBaseUrl}/tickets?${query}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) })
  const responseText = await movideskResponse.text()
  if (!movideskResponse.ok) return sendJson(response, 502, { error: 'Não foi possível consultar o ticket no Movidesk.', status: movideskResponse.status, detail: safeMovideskError(responseText) })
  const ticket = parseJson(responseText)
  return sendJson(response, 200, {
    id: ticket?.id ?? ticketId,
    actionId: extractActionId(ticket),
    protocol: ticket?.protocol ?? '',
    subject: ticket?.subject ?? '',
    status: ticket?.status ?? '',
    baseStatus: ticket?.baseStatus ?? '',
    resolved: isResolvedTicket(ticket),
    category: ticket?.category ?? '',
    urgency: ticket?.urgency ?? '',
    owner: ticket?.owner?.businessName ?? ticket?.owner?.userName ?? '',
    ownerTeam: ticket?.ownerTeam ?? '',
    updatedAt: ticket?.lastUpdate ?? ticket?.lastActionDate ?? '',
  })
}

function movideskConfiguration() {
  const token = process.env.MOVIEDESK_TOKEN?.trim() || ''
  const requesterId = process.env.MOVIEDESK_REQUESTER_ID?.trim() || ''
  const missing = []
  if (!token) missing.push('MOVIEDESK_TOKEN')
  if (!requesterId) missing.push('MOVIEDESK_REQUESTER_ID')
  return { configured: missing.length === 0, missing, token, requesterId }
}

async function sendHealth(response) {
  const movidesk = movideskConfiguration()
  let databaseOnline = true
  let configured = false
  let storedDocuments = 0
  try {
    await repository.ping()
    configured = await repository.isConfigured()
    storedDocuments = await repository.documentCount()
  } catch {
    databaseOnline = false
  }
  return sendJson(response, databaseOnline ? 200 : 503, {
    application: 'GIO', status: databaseOnline ? 'online' : 'database-offline', serverTime: new Date().toISOString(),
    movideskConfigured: movidesk.configured, missingConfiguration: movidesk.missing,
    centralStorageConfigured: configured, storageType: 'PostgreSQL', storedDocuments,
  })
}

function allowMovideskRequest() {
  const now = Date.now()
  while (movideskRequests.length && movideskRequests[0] < now - 60000) movideskRequests.shift()
  if (movideskRequests.length >= 9) return false
  movideskRequests.push(now)
  return true
}

function buildDescription(body) {
  return [
    'SOLICITAÇÃO DE RMA PELO GIO',
    `Código GIO: ${body.localCode}`,
    `Cliente informado: ${body.client}`,
    `Equipamento: ${body.equipment}`,
    `Data da retirada: ${formatDate(body.withdrawalDate)}`,
    `Técnico solicitante: ${body.technician}`,
    `Serviço: ${body.service || 'Manutenção'}`,
    `Categoria: ${body.category || 'RMA'}`,
    `Urgência: ${body.urgency || 'Normal'}`,
    `Descrição do problema: ${body.details}`,
    `Registrado no GIO em ${new Date().toLocaleString('pt-BR')}.`,
  ].map(line => escapeHtml(line).replace(/\r?\n/g, '<br>')).join('<br>')
}

function buildSurveyDescription(body) {
  return [
    'SOLICITAÇÃO DE LEVANTAMENTO PELO GIO',
    `Código GIO: ${body.localCode}`,
    `Cliente informado: ${body.client}`,
    `Período solicitado: ${formatDate(body.startDate)} a ${formatDate(body.endDate)}`,
    `Área do levantamento: ${body.area}`,
    `Solicitante: ${body.requestedBy}`,
    `Detalhes da atividade: ${body.details}`,
    `Registrado no GIO em ${new Date().toLocaleString('pt-BR')}.`,
  ].map(line => escapeHtml(line).replace(/\r?\n/g, '<br>')).join('<br>')
}

function buildReturnCallDescription(body) {
  return [
    'CHAMADO INTERNO DE RETORNO PELO GIO',
    `Código GIO: ${body.localCode}`,
    `Cliente informado: ${body.client}`,
    `Data informada: ${formatDate(body.date)}`,
    `Categoria: ${body.category}`,
    `Urgência: ${body.urgency}`,
    `Solicitante: ${body.openedBy}`,
    `Descrição: ${body.description}`,
    `Registrado no GIO em ${new Date().toLocaleString('pt-BR')}.`,
  ].map(line => escapeHtml(line).replace(/\r?\n/g, '<br>')).join('<br>')
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

async function retrieveTicketDetails(internalId, configuration) {
  if (!allowMovideskRequest()) return null
  const query = new URLSearchParams({ token: configuration.token, id: String(internalId) })
  const movideskResponse = await fetch(`${movideskBaseUrl}/tickets?${query}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) })
  if (!movideskResponse.ok) return null
  return parseJson(await movideskResponse.text())
}

async function uploadPhotoToAction({ photo, localCode, internalId, actionId, configuration }) {
  if (!allowMovideskRequest()) throw new Error('Limite temporário do Movidesk atingido. Aguarde um minuto e tente novamente.')
  const attachment = parsePhotoAttachment(photo, localCode)
  const form = new FormData()
  form.append('files', new Blob([attachment.buffer], { type: attachment.mimeType }), attachment.fileName)
  const query = new URLSearchParams({ token: configuration.token, id: String(internalId), actionId: String(actionId) })
  const movideskResponse = await fetch(`${movideskBaseUrl}/ticketFileUpload?${query}`, {
    method: 'POST', headers: { Accept: 'application/json' }, body: form, signal: AbortSignal.timeout(60000),
  })
  const responseText = await movideskResponse.text()
  const parsed = parseJson(responseText)
  if (!movideskResponse.ok || attachmentResponseHasError(parsed)) {
    throw new Error(safeMovideskError(responseText) || `Falha ${movideskResponse.status}`)
  }
  return parsed
}

function parsePhotoAttachment(photo, localCode) {
  const match = String(photo || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\r\n]+)$/)
  if (!match) throw new Error('A imagem não está em um formato válido.')
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  if (!buffer.length) throw new Error('A imagem está vazia.')
  if (buffer.length > 10 * 1024 * 1024) throw new Error('A foto ultrapassa 10 MB. Selecione uma imagem menor.')
  const mimeType = match[1].toLowerCase()
  const subtype = mimeType.split('/')[1].replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'jpg'
  const safeCode = String(localCode || 'RMA').replace(/[^a-zA-Z0-9_-]/g, '') || 'RMA'
  return { buffer, mimeType, fileName: `${safeCode}-equipamento.${subtype}` }
}

function attachmentResponseHasError(parsed) {
  const entries = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : []
  return entries.some(entry => {
    const error = entry?.error ?? entry?.errors
    if (Array.isArray(error)) return error.length > 0
    return Boolean(String(error ?? '').trim())
  })
}

function safeAttachmentError(error) {
  const message = error instanceof Error ? error.message : String(error || '')
  return safeMovideskError(message) || 'Falha ao enviar a foto. Tente novamente.'
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('pt-BR')
}

function isResolvedTicket(ticket) {
  const status = normalizeText(ticket?.status)
  const baseStatus = normalizeText(ticket?.baseStatus)
  return status.includes('resolvid') || status.includes('concluid') || baseStatus === 'resolved' || baseStatus === 'closed'
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

async function serveStatic(pathname, response) {
  let relativePath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
  relativePath = normalize(relativePath).replace(/^([/\\])+/, '')
  let filePath = resolve(distDirectory, relativePath)
  if (filePath !== distDirectory && !filePath.startsWith(`${distDirectory}${sep}`)) return sendJson(response, 403, { error: 'Acesso negado.' })

  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html')
  } catch {
    // Rotas desconhecidas: /mobile/* abre o GIO Mobile; o resto abre o GIO completo.
    const mobileIndex = join(distDirectory, 'mobile', 'index.html')
    filePath = (relativePath === 'mobile' || relativePath.startsWith(`mobile${sep}`)) && existsSync(mobileIndex) ? mobileIndex : join(distDirectory, 'index.html')
  }
  const content = await readFile(filePath)
  const extension = extname(filePath).toLowerCase()
  response.writeHead(200, {
    'Content-Type': mimeTypes.get(extension) || 'application/octet-stream',
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=86400',
  })
  response.end(content)
}

function readJsonBody(request, limitBytes = requestLimitBytes) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0
    let tooLarge = false
    const chunks = []
    request.on('data', chunk => {
      if (tooLarge) return
      size += chunk.length
      if (size > limitBytes) {
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (tooLarge) return rejectBody(Object.assign(new Error('Os dados enviados ultrapassam o tamanho permitido.'), { status: 413 }))
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { rejectBody(Object.assign(new Error('JSON inválido.'), { status: 400 })) }
    })
    request.on('error', rejectBody)
  })
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

function setSecurityHeaders(request, response) {
  const origin = String(request.headers.origin || '').trim()
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.setHeader('Access-Control-Max-Age', '86400')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'SAMEORIGIN')
  response.setHeader('Referrer-Policy', 'same-origin')
  response.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self)')
}

function loadEnvironment(filePath) {
  if (!existsSync(filePath)) return
  const content = requireEnvironmentFile(filePath)
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function requireEnvironmentFile(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

function parseJson(value) {
  try { return JSON.parse(value) } catch { return null }
}

function extractTicketId(parsed, text, location) {
  const direct = parsed?.protocol ?? parsed?.ticketNumber ?? parsed?.id ?? parsed?.ticketId ?? (typeof parsed === 'number' || typeof parsed === 'string' ? parsed : '')
  if (String(direct).trim()) return String(direct).trim()
  const locationMatch = String(location || '').match(/(?:id=|tickets\/)(\d+)/i)
  if (locationMatch) return locationMatch[1]
  const textMatch = String(text).match(/^\s*"?(\d+)"?\s*$/)
  return textMatch?.[1] || ''
}

function extractInternalTicketId(parsed, text, location) {
  const direct = parsed?.id ?? parsed?.ticketId ?? (typeof parsed === 'number' || typeof parsed === 'string' ? parsed : '')
  if (/^\d+$/.test(String(direct).trim())) return String(direct).trim()
  const locationMatch = String(location || '').match(/(?:id=|tickets\/)(\d+)/i)
  if (locationMatch) return locationMatch[1]
  const textMatch = String(text).match(/^\s*"?(\d+)"?\s*$/)
  return textMatch?.[1] || ''
}

function extractActionId(ticket) {
  const actions = Array.isArray(ticket?.actions) ? ticket.actions : []
  const action = actions.find(item => /^\d+$/.test(String(item?.id ?? '').trim()))
  return action ? String(action.id).trim() : ''
}

function safeMovideskError(value) {
  return String(value || '').replace(/token=[^&\s"]+/gi, 'token=PROTEGIDO').slice(0, 1200)
}
