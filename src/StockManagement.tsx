import { FormEvent, useMemo, useState } from 'react'
import { AlertTriangle, Boxes, PackageCheck, Plus, UserRoundCheck, Users } from 'lucide-react'
import type { AppData, StockAssignment } from './store'

export function StockManagement({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const activePeople = data.people.filter(person => person.active)
  const [personId, setPersonId] = useState(activePeople[0]?.id ?? '')
  const [itemId, setItemId] = useState(data.inventory[0]?.id ?? '')
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')
  const selectedPerson = activePeople.find(person => person.id === personId)
  const selectedItem = data.inventory.find(item => item.id === itemId)

  const balances = useMemo(() => {
    const totals = new Map<string, number>()
    data.stockAssignments.filter(item => item.personId === personId && item.status === 'Aprovado').forEach(item => totals.set(item.inventoryItemId, (totals.get(item.inventoryItemId) ?? 0) + item.quantity))
    data.materialUsages.filter(item => item.personId === personId).forEach(item => totals.set(item.inventoryItemId, (totals.get(item.inventoryItemId) ?? 0) - item.quantity))
    return [...totals.entries()].map(([inventoryItemId, total]) => ({ item: data.inventory.find(entry => entry.id === inventoryItemId), total })).filter(entry => entry.item && entry.total !== 0)
  }, [data.inventory, data.materialUsages, data.stockAssignments, personId])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const amount = Number(quantity)
    if (!selectedPerson || !selectedItem || !Number.isFinite(amount) || amount <= 0) return
    const assignment: StockAssignment = {
      id: crypto.randomUUID(), personId: selectedPerson.id, inventoryItemId: selectedItem.id,
      quantity: amount, assignedAt: new Date().toISOString(), assignedBy: data.account.name, notes: notes.trim(), status: 'Pendente',
    }
    onChange({
      ...data,
      inventory: data.inventory.map(item => item.id === selectedItem.id ? { ...item, quantity: item.quantity - amount } : item),
      stockAssignments: [...data.stockAssignments, assignment],
      notifications: [...data.notifications, { id: crypto.randomUUID(), title: 'Nova aprovação de estoque', detail: `${selectedItem.equipment} · ${amount} ${selectedItem.unit.toLowerCase()} para ${selectedPerson.name}`, createdAt: new Date().toISOString(), read: false, critical: false }],
    }, `Solicitação de inclusão enviada para ${selectedPerson.name}.`)
    setQuantity('1')
    setNotes('')
  }

  const userCountWithStock = new Set(data.stockAssignments.filter(item => item.status === 'Aprovado').map(item => item.personId)).size
  return <>
    <section className="page-intro"><div><p className="eyebrow">Estoque e administração</p><h2>Gestão de estoque</h2><p>Atribua ferramentas, insumos e EPIs do estoque central aos usuários cadastrados.</p></div></section>
    <section className="attention-grid stock-summary"><article className="metric-card"><span><Users size={21} /></span><div><b>{activePeople.length}</b><small>Usuários com estoque individual</small></div></article><article className="metric-card"><span><UserRoundCheck size={21} /></span><div><b>{userCountWithStock}</b><small>Usuários com itens atribuídos</small></div></article><article className="metric-card"><span><Boxes size={21} /></span><div><b>{data.inventory.length}</b><small>Itens no estoque central</small></div></article></section>

    <section className="stock-management-grid">
      <form className="surface assignment-form" onSubmit={submit}>
        <div className="section-heading"><div><p className="eyebrow">Nova movimentação</p><h3>Atribuir item ao usuário</h3></div><PackageCheck size={21} /></div>
        <label>Usuário<select value={personId} onChange={event => setPersonId(event.target.value)} required><option value="">Selecione</option>{activePeople.map(person => <option value={person.id} key={person.id}>{person.name} · {person.groups.join(', ')}</option>)}</select></label>
        <label>Equipamento<select value={itemId} onChange={event => setItemId(event.target.value)} required><option value="">Selecione</option>{data.inventory.map(item => <option value={item.id} key={item.id}>{item.equipment} · {item.category} · saldo {item.quantity} {item.unit.toLowerCase()}</option>)}</select></label>
        <label>Quantidade<input type="number" min="0.01" step={selectedItem?.unit === 'Metros' ? '0.01' : '1'} value={quantity} onChange={event => setQuantity(event.target.value)} required /></label>
        <label>Observação (opcional)<textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Número de série, tamanho ou informação da entrega" /></label>
        {selectedItem && Number(quantity) > selectedItem.quantity && <p className="assignment-warning"><AlertTriangle size={16} />A atribuição deixará o estoque central com saldo negativo de {selectedItem.quantity - Number(quantity)} {selectedItem.unit.toLowerCase()}.</p>}
        <button className="primary-button full" disabled={!personId || !itemId}><Plus size={18} /> Confirmar atribuição</button>
      </form>

      <section className="surface user-stock-card">
        <div className="section-heading"><div><p className="eyebrow">Estoque individual</p><h3>{selectedPerson?.name ?? 'Selecione um usuário'}</h3></div><UserRoundCheck size={21} /></div>
        <div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Categoria</th><th>Quantidade disponível</th></tr></thead><tbody>{balances.length ? balances.map(({ item, total }) => <tr key={item!.id}><td>{item!.equipment}</td><td>{item!.category}</td><td>{total} {item!.unit.toLowerCase()}</td></tr>) : <tr><td colSpan={3} className="table-empty">Este usuário ainda não possui itens aprovados.</td></tr>}</tbody></table></div>
      </section>
    </section>

    <section className="surface table-surface assignment-history"><div className="table-toolbar"><div><p className="eyebrow">Rastreabilidade</p><h3>Últimas atribuições</h3></div></div><div className="responsive-table"><table><thead><tr><th>Data</th><th>Usuário</th><th>Equipamento</th><th>Quantidade</th><th>Status</th><th>Atribuído por</th></tr></thead><tbody>{data.stockAssignments.length ? [...data.stockAssignments].reverse().map(entry => { const person = data.people.find(item => item.id === entry.personId); const item = data.inventory.find(inventory => inventory.id === entry.inventoryItemId); return <tr key={entry.id}><td>{new Date(entry.assignedAt).toLocaleString('pt-BR')}</td><td>{person?.name ?? 'Usuário removido'}</td><td>{item?.equipment ?? 'Item removido'}</td><td>{entry.quantity} {item?.unit.toLowerCase() ?? ''}</td><td><span className={`status ${entry.status === 'Aprovado' ? 'success' : 'warning'}`}>{entry.status}</span></td><td>{entry.assignedBy}</td></tr> }) : <tr><td colSpan={6} className="table-empty">Nenhuma atribuição realizada.</td></tr>}</tbody></table></div></section>
  </>
}
