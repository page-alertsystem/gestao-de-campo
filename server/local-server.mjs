import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const serverDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(serverDirectory, '..')
const distDirectory = join(projectDirectory, 'dist')

loadEnvironment(join(projectDirectory, '.env.server'))

const host = process.env.GIO_HOST?.trim() || '0.0.0.0'
const port = Number(process.env.GIO_PORT || 4173)
const movideskBaseUrl = (process.env.MOVIEDESK_API_BASE || 'https://api.movidesk.com/public/v1').replace(/\/$/, '')
const requestLimitBytes = 120 * 1024 * 1024
const movideskRequests = []
const sessions = new Map()
const dataDirectory = resolve(process.env.GIO_DATA_DIR?.trim() || join(projectDirectory, '.gio-data'))
const documentsDirectory = join(dataDirectory, 'documents')
mkdirSync(documentsDirectory, { recursive: true })
const database = new DatabaseSync(join(dataDirectory, 'gio.db'))
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS documents (
    storage_key TEXT PRIMARY KEY,
    record_type TEXT NOT NULL,
    record_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`)
const allowedOrigins = new Set([
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  ...String(process.env.GIO_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
])

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'], ['.ico', 'image/x-icon'], ['.webmanifest', 'application/manifest+json; charset=utf-8'],
])

if (!existsSync(join(distDirectory, 'index.html'))) {
  console.error('A pasta dist não foi encontrada. Compile o GIO antes de iniciar o servidor.')
  process.exit(1)
}

const server = createServer(async (request, response) => {
  setSecurityHeaders(request, response)
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

  try {
    if (request.method === 'OPTIONS') return handleOptions(request, response)
    if (!originAllowed(request)) return sendJson(response, 403, { error: 'Origem não autorizada para acessar o servidor GIO.' })
    if (url.pathname === '/api/health' && request.method === 'GET') return sendHealth(response)
    if (url.pathname === '/api/setup/state' && request.method === 'POST') return await setupCentralState(request, response)
    if (url.pathname === '/api/auth/login' && request.method === 'POST') return await login(request, response)

    const session = authenticateRequest(request)
    if (url.pathname.startsWith('/api/') && !session) return sendJson(response, 401, { error: 'Sessão inválida ou expirada. Entre novamente na GIO.' })
    if (url.pathname === '/api/state' && request.method === 'GET') return getCentralState(response, session)
    if (url.pathname === '/api/state' && request.method === 'PUT') return await updateCentralState(request, response, session)
    if (url.pathname.startsWith('/api/documents/') && request.method === 'GET') {
      const storageKey = decodeURIComponent(url.pathname.slice('/api/documents/'.length))
      return await downloadDocument(storageKey, response)
    }
    if (url.pathname === '/api/movidesk/rma' && request.method === 'POST') return await createRmaTicket(request, response)
    if (url.pathname === '/api/movidesk/rma/photo' && request.method === 'POST') return await uploadRmaPhoto(request, response)
    if (url.pathname === '/api/movidesk/tickets/photo' && request.method === 'POST') return await uploadRmaPhoto(request, response)
    if (url.pathname === '/api/movidesk/survey' && request.method === 'POST') return await createSurveyTicket(request, response)
    if (url.pathname.startsWith('/api/movidesk/tickets/') && request.method === 'GET') {
      const ticketId = decodeURIComponent(url.pathname.slice('/api/movidesk/tickets/'.length))
      return await retrieveTicket(ticketId, response)
    }
    if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'Rota não encontrada.' })
    return await serveStatic(url.pathname, response)
  } catch (error) {
    console.error(`[${new Date().toISOString()}]`, error)
    return sendJson(response, 500, { error: 'O servidor local encontrou um erro inesperado.' })
  }
})

server.listen(port, host, () => {
  console.log(`GIO disponível em http://localhost:${port}`)
  console.log(`Rede local: http://IP-DESTA-MAQUINA:${port}`)
  console.log(`Movidesk: ${movideskConfiguration().configured ? 'configurado' : 'aguardando token e usuário de integração'}`)
})

const shutdown = () => server.close(() => {
  database.close()
  process.exit(0)
})
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function originAllowed(request) {
  const origin = String(request.headers.origin || '').trim()
  return !origin || allowedOrigins.has(origin)
}

