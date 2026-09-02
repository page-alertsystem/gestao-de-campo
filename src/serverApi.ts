import type { AppData } from './store'

const TOKEN_KEY = 'gio-server-token'
const EXPIRY_KEY = 'gio-server-token-expiry'
const localServerPorts = new Set(['4173'])

type RuntimeConfiguration = { apiBaseUrl?: string }
type LoginResponse = { token: string; expiresAt: string; data: AppData; revision: number; error?: string }
type SetupResponse = { token: string; expiresAt: string; revision: number; error?: string }
type HealthResponse = { centralStorageConfigured?: boolean; movideskConfigured?: boolean }

let apiBasePromise: Promise<string> | null = null
let currentRevision = 0
let saveQueue: Promise<void> = Promise.resolve()

function trimBase(value: string) {
  return value.trim().replace(/\/$/, '')
}

async function discoverApiBase() {
  if (localServerPorts.has(window.location.port) && ['localhost', '127.0.0.1'].includes(window.location.hostname)) return window.location.origin
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}server-config.json`, { cache: 'no-store' })
    if (!response.ok) return ''
    const configuration = await response.json() as RuntimeConfiguration
    return trimBase(String(configuration.apiBaseUrl || ''))
  } catch {
    return ''
  }
}

export function apiBaseUrl() {
  apiBasePromise ??= discoverApiBase()
  return apiBasePromise
}

function storeSession(token: string, expiresAt: string, revision: number) {
  sessionStorage.setItem(TOKEN_KEY, token)
  sessionStorage.setItem(EXPIRY_KEY, expiresAt)
  currentRevision = revision
}

export function clearServerSession() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(EXPIRY_KEY)
  currentRevision = 0
}

function validToken() {
  const token = sessionStorage.getItem(TOKEN_KEY) || ''
  const expiry = Date.parse(sessionStorage.getItem(EXPIRY_KEY) || '')
  if (!token || !Number.isFinite(expiry) || expiry <= Date.now()) {
    clearServerSession()
    return ''
  }
  return token
}

async function responseMessage(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string }
  return body.error || `Não foi possível acessar o servidor GIO (${response.status}).`
}

export async function serverApiFetch(path: string, init: RequestInit = {}, authenticated = true) {
  const base = await apiBaseUrl()
  if (!base) throw new Error('O endereço do servidor GIO não está configurado.')
  const headers = new Headers(init.headers)
  if (authenticated) {
    const token = validToken()
    if (!token) throw new Error('Sua sessão com o servidor expirou. Entre novamente na GIO.')
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, { ...init, headers })
}

export async function initializeCentralData(localData: AppData) {
  const base = await apiBaseUrl()
  if (!base) return { active: false, authenticated: false, data: localData }
  let health: HealthResponse
  try {
    const response = await serverApiFetch('/api/health', { headers: { Accept: 'application/json' } }, false)
    if (!response.ok) throw new Error(await responseMessage(response))
    health = await response.json() as HealthResponse
  } catch {
    return { active: true, authenticated: false, data: localData }
  }

  if (!health.centralStorageConfigured && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    const response = await serverApiFetch('/api/setup/state', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: localData }),
    }, false)
    if (!response.ok) throw new Error(await responseMessage(response))
    const result = await response.json() as SetupResponse
    storeSession(result.token, result.expiresAt, result.revision)
    return { active: true, authenticated: true, data: localData }
  }

  if (!validToken()) return { active: true, authenticated: false, data: localData }
  try {
    const response = await serverApiFetch('/api/state', { headers: { Accept: 'application/json' } })
    if (!response.ok) {
      if (response.status === 401) clearServerSession()
      return { active: true, authenticated: false, data: localData }
    }
    const result = await response.json() as { data: AppData; revision: number }
    currentRevision = Number(result.revision) || 0
    return { active: true, authenticated: true, data: result.data }
  } catch {
    return { active: true, authenticated: false, data: localData }
  }
}

export async function loginCentralServer(email: string, password: string) {
  const base = await apiBaseUrl()
  if (!base) return { usedServer: false as const }
  let response: Response
  try {
    response = await serverApiFetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    }, false)
  } catch {
    return { usedServer: true as const, error: 'O servidor deste notebook está indisponível. Verifique se ele está ligado e conectado à internet.' }
  }
  if (!response.ok) return { usedServer: true as const, error: await responseMessage(response) }
  const result = await response.json() as LoginResponse
  storeSession(result.token, result.expiresAt, result.revision)
  return { usedServer: true as const, data: result.data }
}

export function saveCentralData(data: AppData) {
  if (!validToken()) return Promise.resolve()
  saveQueue = saveQueue.catch(() => undefined).then(async () => {
    const response = await serverApiFetch('/api/state', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, revision: currentRevision }),
    })
    if (!response.ok) {
      if (response.status === 401) clearServerSession()
      throw new Error(await responseMessage(response))
    }
    const result = await response.json() as { revision: number }
    currentRevision = Number(result.revision) || currentRevision
  })
  return saveQueue
}

export async function downloadServerDocument(storageKey: string, fileName: string) {
  const response = await serverApiFetch(`/api/documents/${encodeURIComponent(storageKey)}`)
  if (!response.ok) throw new Error(await responseMessage(response))
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
