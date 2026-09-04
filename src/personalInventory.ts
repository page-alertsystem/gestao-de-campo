import type { AppData, AuditCategory, InventoryItem } from './store'

export function personalInventory(data: AppData, personId: string) {
  const totals = new Map<string, number>()
  data.stockAssignments.filter(item => item.personId === personId && item.status === 'Aprovado e retirado').forEach(item => totals.set(item.inventoryItemId, (totals.get(item.inventoryItemId) ?? 0) + item.quantity))
  data.materialUsages.filter(item => item.personId === personId && item.workflowStatus !== 'Cancelado').forEach(item => totals.set(item.inventoryItemId, (totals.get(item.inventoryItemId) ?? 0) - item.quantity))
  return data.inventory.filter(item => (totals.get(item.id) ?? 0) > 0).map(item => ({ ...item, quantity: totals.get(item.id)! }))
}

export function auditCategoryForItem(item: InventoryItem): AuditCategory | undefined {
  return item.category.includes('Ferramenta') ? 'Ferramentas' : item.category === 'EPI' ? 'EPIs' : item.category === 'Escada' ? 'Escadas' : undefined
}

export function latestItemAudit(data: AppData, personId: string, itemId: string) {
  const record = data.audits.filter(audit => audit.personId === personId && audit.results.some(result => result.inventoryItemId === itemId))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0]
  const result = record?.results.find(entry => entry.inventoryItemId === itemId)
  return result && record ? { record, result } : undefined
}

export function itemAuditStatus(data: AppData, personId: string, item: InventoryItem) {
  if (!auditCategoryForItem(item)) return 'Atribuído'
  const audit = latestItemAudit(data, personId, item.id)
  return audit ? audit.result.approved ? 'Aprovado' : 'Não aprovado' : 'Não auditado'
}

export function itemIdentifier(data: AppData, personId: string, item: InventoryItem) {
  const result = latestItemAudit(data, personId, item.id)?.result
  return result?.newIdentifier || result?.currentIdentifier || item.code
}

export function upcomingPersonalAudits(data: AppData, personId: string, today: string) {
  const categories = new Set(personalInventory(data, personId).map(auditCategoryForItem).filter((category): category is AuditCategory => Boolean(category)))
  return [...categories].map(category => {
    const latest = data.audits.filter(audit => audit.personId === personId && audit.category === category).sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0]
    return { category, date: latest?.nextAuditDate || today, first: !latest }
  }).sort((a, b) => a.date.localeCompare(b.date))
}
