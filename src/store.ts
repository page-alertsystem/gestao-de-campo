import { normalizeProfiles } from './access'

export type Person = {
  id: string
  name: string
  email: string
  groups: string[]
  active: boolean
  canLogin: boolean
  passwordHash?: string
  mustChangePassword?: boolean
}
export type Client = { id: string; name: string; city: string; state: string; latitude: string; longitude: string; active: boolean }
export type Vehicle = { id: string; plate: string; brand: string; model: string; city: string; state: string; mileage: number; active: boolean }
export type TrajectoryRecord = { id: string; type: string; declaredDate: string; declaredTime: string; recordedAt: string; formOpenedAt?: string; client: string; team: string[]; observation: string; latitude?: number; longitude?: number; accuracy?: number; author: string; pendingSync: boolean }
export type StockRequestStatus = 'Pedido recebido' | 'Em separação' | 'Pedido separado'
export type StockRequestItemStatus = 'Solicitado' | 'Cancelado' | 'Substituído'
export type StockRequestItem = {
  id: string
  equipment: string
  brand: string
  model: string
  quantity: number
  status: StockRequestItemStatus
  description?: string
  substitute?: { equipment: string; brand: string; model: string; quantity: number }
}
export type StockRequest = {
  id: string
  code: string
  createdAt: string
  requester: string
  technician: string
  client: string
  expectedDate: string
  generalNotes: string
  status: StockRequestStatus
  items: number
  requestedItems: StockRequestItem[]
  author: string
  assignmentStatus?: 'Enviado para aprovação'
  assignedPersonId?: string
  assignedPersonName?: string
  assignedAt?: string
}
export type KmRecord = { id: string; createdAt: string; formOpenedAt?: string; declaredDate?: string; declaredTime?: string; vehicle: string; driver: string; mileage: number; client?: string; destination: string; reason?: string; observation?: string; changeDriver: boolean; hasDamage: boolean; damages: { location: string; description: string }[]; latitude?: number; longitude?: number; accuracy?: number; pdfFileName?: string; pdfData?: string; pdfStorageKey?: string }
export type InventoryItem = { id: string; equipment: string; brand: string; model: string; category: 'Insumo' | 'Ferramenta pessoal' | 'Ferramenta rotativa' | 'EPI' | 'Escada'; unit: 'Unidade' | 'Caixa' | 'Metros' | 'Rolo'; quantity: number; minimum: number; code: string; notes: string }
export type StockAssignment = { id: string; personId: string; inventoryItemId: string; equipment: string; brand: string; model: string; category: InventoryItem['category']; unit: InventoryItem['unit']; code: string; quantity: number; assignedAt: string; assignedBy: string; notes: string; status: 'Pendente' | 'Aprovado e retirado'; approvedAt?: string; photo?: string; sourceRequestCode?: string }
export type MaterialDisposition = 'Instalado no cliente' | 'Devolvido ao estoque' | 'Danificado'
export type MaterialWorkflowStatus = 'Utilizado' | 'Aguardando recebimento' | 'Recebido' | 'Cancelado'
export type MaterialUsage = {
  id: string
  personId: string
  personName: string
  inventoryItemId: string
  equipment: string
  brand: string
  model: string
  category: InventoryItem['category']
  unit: InventoryItem['unit']
  code: string
  notes: string
  quantity: number
  declaredDate: string
  usedAt: string
  disposition: MaterialDisposition
  workflowStatus: MaterialWorkflowStatus
  description: string
  photo: string
  processedAt?: string
  processedBy?: string
}
export type AuditCategory = 'Ferramentas' | 'EPIs' | 'Escadas'
export type AuditItemResult = { inventoryItemId: string; equipment: string; code: string; answers: { question: string; answer: boolean }[]; photo: string; approved: boolean }
export type AuditRecord = { id: string; personId: string; category: AuditCategory; auditorName: string; auditedName: string; scheduledDate?: string; nextAuditDate: string; startedAt: string; completedAt: string; pdfFileName: string; pdfData?: string; pdfStorageKey?: string; results: AuditItemResult[] }
export type Notification = { id: string; title: string; detail: string; createdAt: string; read: boolean; critical: boolean }
export type AdminAccount = { id: string; name: string; email: string; passwordHash: string; mustChangePassword: boolean }

