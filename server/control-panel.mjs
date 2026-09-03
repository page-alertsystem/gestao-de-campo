import http from 'node:http'
import { closeSync, existsSync, openSync } from 'node:fs'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(currentDirectory, '..')
const logsDirectory = path.join(projectDirectory, '.logs')
const publicConfigPath = path.join(projectDirectory, 'public', 'server-config.json')
const distConfigPath = path.join(projectDirectory, 'dist', 'server-config.json')
const serverPidPath = path.join(projectDirectory, '.gio-server.pid')
const tunnelPidPath = path.join(projectDirectory, '.gio-tunnel.pid')
const cloudflaredPath = path.join(projectDirectory, '.tools', 'cloudflared.exe')
const localHealthUrl = 'http://127.0.0.1:4173/api/health'
const publicGioUrl = 'https://page-alertsystem.github.io/gestao-de-campo/'
const publishedConfigUrl = `${publicGioUrl}server-config.json`
const controllerPort = 4180
const allowedOrigins = new Set([
  `http://127.0.0.1:${controllerPort}`,
  `http://localhost:${controllerPort}`,
])

let busy = false
let currentAction = 'Aguardando uma ação.'
let lastResult = 'Central iniciada.'
let lastError = ''

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function fetchJson(url, timeout = 4000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Resposta HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

async function readPublicConfig() {
  try {
    const value = JSON.parse(await readFile(publicConfigPath, 'utf8'))
    return typeof value.apiBaseUrl === 'string' ? value.apiBaseUrl.replace(/\/$/, '') : ''
  } catch {
    return ''
  }
}

async function readPid(filePath) {
  try {
    const value = Number.parseInt((await readFile(filePath, 'utf8')).trim(), 10)
    return Number.isInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

async function processImage(pid) {
  if (!pid) return ''
  try {
    const { stdout } = await execFileAsync(
      'tasklist.exe',
      ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
      { windowsHide: true },
    )
    const match = stdout.match(/^"([^"]+)","(\d+)"/m)
    return match && Number(match[2]) === pid ? match[1].toLowerCase() : ''
  } catch {
    return ''
  }
}

async function terminateProcess(pid, expectedImage) {
  if (!pid) return false
  const image = await processImage(pid)
  if (image !== expectedImage.toLowerCase()) return false
  try {
    await execFileAsync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
    return true
  } catch {
    return false
  }
}

async function listenerPid(port) {
  try {
    const { stdout } = await execFileAsync('netstat.exe', ['-ano', '-p', 'TCP'], { windowsHide: true })
    for (const line of stdout.split(/\r?\n/)) {
      const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i)
      if (match && Number(match[1]) === port) return Number(match[2])
    }
  } catch {}
  return null
}

function spawnBackground(executable, args, outputPath, errorPath) {
  const output = openSync(outputPath, 'a')
  const error = openSync(errorPath, 'a')
  try {
    const child = spawn(executable, args, {
      cwd: projectDirectory,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', output, error],
    })
    child.unref()
    return child
  } finally {
    closeSync(output)
    closeSync(error)
  }
}

async function localHealth() {
  try {
    return await fetchJson(localHealthUrl, 2500)
  } catch {
    return null
  }
}

async function publicHealth(publicApiUrl) {
  if (!publicApiUrl) return null
  try {
    return await fetchJson(`${publicApiUrl}/api/health`, 5000)
  } catch {
    return null
  }
}

async function startLocalServer() {
  const existingHealth = await localHealth()
  if (existingHealth) return existingHealth

  await mkdir(logsDirectory, { recursive: true })
  const child = spawnBackground(
    process.execPath,
    [path.join(projectDirectory, 'server', 'local-server.mjs')],
    path.join(logsDirectory, 'gio-server.log'),
    path.join(logsDirectory, 'gio-server-error.log'),
  )
  await writeFile(serverPidPath, String(child.pid), 'utf8')

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(300)
    const health = await localHealth()
    if (health) return health
  }
  throw new Error('O servidor local não respondeu. Consulte o erro exibido nesta central.')
}

async function stopLocalServer() {
  const pid = await listenerPid(4173)
  if (pid && (await processImage(pid)) === 'node.exe') {
    await terminateProcess(pid, 'node.exe')
  }
  await unlink(serverPidPath).catch(() => {})
}

async function stopTunnel() {
  const pid = await readPid(tunnelPidPath)
  await terminateProcess(pid, 'cloudflared.exe')
  await unlink(tunnelPidPath).catch(() => {})
}

