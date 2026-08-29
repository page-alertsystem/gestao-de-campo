import { FormEvent, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck, PackageCheck, ShieldCheck } from 'lucide-react'
import type { AppData, MaterialUsage } from './store'

function personalBalances(data: AppData, personId: string) {
  const totals = new Map<string, number>()
  data.stockAssignments.filter(item => item.personId === personId && item.status === 'Aprovado e retirado').forEach(item => totals.set(item.inventoryItemId, (totals.get(item.inventoryItemId) ?? 0) + item.quantity))
  data.materialUsages.filter(item => item.personId === personId).forEach(item => totals.set(item.inventoryItemId, (totals.get(item.inventoryItemId) ?? 0) - item.quantity))
  return totals
}

export function StockApprovals({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const pending = data.stockAssignments.filter(item => item.personId === data.account.id && item.status === 'Pendente')
  const approved = data.stockAssignments.filter(item => item.personId === data.account.id && item.status === 'Aprovado e retirado')
  const approve = (id: string) => {
    const assignment = data.stockAssignments.find(item => item.id === id)
    const equipment = data.inventory.find(item => item.id === assignment?.inventoryItemId)
    onChange({ ...data, stockAssignments: data.stockAssignments.map(item => item.id === id ? { ...item, status: 'Aprovado e retirado' as const, approvedAt: new Date().toISOString() } : item) }, `${assignment?.equipment ?? equipment?.equipment ?? 'Equipamento'} incluído no seu estoque.`)
  }
  return <>
    <section className="page-intro"><div><p className="eyebrow">Meu estoque</p><h2>Aprovações</h2><p>Confirme o recebimento dos equipamentos atribuídos pelo Estoque ou Administrador.</p></div></section>
    <section className="approval-list">{pending.length ? pending.map(entry => <article className="surface approval-card" key={entry.id}><span><PackageCheck size={24} /></span><div><p className="eyebrow">Aguardando sua confirmação</p><h3>{entry.equipment}</h3><p>{entry.quantity} {entry.unit.toLowerCase()} · {entry.category} · código {entry.code}</p>{(entry.brand || entry.model) && <small>{[entry.brand, entry.model].filter(Boolean).join(' · ')}</small>}<small>Atribuído por {entry.assignedBy} em {new Date(entry.assignedAt).toLocaleString('pt-BR')}</small>{entry.notes && <small>Observação: {entry.notes}</small>}</div><button className="primary-button" onClick={() => approve(entry.id)}><CheckCircle2 size={18} /> Aprovar e confirmar retirada</button></article>) : <section className="surface empty-state"><ShieldCheck size={30} /><h3>Nenhuma aprovação pendente</h3><p>Quando um equipamento for atribuído a você, a solicitação aparecerá aqui.</p></section>}</section>
    {approved.length > 0 && <section className="surface table-surface approval-history"><div className="table-toolbar"><div><p className="eyebrow">Histórico</p><h3>Equipamentos aprovados e retirados</h3></div></div><div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Código</th><th>Quantidade</th><th>Atribuído por</th><th>Aprovado e retirado em</th></tr></thead><tbody>{approved.map(entry => <tr key={entry.id}><td>{entry.equipment}</td><td>{entry.code}</td><td>{entry.quantity} {entry.unit.toLowerCase()}</td><td>{entry.assignedBy}</td><td>{entry.approvedAt ? new Date(entry.approvedAt).toLocaleString('pt-BR') : 'Registro anterior'}</td></tr>)}</tbody></table></div></section>}
  </>
}

export function MaterialUsagePage({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const balances = useMemo(() => personalBalances(data, data.account.id), [data])
  const availableItems = data.inventory.filter(item => (balances.get(item.id) ?? 0) > 0)
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const selectedItem = data.inventory.find(item => item.id === itemId)
  const available = balances.get(itemId) ?? 0
  const invalidQuantity = Number(quantity) <= 0 || Number(quantity) > available

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!selectedItem || invalidQuantity) return
    const usage: MaterialUsage = { id: crypto.randomUUID(), personId: data.account.id, inventoryItemId: selectedItem.id, quantity: Number(quantity), declaredDate: date, usedAt: new Date().toISOString(), location: location.trim(), description: description.trim() }
    onChange({ ...data, materialUsages: [...data.materialUsages, usage] }, `Baixa de ${selectedItem.equipment} registrada.`)
    setItemId(''); setQuantity('1'); setLocation(''); setDescription('')
  }

  const history = data.materialUsages.filter(item => item.personId === data.account.id).reverse()
  return <>
    <section className="page-intro"><div><p className="eyebrow">Meu estoque</p><h2>Materiais utilizados</h2><p>Informe o material utilizado para dar baixa na quantidade do seu estoque pessoal.</p></div></section>
    <section className="stock-management-grid">
      <form className="surface assignment-form" onSubmit={submit}>
        <div className="section-heading"><div><p className="eyebrow">Nova baixa</p><h3>Registrar utilização</h3></div><ClipboardCheck size={21} /></div>
        <label>Equipamento<select value={itemId} onChange={event => setItemId(event.target.value)} required><option value="">Selecione</option>{availableItems.map(item => <option value={item.id} key={item.id}>{item.equipment} · disponível {balances.get(item.id)} {item.unit.toLowerCase()}</option>)}</select></label>
        <label>Quantidade utilizada<input type="number" min="0.01" max={available || undefined} step={selectedItem?.unit === 'Metros' ? '0.01' : '1'} value={quantity} onChange={event => setQuantity(event.target.value)} required /></label>
        <label>Data da utilização<input type="date" max={new Date().toISOString().slice(0, 10)} value={date} onChange={event => setDate(event.target.value)} required /></label>
        <label>Local, cliente ou atividade<input value={location} onChange={event => setLocation(event.target.value)} placeholder="Onde o material foi utilizado" required /></label>
        <label>Descrição do uso<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Descreva o serviço e como o material foi utilizado" required /></label>
        {itemId && <p className={invalidQuantity ? 'assignment-warning' : 'assignment-balance'}>Saldo pessoal disponível: {available} {selectedItem?.unit.toLowerCase()}.</p>}
        <button className="primary-button full" disabled={!itemId || invalidQuantity}><ClipboardCheck size={18} /> Registrar material utilizado</button>
      </form>
      <section className="surface table-surface"><div className="table-toolbar"><div><p className="eyebrow">Estoque pessoal</p><h3>Saldos disponíveis</h3></div></div><div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Categoria</th><th>Quantidade</th></tr></thead><tbody>{availableItems.length ? availableItems.map(item => <tr key={item.id}><td>{item.equipment}</td><td>{item.category}</td><td>{balances.get(item.id)} {item.unit.toLowerCase()}</td></tr>) : <tr><td colSpan={3} className="table-empty">Você não possui materiais disponíveis para baixa.</td></tr>}</tbody></table></div></section>
    </section>
    <section className="surface table-surface assignment-history"><div className="table-toolbar"><div><p className="eyebrow">Histórico</p><h3>Utilizações registradas</h3></div></div><div className="responsive-table"><table><thead><tr><th>Data informada</th><th>Equipamento</th><th>Quantidade</th><th>Local/atividade</th><th>Descrição</th></tr></thead><tbody>{history.length ? history.map(entry => { const item = data.inventory.find(inventory => inventory.id === entry.inventoryItemId); return <tr key={entry.id}><td>{new Date(`${entry.declaredDate}T12:00:00`).toLocaleDateString('pt-BR')}</td><td>{item?.equipment ?? 'Item removido'}</td><td>{entry.quantity} {item?.unit.toLowerCase()}</td><td>{entry.location}</td><td>{entry.description}</td></tr> }) : <tr><td colSpan={5} className="table-empty">Nenhuma utilização registrada.</td></tr>}</tbody></table></div></section>
  </>
}