function handleOptions(request, response) {
  if (!originAllowed(request)) return sendJson(response, 403, { error: 'Origem não autorizada.' })
  response.writeHead(204)
  response.end()
}

function isLoopbackRequest(request) {
  const address = String(request.socket.remoteAddress || '').replace(/^::ffff:/, '')
  return address === '127.0.0.1' || address === '::1'
}

function stateRow() {
  return database.prepare('SELECT data, revision, updated_at FROM app_state WHERE id = 1').get()
}

function stateForClient() {
  const row = stateRow()
  if (!row) return null
  return { data: JSON.parse(String(row.data)), revision: Number(row.revision), updatedAt: String(row.updated_at) }
}

async function setupCentralState(request, response) {
  if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'A configuração inicial só pode ser feita nesta máquina.' })
  if (stateRow()) return sendJson(response, 409, { error: 'O armazenamento central já foi configurado.' })
  const body = await readJsonBody(request)
  const data = body?.data
  if (!validAppState(data)) return sendJson(response, 400, { error: 'Os dados locais não são válidos para iniciar o servidor.' })
  const stored = storeCentralState(data, null)
  const session = createSession(String(data.account.id || ''))
  return sendJson(response, 201, { configured: true, revision: stored.revision, updatedAt: stored.updatedAt, ...session })
}

async function login(request, response) {
  const body = await readJsonBody(request)
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')
  const state = stateForClient()
  if (!state) return sendJson(response, 503, { error: 'O armazenamento central ainda não foi configurado nesta máquina.' })
  const legacyAccount = state.data?.account
  const person = (Array.isArray(state.data?.people) ? state.data.people : []).find(item => item?.active !== false && item?.canLogin === true && String(item?.email || '').trim().toLowerCase() === email)
  const isLegacyAccount = person && (String(person.id) === String(legacyAccount?.id) || String(person.email || '').trim().toLowerCase() === String(legacyAccount?.email || '').trim().toLowerCase())
  const expectedHash = String(person?.passwordHash || (isLegacyAccount ? legacyAccount?.passwordHash : '') || '')
  const informedHash = hashPassword(password)
  if (!email || !password || !person || !expectedHash || !safeEqual(informedHash, expectedHash)) {
    return sendJson(response, 401, { error: 'E-mail ou senha inválidos.' })
  }
  const session = createSession(String(person.id || ''))
  return sendJson(response, 200, { ...session, data: stateForAccount(state.data, person.id), revision: state.revision })
}

function createSession(accountId) {
  clearExpiredSessions()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000
  sessions.set(token, { accountId, expiresAt })
  return { token, expiresAt: new Date(expiresAt).toISOString() }
}

function authenticateRequest(request) {
  clearExpiredSessions()
  const match = String(request.headers.authorization || '').match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const session = sessions.get(match[1]) || null
  if (!session) return null
  const state = stateForClient()
  const person = (Array.isArray(state?.data?.people) ? state.data.people : []).find(item => String(item?.id) === String(session.accountId))
  if (!person || person.active === false || person.canLogin !== true) {
    sessions.delete(match[1])
    return null
  }
  return session
}

function clearExpiredSessions() {
  const now = Date.now()
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token)
}

function hashPassword(password) {
  return createHash('sha256').update(`gio-alert-v1:${password}`, 'utf8').digest('hex')
}

function safeEqual(first, second) {
  const firstBuffer = Buffer.from(String(first))
  const secondBuffer = Buffer.from(String(second))
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer)
}

function validAppState(data) {
  return Boolean(data && typeof data === 'object' && data.account?.id && data.account?.email && data.account?.passwordHash && Array.isArray(data.people))
}

function getCentralState(response, session) {
  const state = stateForClient()
  if (!state) return sendJson(response, 404, { error: 'O armazenamento central ainda não foi configurado.' })
  return sendJson(response, 200, { ...state, data: stateForAccount(state.data, session.accountId) })
}