export function accountFromPerson(person: Person, fallback?: AdminAccount): AdminAccount {
  const legacyAccount = fallback?.id === person.id ? fallback : undefined
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    passwordHash: person.passwordHash ?? legacyAccount?.passwordHash ?? '',
    mustChangePassword: person.mustChangePassword ?? legacyAccount?.mustChangePassword ?? false,
  }
}
export type RmaUrgency = 'Baixa' | 'Média' | 'Alta'

function normalizeRmaUrgency(value: unknown): RmaUrgency {
  if (value === 'Baixa' || value === 'Alta') return value
  if (value === 'Urgente') return 'Alta'
  return 'Média'
}
export type RmaStatus = 'Aguardando integração Movidesk' | 'Enviado ao Movidesk' | 'Pedido recebido'
export type RmaRequest = {
  id: string
  localCode: string
  movideskTicketId: string
  movideskInternalId?: string
  movideskActionId?: string
  title: string
  client: string
  equipment: string
  withdrawalDate: string
  technicianId: string
  technicianName: string
  service: string
  category: string
  urgency: RmaUrgency
  details: string
  photo: string
  createdAt: string
  status: RmaStatus
  sentToMovideskAt?: string
  photoSentToMovideskAt?: string
  integrationError?: string
  receivedAt?: string
  receivedBy?: string
  printCount: number
  lastPrintedAt?: string
}

export type SurveyRequest = {
  id: string
  localCode: string
  movideskTicketId: string
  movideskInternalId?: string
  movideskActionId?: string
  client: string
  startDate: string
  endDate: string
  area: string
  details: string
  photo: string
  requestedById: string
  requestedByName: string
  createdAt: string
  status: string
  resolved: boolean
  sentToMovideskAt?: string
  photoSentToMovideskAt?: string
  lastStatusCheckAt?: string
  integrationError?: string
}

export type AppData = {
  account: AdminAccount
  people: Person[]
  clients: Client[]
  vehicles: Vehicle[]
  trajectories: TrajectoryRecord[]
  stockRequests: StockRequest[]
  kmRecords: KmRecord[]
  inventory: InventoryItem[]
  stockAssignments: StockAssignment[]
  materialUsages: MaterialUsage[]
  audits: AuditRecord[]
  rmaRequests: RmaRequest[]
  surveyRequests: SurveyRequest[]
  notifications: Notification[]
  permissions: string[]
}

const DB_NAME = 'gio-local-v1'
const STORE_NAME = 'application'
const DATA_KEY = 'state'

export function parseQuantity(value: string) {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN
  return Number(normalized)
}

export function formatQuantity(value: number) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 6 })
}