async function writePublicConfig(tunnelUrl) {
  const content = `${JSON.stringify({ apiBaseUrl: tunnelUrl }, null, 2)}\n`
  await writeFile(publicConfigPath, content, 'utf8')
  if (existsSync(path.dirname(distConfigPath))) {
    await writeFile(distConfigPath, content, 'utf8')
  }
}

async function runGit(args, allowExitOne = false) {
  try {
    return await execFileAsync(
      'git.exe',
      ['-c', `safe.directory=${projectDirectory.replaceAll('\\', '/')}`, ...args],
      { cwd: projectDirectory, windowsHide: true, timeout: 120000 },
    )
  } catch (error) {
    if (allowExitOne && error.code === 1) return error
    const detail = String(error.stderr || error.stdout || error.message || '').trim()
    throw new Error(detail || 'Falha ao executar a publicação no GitHub.')
  }
}

async function waitForPages(tunnelUrl) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const config = await fetchJson(`${publishedConfigUrl}?v=${Date.now()}`, 5000)
      if (config.apiBaseUrl === tunnelUrl) return true
    } catch {}
    await sleep(2000)
  }
  return false
}

async function publishTunnelAddress(tunnelUrl) {
  currentAction = 'Publicando o novo endereço no GitHub Pages...'
  await runGit(['add', '--', 'public/server-config.json'])
  const diff = await runGit(['diff', '--cached', '--quiet'], true)
  if (diff.code === 1) {
    await runGit(['commit', '-m', 'chore: atualiza endereco temporario do GIO'])
    await runGit(['push', 'origin', 'develop:main'])
  }
  currentAction = 'Aguardando o GitHub Pages atualizar...'
  const published = await waitForPages(tunnelUrl)
  if (!published) {
    throw new Error('O túnel foi ligado, mas o GitHub Pages ainda não confirmou a atualização.')
  }
}

async function createTunnel() {
  if (!existsSync(cloudflaredPath)) {
    throw new Error('O programa do túnel não foi encontrado na pasta .tools.')
  }

  await stopTunnel()
  await mkdir(logsDirectory, { recursive: true })
  const timestamp = Date.now()
  const outputPath = path.join(logsDirectory, `gio-tunnel-${timestamp}.log`)
  const errorPath = path.join(logsDirectory, `gio-tunnel-${timestamp}-error.log`)
  const child = spawnBackground(
    cloudflaredPath,
    ['tunnel', '--url', 'http://127.0.0.1:4173', '--no-autoupdate'],
    outputPath,
    errorPath,
  )
  await writeFile(tunnelPidPath, String(child.pid), 'utf8')

  for (let attempt = 0; attempt < 80; attempt += 1) {
    await sleep(500)
    let log = ''
    try {
      log = `${await readFile(outputPath, 'utf8')}\n${await readFile(errorPath, 'utf8')}`
    } catch {}
    const match = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
    if (match) return match[0]
    if (child.exitCode !== null) break
  }
  throw new Error('Não foi possível obter um novo endereço público do túnel.')
}

async function ensureOnline(forceTunnel = false) {
  currentAction = 'Iniciando o servidor local...'
  await startLocalServer()

  const configuredUrl = await readPublicConfig()
  if (!forceTunnel && (await publicHealth(configuredUrl))) {
    return `O GIO já está online em ${publicGioUrl}`
  }

  currentAction = 'Criando uma nova conexão pública...'
  const tunnelUrl = await createTunnel()
  await writePublicConfig(tunnelUrl)
  await publishTunnelAddress(tunnelUrl)

  currentAction = 'Confirmando o acesso público...'
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await publicHealth(tunnelUrl)) return `GIO publicado e online em ${publicGioUrl}`
    await sleep(1000)
  }
  throw new Error('A publicação terminou, mas o acesso público ainda não respondeu.')
}

async function getStatus() {
  const configuredUrl = await readPublicConfig()
  const [local, online] = await Promise.all([
    localHealth(),
    publicHealth(configuredUrl),
  ])
  const tunnelPid = await readPid(tunnelPidPath)
  return {
    busy,
    currentAction,
    lastResult,
    lastError,
    localOnline: Boolean(local),
    publicOnline: Boolean(online),
    movideskConfigured: Boolean(local?.movideskConfigured),
    storageType: local?.storageType || 'Indisponível',
    tunnelProcessOnline: (await processImage(tunnelPid)) === 'cloudflared.exe',
    configuredUrl,
    publicGioUrl,
    checkedAt: new Date().toISOString(),
  }
}

