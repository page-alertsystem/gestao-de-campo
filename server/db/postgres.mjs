// Camada de dados PostgreSQL do GIO.
// Mantém o formato de dados usado pelo aplicativo (AppData), mas grava cada
// coleção na sua própria tabela, com permissões verificadas no servidor e
// mesclagem por registro (edições simultâneas não apagam o trabalho de ninguém).
import pg from 'pg'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const schemaFile = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql')
const SESSION_HOURS = 12

// ---------------------------------------------------------------------------
// Perfis (espelha src/access.ts)
// ---------------------------------------------------------------------------
const PROFILE_NAMES = ['Técnico', 'RH', 'Logística', 'Estoque', 'Auditoria', 'Service Desk', 'Implantação', 'Manutenção', 'TST', 'Administrador']
const LEGACY_PROFILES = { 'Técnico de Campo': 'Técnico', Auditor: 'Auditoria', 'Segurança do Trabalho': 'TST', 'Seg. Trabalho': 'TST', RMA: 'Manutenção' }

export function normalizeProfiles(groups) {
  const list = (Array.isArray(groups) ? groups : []).map(group => LEGACY_PROFILES[group] ?? group).filter(group => PROFILE_NAMES.includes(group))
  return new Set(['Técnico', ...list])
}

function contextFor(personRow) {
  const data = personRow?.data || {}
  const profiles = normalizeProfiles(data.groups)
  const isAdmin = profiles.has('Administrador')
  return {
    id: String(personRow?.id || ''),
    name: String(data.name || ''),
    isAdmin,
    has: (...names) => isAdmin || names.some(name => profiles.has(name)),
  }
}

// ---------------------------------------------------------------------------
// Coleções e regras de acesso
//   visible(record, ctx)  -> o usuário pode ver o registro
//   create(record, ctx)   -> pode criar
//   update(old, ctx)      -> true (tudo), array de campos permitidos, ou false
//   remove(old, ctx)      -> pode excluir
// ---------------------------------------------------------------------------
const everyone = () => true
const adminOnly = (_record, ctx) => ctx.isAdmin
const sameName = (value, ctx) => Boolean(ctx.name) && String(value || '').trim().toLowerCase() === ctx.name.trim().toLowerCase()

