import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(serverDirectory, '..')
const distDirectory = join(projectDirectory, 'dist')

loadEnvironment(join(projectDirectory, '.env.server'))

const host = process.env.GIO_HOST?.trim() || '0.0.0.0'
const port = Number(process.env.GIO_PORT || 4173)
const movideskBaseUrl = (process.env.MOVIEDESK_API_BASE || 'https://api.movidesk.com/public/v1').replace(/\/$/, '')
const requestLimitBytes = 15 * 1024 * 1024
const movideskRequests = []

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
  setSecurityHeaders(response)
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

  try {
    if (url.pathname === '/api/health' && request.method === 'GET') return sendHealth(response)
    if (url.pathname === '/api/movidesk/rma' && request.method === 'POST') return await createRmaTicket(request, response)
    if (url.pathname === '/api/movidesk/rma/photo' && request.method === 'POST') return await uploadRmaPhoto(request, response)
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

process.on('SIGINT', () => server.close(() => process.exit(0)))
process.on('SIGTERM', () => server.close(() => process.exit(0)))

async function createRmaTicket(request, response) {
  const configuration = movideskConfiguration()
  if (!configuration.configured) return sendJson(response, 503, { error: 'Integração com o Movidesk ainda não configurada.', missing: configuration.missing })

  let body
  try {
    body = await readJsonBody(request)
  } catch (error) {
    const tooLarge = String(error?.message || '').includes('15 MB')
    return sendJson(response, tooLarge ? 413 : 400, { error: tooLarge ? 'A imagem ultrapassa o limite de 15 MB.' : 'O conteúdo enviado não é válido.' })
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
    const tooLarge = String(error?.message || '').includes('15 MB')
    return sendJson(response, tooLarge ? 413 : 400, { error: tooLarge ? 'A imagem ultrapassa o limite de 15 MB.' : 'O conteúdo enviado não é válido.' })
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

async function retrieveTicket(ticketId, response) {
  const configuration = movideskConfiguration()
  if (!configuration.configured) return sendJson(response, 503, { error: 'Integração com o Movidesk ainda não configurada.', missing: configuration.missing })
  if (!/^\d+$/.test(ticketId)) return sendJson(response, 400, { error: 'Número de ticket inválido.' })
  if (!allowMovideskRequest()) return sendJson(response, 429, { error: 'Limite temporário de chamadas ao Movidesk atingido. Aguarde um minuto.' })

  const query = new URLSearchParams({ token: configuration.token, id: ticketId })
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
  return sendJson(response, 200, {
    application: 'GIO', status: 'online', serverTime: new Date().toISOString(),
    movideskConfigured: movidesk.configured, missingConfiguration: movidesk.missing,
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
    'SOLICITAÇÃO DE RMA PELO GIO', '',
    `Código GIO: ${body.localCode}`, `Cliente informado: ${body.client}`, `Equipamento: ${body.equipment}`,
    `Data da retirada: ${formatDate(body.withdrawalDate)}`, `Técnico solicitante: ${body.technician}`,
    `Serviço: ${body.service || 'Manutenção'}`, `Categoria: ${body.category || 'RMA'}`, `Urgência: ${body.urgency || 'Normal'}`,
    '', 'Descrição do problema:', String(body.details), '', `Registrado no GIO em ${new Date().toLocaleString('pt-BR')}.`,
  ].join('\n')
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
      if (tooLarge) return rejectBody(new Error('Requisição maior que 15 MB.'))
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { rejectBody(new Error('JSON inválido.')) }
    })
    request.on('error', rejectBody)
  })
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

function setSecurityHeaders(response) {
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
