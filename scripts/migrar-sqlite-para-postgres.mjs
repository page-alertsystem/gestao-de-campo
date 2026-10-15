// Importa os dados do banco antigo (SQLite em .gio-data\gio.db) para o PostgreSQL.
// Uso: node scripts/migrar-sqlite-para-postgres.mjs [caminho\para\.gio-data]
// - Só importa se o PostgreSQL ainda estiver vazio (não sobrescreve nada).
// - Os PDFs da pasta .gio-data\documents também vão para o banco.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRepository } from '../server/db/postgres.mjs'

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
loadEnvironment(join(projectDirectory, '.env.server'))

const dataDirectory = resolve(process.argv[2] || process.env.GIO_DATA_DIR?.trim() || join(projectDirectory, '.gio-data'))
const sqliteFile = join(dataDirectory, 'gio.db')
const documentsDirectory = join(dataDirectory, 'documents')

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL não encontrado no .env.server.')
  process.exit(1)
}

const repository = createRepository(process.env.DATABASE_URL.trim())
try {
  await repository.migrate()
  console.log('Estrutura do PostgreSQL criada/atualizada.')

  if (!existsSync(sqliteFile)) {
    console.log(`Nenhum banco antigo encontrado em ${sqliteFile}. Nada para importar.`)
    process.exit(0)
  }

  const { DatabaseSync } = await import('node:sqlite')
  const sqlite = new DatabaseSync(sqliteFile, { readOnly: true })
  const hasState = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_state'").get()
  const row = hasState ? sqlite.prepare('SELECT data, revision FROM app_state WHERE id = 1').get() : null
  if (!row) {
    console.log('O banco antigo está vazio. Nada para importar.')
    process.exit(0)
  }
  if (await repository.isConfigured()) {
    console.log('O PostgreSQL já possui dados. A importação foi ignorada para não sobrescrever nada.')
    process.exit(0)
  }

  const data = JSON.parse(String(row.data))
  const result = await repository.setup(data)
  console.log(`Dados importados (revisão ${result.revision}).`)

  // PDFs que o servidor antigo guardava em arquivos
  const hasDocuments = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'documents'").get()
  let imported = 0
  if (hasDocuments) {
    const documents = sqlite.prepare('SELECT storage_key, record_type, record_id, file_name FROM documents').all()
    for (const document of documents) {
      const file = join(documentsDirectory, `${document.storage_key}.pdf`)
      if (!existsSync(file)) continue
      const content = readFileSync(file)
      await repository.pool.query(`INSERT INTO documents (storage_key, record_type, record_id, file_name, content, size_bytes)
        VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (storage_key) DO NOTHING`,
      [String(document.storage_key), String(document.record_type), String(document.record_id), String(document.file_name), content, content.length])
      imported++
    }
  }
  console.log(`${imported} PDF(s) importado(s).`)
  sqlite.close()
} catch (error) {
  console.error(`Falha na migração: ${error.message}`)
  process.exitCode = 1
} finally {
  await repository.close()
}

function loadEnvironment(filePath) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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