async function updateCentralState(request, response, session) {
  const body = await readJsonBody(request)
  if (!validAppState(body?.data)) return sendJson(response, 400, { error: 'Os dados enviados não são válidos.' })
  const expectedRevision = Number(body?.revision)
  const current = stateRow()
  if (!current) return sendJson(response, 404, { error: 'O armazenamento central ainda não foi configurado.' })
  if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(current.revision)) {
    return sendJson(response, 409, { error: 'Os dados foram atualizados por outro dispositivo. Recarregue a GIO antes de tentar novamente.', revision: Number(current.revision) })
  }
  const currentData = JSON.parse(String(current.data))
  const stored = storeCentralState(mergeStateForAccount(body.data, currentData, session.accountId), expectedRevision)
  return sendJson(response, 200, { revision: stored.revision, updatedAt: stored.updatedAt })
}

function stateForAccount(data, accountId) {
  const clone = structuredClone(data)
  const person = (Array.isArray(clone.people) ? clone.people : []).find(item => String(item?.id) === String(accountId))
  if (!person) return clone
  const legacyAccount = clone.account
  const isLegacyAccount = String(person.id) === String(legacyAccount?.id)
  clone.account = {
    id: String(person.id),
    name: String(person.name || ''),
    email: String(person.email || ''),
    passwordHash: String(person.passwordHash || (isLegacyAccount ? legacyAccount?.passwordHash : '') || ''),
    mustChangePassword: Boolean(person.mustChangePassword ?? (isLegacyAccount ? legacyAccount?.mustChangePassword : false)),
  }
  clone.people = clone.people.map(item => {
    if (String(item?.id) === String(accountId)) return item
    const safe = { ...item }
    delete safe.passwordHash
    return safe
  })
  return clone
}

function mergeStateForAccount(incoming, current, accountId) {
  const currentPeople = Array.isArray(current.people) ? current.people : []
  const incomingPeople = Array.isArray(incoming.people) ? incoming.people : []
  const signedIn = currentPeople.find(item => String(item?.id) === String(accountId))
  const administrator = Array.isArray(signedIn?.groups) && signedIn.groups.includes('Administrador')

  let people
  if (administrator) {
    people = incomingPeople.map(person => {
      const previous = currentPeople.find(item => String(item?.id) === String(person?.id))
      return {
        ...person,
        passwordHash: person?.passwordHash || previous?.passwordHash,
        mustChangePassword: person?.mustChangePassword ?? previous?.mustChangePassword ?? false,
      }
    })
  } else {
    people = currentPeople.map(person => {
      if (String(person?.id) !== String(accountId)) return person
      const informed = incomingPeople.find(item => String(item?.id) === String(accountId))
      return {
        ...person,
        passwordHash: informed?.passwordHash || incoming.account?.passwordHash || person.passwordHash,
        mustChangePassword: informed?.mustChangePassword ?? incoming.account?.mustChangePassword ?? person.mustChangePassword ?? false,
      }
    })
    incomingPeople.filter(person => !currentPeople.some(item => String(item?.id) === String(person?.id)) && person?.canLogin !== true).forEach(person => people.push(person))
  }

  const primaryPerson = people.find(person => String(person?.id) === String(current.account?.id))
  const account = primaryPerson ? {
    ...current.account,
    name: String(primaryPerson.name || current.account?.name || ''),
    email: String(primaryPerson.email || current.account?.email || ''),
    passwordHash: String(primaryPerson.passwordHash || current.account?.passwordHash || ''),
    mustChangePassword: Boolean(primaryPerson.mustChangePassword ?? current.account?.mustChangePassword),
  } : current.account
  return { ...incoming, account, people }
}

function storeCentralState(data, expectedRevision) {
  const sanitized = extractPdfDocuments(data)
  const current = stateRow()
  const revision = current ? Number(current.revision) + 1 : 1
  if (current && expectedRevision !== null && Number(current.revision) !== expectedRevision) throw new Error('Conflito de revisão ao salvar o banco local.')
  const updatedAt = new Date().toISOString()
  database.prepare(`INSERT INTO app_state (id, data, revision, updated_at) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, revision = excluded.revision, updated_at = excluded.updated_at`).run(JSON.stringify(sanitized), revision, updatedAt)
  return { revision, updatedAt }
}

