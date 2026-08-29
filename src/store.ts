export type Person = { id: string; name: string; email: string; groups: string[]; active: boolean; canLogin: boolean }
export type Client = { id: string; name: string; city: string; state: string; latitude: string; longitude: string; active: boolean }
export type Vehicle = { id: string; plate: string; brand: string; model: string; city: string; state: string; mileage: number; active: boolean }
export type TrajectoryRecord = { id: string; type: string; declaredDate: string; declaredTime: string; recordedAt: string; client: string; team: string[]; observation: string; latitude?: number; longitude?: number; accuracy?: number; author: string; pendingSync: boolean }
export type StockRequest = { id: string; code: string; createdAt: string; technician: string; client: string; status: string; items: number; author: string }
export type KmRecord = { id: string; createdAt: string; vehicle: string; driver: string; mileage: number; destination: string; changeDriver: boolean; hasDamage: boolean; damages: { location: string; description: string }[]; latitude?: number; longitude?: number; accuracy?: number }
export type InventoryItem = { id: string; equipment: string; brand: string; model: string; category: 'Insumo' | 'Ferramenta pessoal' | 'Ferramenta rotativa' | 'EPI'; unit: 'Unidade' | 'Caixa' | 'Metros' | 'Rolo'; quantity: number; minimum: number; code: string; notes: string }
export type StockAssignment = { id: string; personId: string; inventoryItemId: string; equipment: string; brand: string; model: string; category: InventoryItem['category']; unit: InventoryItem['unit']; code: string; quantity: number; assignedAt: string; assignedBy: string; notes: string; status: 'Pendente' | 'Aprovado e retirado'; approvedAt?: string }
export type MaterialUsage = { id: string; personId: string; inventoryItemId: string; quantity: number; declaredDate: string; usedAt: string; location: string; description: string }
export type Notification = { id: string; title: string; detail: string; createdAt: string; read: boolean; critical: boolean }
export type AdminAccount = { id: string; name: string; email: string; passwordHash: string; mustChangePassword: boolean }

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
  notifications: Notification[]
  permissions: string[]
}

const DB_NAME = 'gio-local-v1'
const STORE_NAME = 'application'
const DATA_KEY = 'state'

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

export async function loadAppData(): Promise<AppData> {
  const stored = await readStored()
  if (stored) return {
    ...stored,
    permissions: stored.permissions ?? [],
    stockAssignments: (stored.stockAssignments ?? []).map(item => {
      const inventoryItem = stored.inventory.find(entry => entry.id === item.inventoryItemId)
      return {
        ...item,
        equipment: item.equipment ?? inventoryItem?.equipment ?? 'Equipamento', brand: item.brand ?? inventoryItem?.brand ?? '', model: item.model ?? inventoryItem?.model ?? '',
        category: item.category ?? inventoryItem?.category ?? 'Insumo', unit: item.unit ?? inventoryItem?.unit ?? 'Unidade', code: item.code ?? inventoryItem?.code ?? 'SEM-CODIGO',
        status: item.status === 'Pendente' ? 'Pendente' : 'Aprovado e retirado',
      }
    }),
    materialUsages: stored.materialUsages ?? [],
  }
  const account: AdminAccount = {
    id: crypto.randomUUID(),
    name: 'Gabriel Alcantara',
    email: 'gabriel.alcantara@alertsystem.com.br',
    passwordHash: await hashPassword('GIO@2026'),
    mustChangePassword: true,
  }
  const initial: AppData = {
    account,
    people: [{ id: account.id, name: account.name, email: account.email, groups: ['Administrador'], active: true, canLogin: true }],
    clients: [], vehicles: [], trajectories: [], stockRequests: [], kmRecords: [], inventory: [], stockAssignments: [], materialUsages: [], notifications: [], permissions: [],
  }
  await saveAppData(initial)
  return initial
}