const COLLECTIONS = [
  { key: 'people', table: 'people', label: 'Pessoas' },
  { key: 'clients', table: 'clients', visible: everyone, create: adminOnly, update: adminOnly, remove: adminOnly },
  { key: 'vehicles', table: 'vehicles', visible: everyone, create: adminOnly, remove: adminOnly,
    update: (_old, ctx) => ctx.isAdmin ? true : ['mileage'] },
  { key: 'inventory', table: 'inventory_items', visible: everyone,
    create: (_r, ctx) => ctx.has('Estoque'), remove: (_r, ctx) => ctx.has('Estoque'),
    update: (_old, ctx) => ctx.has('Estoque') ? true : ['ladderRestriction'] },
  { key: 'stockRequests', table: 'stock_requests', uniqueCode: 'code', visible: everyone, create: everyone,
    update: (old, ctx) => ctx.has('Estoque', 'Service Desk', 'Implantação') || sameName(old.author, ctx) || sameName(old.requester, ctx),
    remove: (_old, ctx) => ctx.has('Estoque') },
  { key: 'stockAssignments', table: 'stock_assignments',
    visible: (r, ctx) => ctx.has('Estoque', 'Auditoria') || String(r.personId) === ctx.id,
    create: (_r, ctx) => ctx.has('Estoque'),
    update: (old, ctx) => ctx.has('Estoque') ? true : String(old.personId) === ctx.id ? ['status', 'approvedAt'] : false,
    remove: (_old, ctx) => ctx.has('Estoque') },
  { key: 'materialUsages', table: 'material_usages',
    visible: (r, ctx) => ctx.has('Estoque', 'Auditoria', 'TST') || String(r.personId) === ctx.id,
    create: (r, ctx) => ctx.has('Estoque') || String(r.personId) === ctx.id,
    update: (old, ctx) => ctx.has('Estoque', 'TST') || String(old.personId) === ctx.id,
    remove: adminOnly },
  { key: 'equipmentCategories', table: 'equipment_categories', visible: everyone, create: adminOnly, update: adminOnly, remove: adminOnly },
  { key: 'equipmentApprovalRequests', table: 'equipment_approval_requests',
    visible: (r, ctx) => ctx.has('TST', 'Estoque') || String(r.personId) === ctx.id,
    create: everyone,
    update: (_old, ctx) => ctx.has('TST', 'Estoque'),
    remove: adminOnly },
  { key: 'equipmentStockRequests', table: 'equipment_stock_requests',
    visible: (r, ctx) => ctx.has('TST', 'Estoque') || String(r.personId) === ctx.id,
    create: (_r, ctx) => ctx.has('TST', 'Estoque'),
    update: (old, ctx) => ctx.has('TST', 'Estoque') ? true : String(old.personId) === ctx.id ? ['status', 'completedAt'] : false,
    remove: adminOnly },
  { key: 'trajectories', table: 'trajectories',
    visible: (r, ctx) => ctx.has('RH') || sameName(r.author, ctx), create: everyone,
    update: (old, ctx) => ctx.isAdmin || sameName(old.author, ctx), remove: adminOnly },
  { key: 'kmRecords', table: 'km_records', pdfType: 'troca-veiculo',
    visible: (r, ctx) => ctx.has('Logística') || sameName(r.driver, ctx), create: everyone,
    update: (old, ctx) => ctx.isAdmin || sameName(old.driver, ctx), remove: adminOnly },
  { key: 'audits', table: 'audits', pdfType: 'auditoria',
    visible: (r, ctx) => ctx.has('Auditoria') || String(r.personId) === ctx.id || sameName(r.auditorName, ctx), create: everyone,
    update: (_old, ctx) => ctx.has('Auditoria'), remove: adminOnly },
  { key: 'rmaRequests', table: 'rma_requests', uniqueCode: 'localCode',
    visible: (r, ctx) => ctx.has('Manutenção') || String(r.technicianId) === ctx.id, create: everyone,
    update: (old, ctx) => ctx.has('Manutenção') || String(old.technicianId) === ctx.id, remove: adminOnly },
  { key: 'surveyRequests', table: 'survey_requests', uniqueCode: 'localCode',
    visible: (r, ctx) => ctx.has('Service Desk', 'Implantação') || String(r.requestedById) === ctx.id, create: everyone,
    update: (old, ctx) => ctx.has('Service Desk', 'Implantação') || String(old.requestedById) === ctx.id, remove: adminOnly },
  { key: 'returnCallRequests', table: 'return_call_requests', uniqueCode: 'localCode',
    visible: (r, ctx) => ctx.isAdmin || String(r.openedById) === ctx.id, create: everyone,
    update: (old, ctx) => ctx.isAdmin || String(old.openedById) === ctx.id, remove: adminOnly },
  { key: 'systemPreventives', table: 'system_preventives', uniqueCode: 'code',
    visible: (r, ctx) => ctx.has('Service Desk', 'Implantação') || String(r.createdById) === ctx.id, create: everyone,
    update: (old, ctx) => ctx.isAdmin || String(old.createdById) === ctx.id, remove: adminOnly },
  { key: 'aprRecords', table: 'apr_records', pdfType: 'apr-aprovada',
    visible: (r, ctx) => ctx.isAdmin || String(r.createdById) === ctx.id, create: everyone,
    update: (old, ctx) => ctx.isAdmin || String(old.createdById) === ctx.id, remove: adminOnly },
  { key: 'notifications', table: 'notifications', visible: everyone, create: everyone, update: everyone, remove: adminOnly },
]
const COLLECTION_BY_PDF_TYPE = Object.fromEntries(COLLECTIONS.filter(c => c.pdfType).map(c => [c.pdfType, c]))

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}
const same = (a, b) => stable(a) === stable(b)
const hashToken = token => createHash('sha256').update(token).digest('hex')

function safeEqual(first, second) {
  const a = Buffer.from(String(first))
  const b = Buffer.from(String(second))
  return a.length === b.length && timingSafeEqual(a, b)
}

export function parsePdfData(value) {
  const match = String(value || '').match(/^data:application\/pdf[^,]*;base64,([a-zA-Z0-9+/=\r\n]+)$/)
  if (!match) throw Object.assign(new Error('O PDF gerado não está em um formato válido.'), { status: 400 })
  const buffer = Buffer.from(match[1].replace(/\s/g, ''), 'base64')
  if (!buffer.length || buffer.length > 80 * 1024 * 1024) throw Object.assign(new Error('O PDF está vazio ou ultrapassa o limite de 80 MB.'), { status: 400 })
  return buffer
}

