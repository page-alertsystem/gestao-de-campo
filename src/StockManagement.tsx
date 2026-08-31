import { FormEvent, useState } from 'react'
import { PackageCheck, Plus } from 'lucide-react'
import { formatQuantity, parseQuantity, type AppData, type InventoryItem, type StockAssignment } from './store'

const emptyForm = { personId: '', category: 'Ferramenta pessoal' as InventoryItem['category'], equipment: '', brand: '', model: '', code: '', unit: 'Unidade' as InventoryItem['unit'], quantity: '1', notes: '' }

export function StockManagement({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const activePeople = data.people.filter(person => person.active)
  const [form, setForm] = useState({ ...emptyForm, personId: activePeople[0]?.id ?? '' })
  const selectedPerson = activePeople.find(person => person.id === form.personId)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const amount = parseQuantity(form.quantity)
    if (!selectedPerson || !form.equipment.trim() || !form.code.trim() || !Number.isFinite(amount) || amount <= 0) return

    const normalizedCode = form.code.trim().toUpperCase()
    const existingItem = data.inventory.find(item => item.code.trim().toUpperCase() === normalizedCode)
    const inventoryItem: InventoryItem = existingItem ?? {
      id: crypto.randomUUID(), equipment: form.equipment.trim(), brand: form.brand.trim(), model: form.model.trim(),
      category: form.category, unit: form.unit, quantity: 0, minimum: 0, code: normalizedCode, notes: 'Criado automaticamente pelo Gerenciamento de Estoque.',
    }
    const assignment: StockAssignment = {
      id: crypto.randomUUID(), personId: selectedPerson.id, inventoryItemId: inventoryItem.id,
      equipment: form.equipment.trim(), brand: form.brand.trim(), model: form.model.trim(), category: form.category,
      unit: form.unit, code: normalizedCode, quantity: amount, assignedAt: new Date().toISOString(),
      assignedBy: data.account.name, notes: form.notes.trim(), status: 'Pendente',
    }

    onChange({
      ...data,
      inventory: existingItem ? data.inventory.map(item => item.id === existingItem.id ? { ...item, quantity: item.quantity - amount } : item) : [...data.inventory, inventoryItem],
      stockAssignments: [...data.stockAssignments, assignment],
      notifications: [...data.notifications, { id: crypto.randomUUID(), title: 'Nova aprovação de estoque', detail: `${assignment.equipment} · código ${assignment.code} · ${formatQuantity(amount)} ${assignment.unit.toLowerCase()} para ${selectedPerson.name}`, createdAt: new Date().toISOString(), read: false, critical: false }],
    }, `Atribuição enviada para aprovação de ${selectedPerson.name}.`)
    setForm({ ...emptyForm, personId: selectedPerson.id })
  }

  return <>
    <section className="page-intro"><div><p className="eyebrow">Estoque e administração</p><h2>Gerenciamento de estoque</h2><p>Preencha os dados do equipamento e vincule diretamente à pessoa responsável.</p></div></section>
    <form className="surface simple-assignment-form" onSubmit={submit}>
      <div className="section-heading"><div><p className="eyebrow">Nova atribuição</p><h3>Vincular equipamento à pessoa</h3></div><PackageCheck size={22} /></div>
      <div className="simple-assignment-grid">
        <label className="wide">Pessoa<select value={form.personId} onChange={event => setForm({ ...form, personId: event.target.value })} required><option value="">Selecione uma pessoa</option>{activePeople.map(person => <option value={person.id} key={person.id}>{person.name} · {person.groups.join(', ')}</option>)}</select></label>
        <label>Categoria<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value as InventoryItem['category'] })}><option>Ferramenta pessoal</option><option>Ferramenta rotativa</option><option>Insumo</option><option>EPI</option><option>Escada</option></select></label>
        <label>Equipamento<input value={form.equipment} onChange={event => setForm({ ...form, equipment: event.target.value })} placeholder="Nome do equipamento" required /></label>
        <label>Código do equipamento<input value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="Código ou identificação" required /></label>
        <label>Marca (opcional)<input value={form.brand} onChange={event => setForm({ ...form, brand: event.target.value })} /></label>
        <label>Modelo (opcional)<input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} /></label>
        <label>Unidade<select value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value as InventoryItem['unit'] })}><option>Unidade</option><option>Caixa</option><option>Metros</option><option>Rolo</option></select></label>
        <label>Quantidade<input type="text" inputMode="decimal" pattern="[0-9]+([,.][0-9]+)?" title="Digite um número inteiro ou decimal, como 2 ou 1,5" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} placeholder="Ex.: 2 ou 1,5" required /></label>
        <label className="wide">Observação (opcional)<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="Tamanho, número de série ou informação da retirada" /></label>
      </div>
      <div className="simple-assignment-footer"><p>Após salvar, a pessoa deverá confirmar a aprovação e a retirada na aba <b>Aprovações</b>.</p><button className="primary-button" disabled={!form.personId}><Plus size={18} /> Enviar para aprovação</button></div>
    </form>

    <section className="surface table-surface assignment-history"><div className="table-toolbar"><div><p className="eyebrow">Acompanhamento</p><h3>Atribuições realizadas</h3></div></div><div className="responsive-table"><table><thead><tr><th>Data</th><th>Pessoa</th><th>Equipamento</th><th>Código</th><th>Quantidade</th><th>Status</th></tr></thead><tbody>{data.stockAssignments.length ? [...data.stockAssignments].reverse().map(entry => { const person = data.people.find(item => item.id === entry.personId); return <tr key={entry.id}><td>{new Date(entry.assignedAt).toLocaleString('pt-BR')}</td><td>{person?.name ?? 'Pessoa removida'}</td><td>{entry.equipment}</td><td>{entry.code}</td><td>{formatQuantity(entry.quantity)} {entry.unit.toLowerCase()}</td><td><span className={`status ${entry.status === 'Aprovado e retirado' ? 'success' : 'warning'}`}>{entry.status}</span></td></tr> }) : <tr><td colSpan={6} className="table-empty">Nenhuma atribuição realizada.</td></tr>}</tbody></table></div></section>
  </>
}