function extractPdfDocuments(data) {
  const clone = structuredClone(data)
  const groups = [
    { type: 'auditoria', records: Array.isArray(clone.audits) ? clone.audits : [] },
    { type: 'troca-veiculo', records: Array.isArray(clone.kmRecords) ? clone.kmRecords.filter(record => record.changeDriver) : [] },
  ]
  const insert = database.prepare(`INSERT INTO documents (storage_key, record_type, record_id, file_name, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(storage_key) DO UPDATE SET file_name = excluded.file_name, created_at = excluded.created_at`)
  for (const group of groups) {
    for (const record of group.records) {
      delete record.pdfUrl
      if (!String(record.pdfData || '').startsWith('data:application/pdf')) continue
      const parsed = parsePdfData(record.pdfData)
      const storageKey = String(record.pdfStorageKey || `${group.type}-${record.id}`).replace(/[^a-zA-Z0-9_-]/g, '')
      if (!storageKey) continue
      writeFileSync(join(documentsDirectory, `${storageKey}.pdf`), parsed)
      record.pdfStorageKey = storageKey
      delete record.pdfData
      insert.run(storageKey, group.type, String(record.id), String(record.pdfFileName || `${storageKey}.pdf`), String(record.completedAt || record.createdAt || new Date().toISOString()))
    }
  }
  return clone
}

function parsePdfData(value) {
  const match = String(value || '').match(/^data:application\/pdf[^,]*;base64,([a-zA-Z0-9+/=\r\n]+)$/)
  if (!match) throw new Error('O PDF gerado não está em um formato válido.')
  const buffer = Buffer.from(match[1].replace(/\s/g, ''), 'base64')
  if (!buffer.length || buffer.length > 80 * 1024 * 1024) throw new Error('O PDF está vazio ou ultrapassa o limite de 80 MB.')
  return buffer
}

async function downloadDocument(storageKey, response) {
  if (!/^[a-zA-Z0-9_-]+$/.test(storageKey)) return sendJson(response, 400, { error: 'Identificação de documento inválida.' })
  const metadata = database.prepare('SELECT file_name FROM documents WHERE storage_key = ?').get(storageKey)
  const filePath = join(documentsDirectory, `${storageKey}.pdf`)
  if (!metadata || !existsSync(filePath)) return sendJson(response, 404, { error: 'Documento não encontrado no servidor.' })
  const content = await readFile(filePath)
  const safeName = String(metadata.file_name || `${storageKey}.pdf`).replace(/[\r\n"]/g, '')
  response.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': content.length,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    'Cache-Control': 'private, no-store',
  })
  response.end(content)
}

async function createRmaTicket(request, response) {
  const configuration = movideskConfiguration()
  if (!configuration.configured) return sendJson(response, 503, { error: 'Integração com o Movidesk ainda não configurada.', missing: configuration.missing })

  let body
  try {
    body = await readJsonBody(request)
  } catch (error) {
    const tooLarge = String(error?.message || '').includes('120 MB')
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
    const tooLarge = String(error?.message || '').includes('120 MB')
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
    const tooLarge = String(error?.message || '').includes('120 MB')
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

function sendHealth(response) {
  const movidesk = movideskConfiguration()
  const documents = database.prepare('SELECT COUNT(*) AS total FROM documents').get()
  return sendJson(response, 200, {
    application: 'GIO', status: 'online', serverTime: new Date().toISOString(),
    movideskConfigured: movidesk.configured, missingConfiguration: movidesk.missing,
    centralStorageConfigured: Boolean(stateRow()), storageType: 'SQLite', storedDocuments: Number(documents?.total || 0),
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
    filePath = join(distDirectory, 'index.html')
  }
  const content = await readFile(filePath)
  const extension = extname(filePath).toLowerCase()
  response.writeHead(200, {
    'Content-Type': mimeTypes.get(extension) || 'application/octet-stream',
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=86400',
  })
  response.end(content)
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0
    let tooLarge = false
    const chunks = []
    request.on('data', chunk => {
      if (tooLarge) return
      size += chunk.length
      if (size > requestLimitBytes) {
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (tooLarge) return rejectBody(new Error('Requisição maior que 120 MB.'))
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { rejectBody(new Error('JSON inválido.')) }
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