// Separa o PDF em base64 do registro; ele vai para a tabela documents.
function preparePdf(collection, record) {
  if (!collection.pdfType) return { record, pdf: null }
  if (collection.key === 'kmRecords' && !record.changeDriver) return { record, pdf: null }
  const clean = { ...record }
  delete clean.pdfUrl
  if (!String(clean.pdfData || '').startsWith('data:application/pdf')) {
    delete clean.pdfData
    return { record: clean, pdf: null }
  }
  const content = parsePdfData(clean.pdfData)
  const storageKey = `${collection.pdfType}-${String(record.id)}`.replace(/[^a-zA-Z0-9_-]/g, '')
  delete clean.pdfData
  clean.pdfStorageKey = storageKey
  return {
    record: clean,
    pdf: { storageKey, recordType: collection.pdfType, recordId: String(record.id), fileName: String(record.pdfFileName || `${storageKey}.pdf`), content },
  }
}

function personFromRow(row, includePassword) {
  const person = { ...row.data, id: String(row.id) }
  delete person.passwordHash
  if (includePassword) {
    person.passwordHash = row.password_hash || ''
    person.mustChangePassword = Boolean(row.must_change_password)
  } else {
    person.mustChangePassword = Boolean(row.must_change_password)
  }
  return person
}

function splitPerson(person) {
  const data = { ...person }
  const passwordHash = typeof data.passwordHash === 'string' ? data.passwordHash : undefined
  const mustChangePassword = typeof data.mustChangePassword === 'boolean' ? data.mustChangePassword : undefined
  delete data.passwordHash
  delete data.mustChangePassword
  return { data, passwordHash, mustChangePassword }
}