export async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(`gio-alert-v1:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('')
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readStored() {
  const database = await openDatabase()
  return new Promise<AppData | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(DATA_KEY)
    request.onsuccess = () => resolve(request.result as AppData | undefined)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
  })
}

export async function saveAppData(data: AppData) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(data, DATA_KEY)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => reject(transaction.error)
  })
}

export function normalizeAppData(stored: AppData): AppData {
  const people = (stored.people ?? []).map(person => {
    const isLegacyAccount = person.id === stored.account.id || (person.email && person.email.trim().toLowerCase() === stored.account.email.trim().toLowerCase())
    return {
      ...person,
      groups: normalizeProfiles(person.groups),
      passwordHash: person.passwordHash ?? (isLegacyAccount ? stored.account.passwordHash : undefined),
      mustChangePassword: person.mustChangePassword ?? (isLegacyAccount ? stored.account.mustChangePassword : false),
    }
  })
  const accountPerson = people.find(person => person.id === stored.account.id)
  return {
    ...stored,
    account: accountPerson ? accountFromPerson(accountPerson, stored.account) : stored.account,
    people,
    permissions: stored.permissions ?? [],
    stockRequests: (stored.stockRequests ?? []).map(request => {
      const requestedItems = request.requestedItems?.length ? request.requestedItems.map(item => ({ ...item, status: item.status ?? 'Solicitado' as const })) : Array.from({ length: request.items ?? 0 }, (_, index) => ({
        id: crypto.randomUUID(), equipment: `Item ${index + 1} de registro anterior`, brand: '', model: '', quantity: 1, status: 'Solicitado' as const,
      }))
      const validStatus: StockRequestStatus = ['Pedido recebido', 'Em separação', 'Pedido separado'].includes(request.status) ? request.status : 'Pedido recebido'
      return {
        ...request,
        requester: request.requester ?? request.author ?? stored.account.name,
        expectedDate: request.expectedDate ?? request.createdAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        generalNotes: request.generalNotes ?? '',
        status: validStatus,
        items: request.items ?? requestedItems.length,
        requestedItems,
      }
    }),
    stockAssignments: (stored.stockAssignments ?? []).map(item => {
      const inventoryItem = stored.inventory.find(entry => entry.id === item.inventoryItemId)
      return {
        ...item,
        equipment: item.equipment ?? inventoryItem?.equipment ?? 'Equipamento', brand: item.brand ?? inventoryItem?.brand ?? '', model: item.model ?? inventoryItem?.model ?? '',
        category: item.category ?? inventoryItem?.category ?? 'Insumo', unit: item.unit ?? inventoryItem?.unit ?? 'Unidade', code: item.code ?? inventoryItem?.code ?? 'SEM-CODIGO',
        status: item.status === 'Pendente' ? 'Pendente' : 'Aprovado e retirado',
      }
    }),
    materialUsages: (stored.materialUsages ?? []).map(item => {
      const legacy = item as MaterialUsage & { location?: string }
      const inventoryItem = stored.inventory.find(entry => entry.id === item.inventoryItemId)
      const disposition = item.disposition ?? 'Instalado no cliente'
      return {
        ...item,
        personName: item.personName ?? people.find(person => person.id === item.personId)?.name ?? stored.account.name,
        equipment: item.equipment ?? inventoryItem?.equipment ?? 'Item removido',
        brand: item.brand ?? inventoryItem?.brand ?? '',
        model: item.model ?? inventoryItem?.model ?? '',
        category: item.category ?? inventoryItem?.category ?? 'Insumo',
        unit: item.unit ?? inventoryItem?.unit ?? 'Unidade',
        code: item.code ?? inventoryItem?.code ?? 'SEM-CODIGO',
        notes: item.notes ?? inventoryItem?.notes ?? '',
        disposition,
        workflowStatus: item.workflowStatus ?? (disposition === 'Instalado no cliente' ? 'Utilizado' : 'Aguardando recebimento'),
        description: item.description || legacy.location || 'Registro anterior',
        photo: item.photo ?? '',
      }
    }),
    audits: (stored.audits ?? []).map(audit => ({ ...audit, auditorName: audit.auditorName ?? stored.account.name, auditedName: audit.auditedName ?? people.find(person => person.id === audit.personId)?.name ?? 'Pessoa auditada', pdfFileName: audit.pdfFileName ?? 'Relatório anterior' })),
    rmaRequests: (stored.rmaRequests ?? []).map(item => ({
      ...item,
      localCode: item.localCode ?? `RMA-${item.id.slice(0, 8).toUpperCase()}`,
      movideskTicketId: item.movideskTicketId ?? '',
      title: item.title ?? `RMA: Manutenção - ${item.equipment} - ${item.client}`,
      service: item.service ?? 'Manutenção',
      category: item.category ?? 'RMA',
      urgency: normalizeRmaUrgency(item.urgency),
      photo: item.photo ?? '',
      status: item.status ?? 'Aguardando integração Movidesk',
      printCount: item.printCount ?? 0,
    })),
    surveyRequests: (stored.surveyRequests ?? []).map(item => ({
      ...item,
      localCode: item.localCode ?? `LEV-${item.id.slice(0, 8).toUpperCase()}`,
      movideskTicketId: item.movideskTicketId ?? '',
      requestedById: item.requestedById ?? stored.account.id,
      requestedByName: item.requestedByName ?? stored.account.name,
      photo: item.photo ?? '',
      status: item.status ?? 'Aguardando integração Movidesk',
      resolved: item.resolved ?? String(item.status ?? '').toLocaleLowerCase('pt-BR').includes('resolvid'),
    })),
  }
}

export async function loadAppData(): Promise<AppData> {
  const stored = await readStored()
  if (stored) return normalizeAppData(stored)
  const account: AdminAccount = {
    id: crypto.randomUUID(),
    name: 'Gabriel Alcantara',
    email: 'gabriel.alcantara@alertsystem.com.br',
    passwordHash: await hashPassword('GIO@2026'),
    mustChangePassword: true,
  }
  const initial: AppData = {
    account,
    people: [{ id: account.id, name: account.name, email: account.email, groups: ['Administrador'], active: true, canLogin: true, passwordHash: account.passwordHash, mustChangePassword: account.mustChangePassword }],
    clients: [], vehicles: [], trajectories: [], stockRequests: [], kmRecords: [], inventory: [], stockAssignments: [], materialUsages: [], audits: [], rmaRequests: [], surveyRequests: [], notifications: [], permissions: [],
  }
  await saveAppData(initial)
  return initial
}