async function runAction(label, action) {
  if (busy) throw new Error('Existe uma operação em andamento. Aguarde a conclusão.')
  busy = true
  currentAction = label
  lastError = ''
  try {
    lastResult = await action()
    currentAction = 'Operação concluída.'
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
    currentAction = 'A operação terminou com erro.'
    throw error
  } finally {
    busy = false
  }
}

const page = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Central de Controle GIO</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1d2329; background: #f3f5f4; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top left, #fff8e9 0, transparent 38%), #f3f5f4; }
    main { width: min(1040px, calc(100% - 32px)); margin: 0 auto; padding: 42px 0 60px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
    .brand { display: flex; align-items: center; gap: 15px; }
    .logo { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 16px; background: #ff7a00; color: white; font-size: 22px; font-weight: 900; box-shadow: 0 12px 30px rgba(255,122,0,.25); }
    h1 { margin: 0; font-size: clamp(24px, 4vw, 38px); line-height: 1.05; }
    .subtitle { color: #667078; margin: 7px 0 0; }
    .local { color: #667078; font-size: 13px; background: rgba(255,255,255,.72); border: 1px solid #dfe4e1; padding: 9px 12px; border-radius: 999px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .card { background: rgba(255,255,255,.92); border: 1px solid #dde3df; border-radius: 20px; padding: 22px; box-shadow: 0 12px 34px rgba(35,44,40,.06); }
    .status-card { min-height: 165px; }
    .label { margin: 0 0 16px; color: #727c83; font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .value { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 800; }
    .dot { width: 12px; height: 12px; border-radius: 50%; background: #a2a9ad; box-shadow: 0 0 0 5px rgba(162,169,173,.12); }
    .online .dot { background: #1a9c58; box-shadow: 0 0 0 5px rgba(26,156,88,.13); }
    .offline .dot { background: #d8483e; box-shadow: 0 0 0 5px rgba(216,72,62,.13); }
    .detail { color: #68727a; font-size: 14px; line-height: 1.55; margin: 14px 0 0; overflow-wrap: anywhere; }
    .wide { grid-column: 1 / -1; }
    .message { border-left: 4px solid #ff7a00; }
    .message.error { border-left-color: #d8483e; background: #fff8f7; }
    .message strong { display: block; margin-bottom: 6px; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; }
    button, a.button { appearance: none; border: 0; border-radius: 13px; padding: 13px 18px; font: inherit; font-weight: 800; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; transition: transform .15s ease, opacity .15s ease; }
    button:hover, a.button:hover { transform: translateY(-1px); }
    button:disabled { opacity: .5; cursor: wait; transform: none; }
    .primary { background: #ff7a00; color: #fff; }
    .secondary { background: #22282d; color: #fff; }
    .outline { background: #fff; color: #30373c; border: 1px solid #ccd3cf; }
    .danger { background: #fff; color: #c43c34; border: 1px solid #ebc7c4; }
    footer { color: #778087; font-size: 13px; margin-top: 18px; text-align: center; }
    @media (max-width: 760px) { header { align-items: flex-start; flex-direction: column; } .grid { grid-template-columns: 1fr; } .actions > * { flex: 1 1 100%; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand"><div class="logo">GIO</div><div><h1>Central de Controle</h1><p class="subtitle">Servidor local e conexão pública</p></div></div>
      <span class="local">Disponível somente neste computador</span>
    </header>
    <section class="grid">
      <article class="card status-card" id="localCard"><p class="label">Servidor local</p><div class="value"><span class="dot"></span><span id="localValue">Verificando...</span></div><p class="detail" id="localDetail">Banco de dados e aplicação.</p></article>
      <article class="card status-card" id="tunnelCard"><p class="label">Túnel Cloudflare</p><div class="value"><span class="dot"></span><span id="tunnelValue">Verificando...</span></div><p class="detail" id="tunnelDetail">Conexão deste notebook com a internet.</p></article>
      <article class="card status-card" id="publicCard"><p class="label">Acesso público</p><div class="value"><span class="dot"></span><span id="publicValue">Verificando...</span></div><p class="detail" id="publicDetail">GitHub Pages e endereço publicado.</p></article>
      <article class="card wide message" id="messageCard"><strong id="actionValue">Carregando status...</strong><span class="detail" id="messageValue">Aguarde um instante.</span></article>
      <article class="card wide"><p class="label">Comandos</p><div class="actions"><button class="primary" data-action="/api/start">Iniciar tudo e publicar</button><button class="secondary" data-action="/api/restart-tunnel">Reiniciar túnel</button><button class="danger" data-action="/api/stop">Parar GIO</button><button class="outline" id="refresh">Atualizar status</button><a class="button outline" href="${publicGioUrl}" target="_blank" rel="noreferrer">Abrir GIO público</a></div></article>
    </section>
    <footer>Central local do GIO · http://127.0.0.1:${controllerPort}</footer>
  </main>
  <script>
    const buttons = [...document.querySelectorAll('button[data-action]')]
    const setState = (id, online, text) => {
      const card = document.getElementById(id + 'Card')
      card.classList.toggle('online', online)
      card.classList.toggle('offline', !online)
      document.getElementById(id + 'Value').textContent = text
    }
    const request = async (url, options) => {
      const response = await fetch(url, options)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Falha na operação.')
      return data
    }
    const render = (status) => {
      setState('local', status.localOnline, status.localOnline ? 'Ligado' : 'Desligado')
      setState('tunnel', status.tunnelProcessOnline, status.tunnelProcessOnline ? 'Executando' : 'Parado')
      setState('public', status.publicOnline, status.publicOnline ? 'Disponível' : 'Indisponível')
      document.getElementById('localDetail').textContent = status.localOnline ? 'Armazenamento: ' + status.storageType + ' · Movidesk: ' + (status.movideskConfigured ? 'configurado' : 'pendente') : 'O servidor de dados não está respondendo.'
      document.getElementById('tunnelDetail').textContent = status.configuredUrl || 'Nenhum endereço público configurado.'
      document.getElementById('publicDetail').textContent = status.publicOnline ? status.publicGioUrl : 'O site não está alcançando este notebook.'
      document.getElementById('actionValue').textContent = status.currentAction
      const message = status.lastError || status.lastResult
      document.getElementById('messageValue').textContent = message
      document.getElementById('messageCard').classList.toggle('error', Boolean(status.lastError))
      buttons.forEach((button) => { button.disabled = status.busy })
    }
    const refresh = async () => {
      try { render(await request('/api/status')) }
      catch (error) { document.getElementById('actionValue').textContent = 'A central não respondeu.'; document.getElementById('messageValue').textContent = error.message }
    }
    const perform = async (path) => {
      buttons.forEach((button) => { button.disabled = true })
      document.getElementById('actionValue').textContent = 'Executando. Não feche esta aba...'
      document.getElementById('messageValue').textContent = 'A publicação pode levar aproximadamente um minuto.'
      try { render(await request(path, { method: 'POST' })) }
      catch (error) { await refresh(); document.getElementById('messageValue').textContent = error.message }
      finally { buttons.forEach((button) => { button.disabled = false }) }
    }
    buttons.forEach((button) => button.addEventListener('click', () => perform(button.dataset.action)))
    document.getElementById('refresh').addEventListener('click', refresh)
    refresh()
    setInterval(refresh, 5000)
  </script>
</body>
</html>`

function sendJson(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

function requestIsLocal(request) {
  const host = String(request.headers.host || '').toLowerCase()
  const origin = request.headers.origin
  return (host === `127.0.0.1:${controllerPort}` || host === `localhost:${controllerPort}`)
    && (!origin || allowedOrigins.has(origin))
}

const server = http.createServer(async (request, response) => {
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('x-frame-options', 'DENY')
  response.setHeader('referrer-policy', 'no-referrer')
  response.setHeader('content-security-policy', "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

  if (!requestIsLocal(request)) {
    sendJson(response, 403, { error: 'Acesso permitido somente neste computador.' })
    return
  }

  const url = new URL(request.url || '/', `http://127.0.0.1:${controllerPort}`)
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    response.end(page)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/status') {
    sendJson(response, 200, await getStatus())
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/start') {
    try {
      await runAction('Ligando o GIO...', () => ensureOnline(false))
      sendJson(response, 200, await getStatus())
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/restart-tunnel') {
    try {
      await runAction('Reiniciando a conexão pública...', () => ensureOnline(true))
      sendJson(response, 200, await getStatus())
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/stop') {
    try {
      await runAction('Desligando o GIO...', async () => {
        await stopTunnel()
        await stopLocalServer()
        return 'Servidor e túnel foram desligados.'
      })
      sendJson(response, 200, await getStatus())
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  sendJson(response, 404, { error: 'Página não encontrada.' })
})

server.listen(controllerPort, '127.0.0.1', () => {
  console.log(`Central de Controle GIO disponível em http://127.0.0.1:${controllerPort}`)
})

