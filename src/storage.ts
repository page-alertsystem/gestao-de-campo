import type { Database } from './types'

const key = 'gestao-campo-db-v2'
const empty: Database = { clientes: [], tecnicos: [], trajetos: [], km: [] }

export function readDatabase(): Database {
  try {
    const saved = localStorage.getItem(key)
    return saved ? { ...empty, ...JSON.parse(saved) } : empty
  } catch {
    return empty
  }
}

export function writeDatabase(data: Database) {
  localStorage.setItem(key, JSON.stringify(data))
}

export const id = () => crypto.randomUUID()