// ---------------------------------------------------------------------------
// Repositório
// ---------------------------------------------------------------------------
export function createRepository(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL não configurado no .env.server.')
  const pool = new pg.Pool({ connectionString, max: 10 })
  pool.on('error', error => console.error('[PostgreSQL]', error.message))

  async function transaction(work) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async function migrate() {
    await pool.query(readFileSync(schemaFile, 'utf8'))
  }

  async function currentRevision(client = pool) {
    const { rows } = await client.query("SELECT value FROM gio_meta WHERE key = 'revision'")
    return Number(rows[0]?.value || 0)
  }

  async function isConfigured() {
    const { rows } = await pool.query('SELECT 1 FROM people WHERE can_login AND deleted_at IS NULL LIMIT 1')
    return rows.length > 0
  }

  async function personById(id, client = pool) {
    const { rows } = await client.query('SELECT * FROM people WHERE id = $1 AND deleted_at IS NULL', [String(id)])
    return rows[0] || null
  }

  async function writeDocument(client, pdf) {
    await client.query(`INSERT INTO documents (storage_key, record_type, record_id, file_name, content, size_bytes)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (storage_key) DO UPDATE SET file_name = excluded.file_name, content = excluded.content, size_bytes = excluded.size_bytes, updated_at = now()`,
    [pdf.storageKey, pdf.recordType, pdf.recordId, pdf.fileName, pdf.content, pdf.content.length])
  }

  async function log(client, personId, collection, recordId, action, rev) {
    await client.query('INSERT INTO change_log (person_id, collection, record_id, action, rev) VALUES ($1, $2, $3, $4, $5)', [personId || null, collection, String(recordId), action, rev])
  }

  // ----- Estado para um usuário --------------------------------------------
  async function loadState(personId) {
    const me = await personById(personId)
    if (!me) return null
    const ctx = contextFor(me)
    const revision = await currentRevision()
    const state = { permissions: [] }
    for (const collection of COLLECTIONS) {
      const { rows } = await pool.query(`SELECT * FROM ${collection.table} WHERE deleted_at IS NULL ORDER BY created_at, id`)
      if (collection.key === 'people') {
        state.people = rows.map(row => personFromRow(row, String(row.id) === ctx.id))
        continue
      }
      state[collection.key] = rows.map(row => ({ ...row.data, id: String(row.id) })).filter(record => collection.visible(record, ctx))
    }
    state.account = {
      id: ctx.id,
      name: ctx.name,
      email: String(me.data.email || ''),
      passwordHash: me.password_hash || '',
      mustChangePassword: Boolean(me.must_change_password),
    }
    return { data: state, revision }
  }

  // ----- Configuração inicial ----------------------------------------------
  async function setup(data) {
    return transaction(async client => {
      const existing = await client.query('SELECT 1 FROM people WHERE can_login AND deleted_at IS NULL LIMIT 1')
      if (existing.rows.length) throw Object.assign(new Error('O armazenamento central já foi configurado.'), { status: 409 })
      const rev = 1
      const account = data.account || {}
      const people = Array.isArray(data.people) ? [...data.people] : []
      let accountPerson = people.find(p => String(p?.id) === String(account.id)) || people.find(p => String(p?.email || '').toLowerCase() === String(account.email || '').toLowerCase())
      if (!accountPerson && account.id) {
        accountPerson = { id: account.id, name: account.name, email: account.email, groups: ['Administrador'], active: true, canLogin: true }
        people.push(accountPerson)
      }
      if (accountPerson && !accountPerson.passwordHash) {
        accountPerson.passwordHash = account.passwordHash
        accountPerson.mustChangePassword = account.mustChangePassword ?? true
      }
      await importCollections(client, { ...data, people }, rev, String(accountPerson?.id || ''))
      await client.query("UPDATE gio_meta SET value = $1::jsonb WHERE key = 'revision'", [JSON.stringify(rev)])
      return { revision: rev, accountId: String(accountPerson?.id || '') }
    })
  }

  async function importCollections(client, data, rev, personId) {
    for (const collection of COLLECTIONS) {
      const list = Array.isArray(data[collection.key]) ? data[collection.key] : []
      for (const raw of list) {
        if (!raw || raw.id === undefined || raw.id === null || raw.id === '') continue
        const id = String(raw.id)
        if (collection.key === 'people') {
          const { data: personData, passwordHash, mustChangePassword } = splitPerson({ ...raw, id })
          await client.query(`INSERT INTO people (id, data, password_hash, must_change_password, rev, updated_by) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO NOTHING`, [id, personData, passwordHash || null, Boolean(mustChangePassword), rev, personId || null])
          continue
        }
        const { record, pdf } = preparePdf(collection, { ...raw, id })
        if (pdf) await writeDocument(client, pdf)
        await client.query(`INSERT INTO ${collection.table} (id, data, rev, updated_by) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`, [id, record, rev, personId || null])
      }
    }
  }

  // ----- Salvamento com mesclagem por registro -----------------------------
  async function applyState(personId, incoming, baseRevision) {
    return transaction(async client => {
      const { rows: metaRows } = await client.query("SELECT value FROM gio_meta WHERE key = 'revision' FOR UPDATE")
      const before = Number(metaRows[0]?.value || 0)
      const newRev = before + 1
      const base = Number.isFinite(Number(baseRevision)) ? Number(baseRevision) : -1
      const me = await personById(personId, client)
      if (!me) throw Object.assign(new Error('Sessão inválida.'), { status: 401 })
      const ctx = contextFor(me)
      const stats = { created: 0, updated: 0, deleted: 0, conflicts: 0, denied: 0, adjusted: 0 }

      for (const collection of COLLECTIONS) {
        const list = incoming?.[collection.key]
        if (!Array.isArray(list)) continue // coleção ausente: não mexe em nada
        const { rows } = await client.query(`SELECT * FROM ${collection.table}`)
        const existingById = new Map(rows.map(row => [String(row.id), row]))
        const seen = new Set()

        if (collection.key === 'people') {
          await applyPeople(client, ctx, list, incoming.account, existingById, seen, base, newRev, stats)
          continue
        }

        for (const raw of list) {
          if (!raw || raw.id === undefined || raw.id === null || raw.id === '') continue
          const id = String(raw.id)
          if (seen.has(id)) continue
          seen.add(id)
          const { record, pdf } = preparePdf(collection, { ...raw, id })
          if (!same(record, { ...raw, id })) stats.adjusted++
          const existing = existingById.get(id)

          if (!existing || existing.deleted_at) {
            if (existing?.deleted_at) { stats.denied++; continue } // registro excluído não volta sozinho
            if (!collection.create(record, ctx)) { stats.denied++; continue }
            if (collection.uniqueCode) await ensureUniqueCode(client, collection, record, stats)
            if (pdf) await writeDocument(client, pdf)
            await client.query(`INSERT INTO ${collection.table} (id, data, rev, updated_by) VALUES ($1, $2, $3, $4)`, [id, record, newRev, ctx.id])
            await log(client, ctx.id, collection.key, id, 'create', newRev)
            stats.created++
            continue
          }

          const current = { ...existing.data, id }
          if (same(current, record)) continue
          if (Number(existing.rev) > base) { stats.conflicts++; continue } // alterado por outra pessoa depois que este usuário carregou os dados
          const rule = collection.update(current, ctx)
          let next = record
          if (Array.isArray(rule)) {
            next = { ...current }
            for (const field of rule) if (field in record) next[field] = record[field]; else delete next[field]
            if (same(next, current)) { stats.denied++; continue }
            if (!same(next, record)) stats.adjusted++
          } else if (!rule) { stats.denied++; continue }
          if (pdf) await writeDocument(client, pdf)
          await client.query(`UPDATE ${collection.table} SET data = $2, rev = $3, updated_at = now(), updated_by = $4 WHERE id = $1`, [id, next, newRev, ctx.id])
          await log(client, ctx.id, collection.key, id, 'update', newRev)
          stats.updated++
        }

        // Registros que o usuário via e não enviou de volta = exclusão
        for (const [id, existing] of existingById) {
          if (seen.has(id) || existing.deleted_at) continue
          const current = { ...existing.data, id }
          if (!collection.visible(current, ctx)) continue
          if (Number(existing.rev) > base) continue // criado/alterado por outra pessoa; o usuário ainda não tinha visto
          if (!collection.remove(current, ctx)) { stats.denied++; continue }
          await client.query(`UPDATE ${collection.table} SET deleted_at = now(), rev = $2, updated_by = $3 WHERE id = $1`, [id, newRev, ctx.id])
          await log(client, ctx.id, collection.key, id, 'delete', newRev)
          stats.deleted++
        }
      }

      const changed = stats.created + stats.updated + stats.deleted > 0
      if (changed) await client.query("UPDATE gio_meta SET value = $1::jsonb WHERE key = 'revision'", [JSON.stringify(newRev)])
      const revision = changed ? newRev : before
      const needsRefresh = before !== base || stats.conflicts > 0 || stats.denied > 0 || stats.adjusted > 0
      return { revision, stats, needsRefresh }
    })
  }

  async function applyPeople(client, ctx, list, account, existingById, seen, base, newRev, stats) {
    for (const raw of list) {
      if (!raw || raw.id === undefined || raw.id === null || raw.id === '') continue
      const id = String(raw.id)
      if (seen.has(id)) continue
      seen.add(id)
      const existing = existingById.get(id)
      const { data, passwordHash, mustChangePassword } = splitPerson({ ...raw, id })
      const isSelf = id === ctx.id

      if (!existing) {
        // Não administradores só podem cadastrar pessoas sem acesso ao sistema (ex.: técnico citado num pedido).
        if (!ctx.isAdmin && data.canLogin === true) { stats.denied++; continue }
        await client.query('INSERT INTO people (id, data, password_hash, must_change_password, rev, updated_by) VALUES ($1, $2, $3, $4, $5, $6)',
          [id, data, ctx.isAdmin ? passwordHash || null : null, ctx.isAdmin ? Boolean(mustChangePassword ?? true) : false, newRev, ctx.id])
        await log(client, ctx.id, 'people', id, 'create', newRev)
        stats.created++
        continue
      }
      if (existing.deleted_at) { stats.denied++; continue }

      const current = { ...existing.data, id }
      let nextData = current
      let nextHash = existing.password_hash
      let nextMust = existing.must_change_password
      if (ctx.isAdmin) {
        nextData = data
        if (passwordHash) nextHash = passwordHash
        if (mustChangePassword !== undefined) nextMust = mustChangePassword
      }
      if (isSelf) {
        const selfHash = passwordHash || (account && String(account.id) === id ? account.passwordHash : undefined)
        if (selfHash && selfHash !== existing.password_hash) { nextHash = selfHash; nextMust = false }
      }
      const dataChanged = !same(nextData, current)
      const passwordChanged = nextHash !== existing.password_hash || Boolean(nextMust) !== Boolean(existing.must_change_password)
      if (!ctx.isAdmin && !same(data, current)) stats.denied++
      if (!dataChanged && !passwordChanged) continue
      if (dataChanged && Number(existing.rev) > base) { stats.conflicts++; continue }
      await client.query('UPDATE people SET data = $2, password_hash = $3, must_change_password = $4, rev = $5, updated_at = now(), updated_by = $6 WHERE id = $1',
        [id, nextData, nextHash, Boolean(nextMust), newRev, ctx.id])
      await log(client, ctx.id, 'people', id, passwordChanged && !dataChanged ? 'password' : 'update', newRev)
      if (passwordChanged) await client.query('DELETE FROM sessions WHERE person_id = $1 AND $1 <> $2', [id, ctx.id])
      stats.updated++
    }
    if (!ctx.isAdmin) return
    for (const [id, existing] of existingById) {
      if (seen.has(id) || existing.deleted_at) continue
      if (Number(existing.rev) > base) continue
      if (id === ctx.id) { stats.denied++; continue } // ninguém se exclui
      await client.query('UPDATE people SET deleted_at = now(), rev = $2, updated_by = $3 WHERE id = $1', [id, newRev, ctx.id])
      await client.query('DELETE FROM sessions WHERE person_id = $1', [id])
      await log(client, ctx.id, 'people', id, 'delete', newRev)
      stats.deleted++
    }
  }

  async function ensureUniqueCode(client, collection, record, stats) {
    const field = collection.uniqueCode
    const original = String(record[field] || '').trim()
    if (!original) return
    let candidate = original
    for (let attempt = 2; attempt < 1000; attempt++) {
      const { rows } = await client.query(`SELECT 1 FROM ${collection.table} WHERE data->>$1 = $2 AND deleted_at IS NULL LIMIT 1`, [field, candidate])
      if (!rows.length) break
      candidate = `${original}-${attempt}`
    }
    if (candidate !== original) {
      record[field] = candidate
      stats.adjusted++
    }
  }

  // ----- Login e sessões -----------------------------------------------------
  async function findLogin(email) {
    const { rows } = await pool.query('SELECT * FROM people WHERE email = $1 AND can_login AND active AND deleted_at IS NULL ORDER BY created_at LIMIT 1', [String(email).trim().toLowerCase()])
    return rows[0] || null
  }

  async function verifyLogin(email, informedHash) {
    const person = await findLogin(email)
    if (!person || !person.password_hash || !safeEqual(person.password_hash, informedHash)) return null
    return person
  }

  async function createSession(personId) {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000)
    await pool.query('DELETE FROM sessions WHERE expires_at < now()')
    await pool.query('INSERT INTO sessions (token_hash, person_id, expires_at) VALUES ($1, $2, $3)', [hashToken(token), String(personId), expiresAt])
    return { token, expiresAt: expiresAt.toISOString() }
  }

  async function sessionFor(token) {
    if (!token) return null
    const { rows } = await pool.query(`SELECT s.person_id, s.expires_at, p.must_change_password FROM sessions s
      JOIN people p ON p.id = s.person_id AND p.deleted_at IS NULL AND p.can_login AND p.active
      WHERE s.token_hash = $1 AND s.expires_at > now()`, [hashToken(token)])
    if (!rows[0]) return null
    return { accountId: String(rows[0].person_id), expiresAt: rows[0].expires_at, mustChangePassword: Boolean(rows[0].must_change_password) }
  }

  async function deleteSession(token) {
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
  }

  // ----- Documentos ----------------------------------------------------------
  async function documentFor(personId, storageKey) {
    const { rows } = await pool.query('SELECT storage_key, record_type, record_id, file_name, content FROM documents WHERE storage_key = $1', [storageKey])
    const document = rows[0]
    if (!document) return null
    const me = await personById(personId)
    if (!me) return null
    const ctx = contextFor(me)
    if (!ctx.isAdmin) {
      const collection = COLLECTION_BY_PDF_TYPE[document.record_type]
      if (!collection) return null
      const { rows: records } = await pool.query(`SELECT data FROM ${collection.table} WHERE id = $1 AND deleted_at IS NULL`, [document.record_id])
      if (!records[0] || !collection.visible({ ...records[0].data, id: document.record_id }, ctx)) return null
    }
    return { fileName: document.file_name, content: document.content }
  }

  async function documentCount() {
    const { rows } = await pool.query('SELECT count(*)::int AS total FROM documents')
    return rows[0]?.total || 0
  }

  async function ping() {
    await pool.query('SELECT 1')
  }

  return {
    pool, migrate, isConfigured, loadState, setup, applyState, verifyLogin, createSession, sessionFor, deleteSession,
    documentFor, documentCount, ping, importCollections, transaction, currentRevision,
    close: () => pool.end(),
  }
}

export { COLLECTIONS }
