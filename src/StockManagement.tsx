import { FormEvent, useMemo, useState } from 'react'
import { CheckCircle2, PackageCheck, Wrench } from 'lucide-react'
import { type AppData, type StockAssignment } from './store'
import { personalInventory } from './personalInventory'

export function StockManagement({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const people = data.people.filter(person => person.active)
  const rotatingTools = data.inventory.filter(item => item.category === 'Ferramenta rotativa')
  const holderByItem = useMemo(() => new Map(rotatingTools.map(tool => {
    const holder = people.find(person => personalInventory(data, person.id).some(item => item.id === tool.id))
    return [tool.id, holder]
  })), [data, people, rotatingTools])
  const available = rotatingTools.filter(tool => !holderByItem.get(tool.id))
  const toolCategories = data.equipmentCategories.filter(category => category.active && category.type === 'Ferramenta')
  const [personId, setPersonId] = useState(people[0]?.id ?? '')
  const [itemId, setItemId] = useState(available[0]?.id ?? '')
  const [equipmentCategoryId, setEquipmentCategoryId] = useState(available[0]?.equipmentCategoryId ?? toolCategories[0]?.id ?? '')
  const [notes, setNotes] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const person = people.find(item => item.id === personId)
    const tool = available.find(item => item.id === itemId)
    const equipmentCategory = toolCategories.find(category => category.id === equipmentCategoryId)
    if (!person || !tool || !equipmentCategory) return
    const assignedAt = new Date().toISOString()
    const assignment: StockAssignment = {
      id: crypto.randomUUID(), personId: person.id, inventoryItemId: tool.id, equipment: tool.equipment,
      brand: tool.brand, model: tool.model, category: 'Ferramenta rotativa', equipmentCategoryId: equipmentCategory.id,
      unit: 'Unidade', code: tool.code, ca: tool.ca, serialNumber: tool.serialNumber, quantity: 1,
      assignedAt, assignedBy: data.account.name, notes: notes.trim(), status: 'Aprovado e retirado', approvedAt: assignedAt,
    }
    onChange({
      ...data,
      inventory: data.inventory.map(item => item.id === tool.id ? { ...item, equipmentCategoryId: equipmentCategory.id } : item),
      stockAssignments: [...data.stockAssignments, assignment],
      notifications: [...data.notifications, { id: crypto.randomUUID(), title: 'Ferramenta rotativa atribuída', detail: `${tool.equipment} · ${tool.code} · ${person.name}`, createdAt: assignedAt, read: false, critical: false }],
    }, `${tool.equipment} atribuído diretamente a ${person.name}.`)
    setNotes('')
    const remaining = available.filter(item => item.id !== tool.id)
    const nextTool = remaining[0]
    setItemId(nextTool?.id ?? '')
    setEquipmentCategoryId(nextTool?.equipmentCategoryId ?? toolCategories[0]?.id ?? '')
  }

  return <>
    <section className="page-intro"><div><p className="eyebrow">Estoque</p><h2>Gerenciamento de ferramentas rotativas</h2><p>Atribua diretamente uma ferramenta rotativa disponível. Este fluxo não depende de aprovação do TST.</p></div></section>
    <form className="surface simple-assignment-form" onSubmit={submit}>
      <div className="section-heading"><div><p className="eyebrow">Nova atribuição</p><h3>Vincular ferramenta rotativa</h3></div><Wrench size={22} /></div>
      <div className="simple-assignment-grid">
        <label className="wide">Pessoa<select value={personId} onChange={event => setPersonId(event.target.value)} required><option value="">Selecione</option>{people.map(person => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
        <label className="wide">Ferramenta disponível<select value={itemId} onChange={event => { const id = event.target.value; const selected = available.find(item => item.id === id); setItemId(id); setEquipmentCategoryId(selected?.equipmentCategoryId ?? toolCategories[0]?.id ?? '') }} required><option value="">Selecione</option>{available.map(tool => <option value={tool.id} key={tool.id}>{tool.equipment} · {tool.code} · {[tool.brand, tool.model].filter(Boolean).join(' ') || 'sem fabricante/modelo'}</option>)}</select></label>
        <label className="wide">Categoria para auditoria<select value={equipmentCategoryId} onChange={event => setEquipmentCategoryId(event.target.value)} required><option value="">Selecione</option>{toolCategories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        <label className="wide">Observação (opcional)<textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Informação da entrega ou responsabilidade" /></label>
      </div>
      {!available.length && <p className="assignment-warning">Todas as ferramentas rotativas cadastradas estão atribuídas. Uma devolução precisa ser recebida antes de uma nova atribuição.</p>}
      {!toolCategories.length && <p className="assignment-warning">Cadastre ao menos uma categoria de Ferramenta nas Configurações antes de realizar a atribuição.</p>}
      <div className="simple-assignment-footer"><p>A ferramenta aparecerá imediatamente no estoque pessoal da pessoa selecionada e usará o checklist da categoria escolhida.</p><button className="primary-button" disabled={!personId || !itemId || !equipmentCategoryId}><PackageCheck size={18} /> Atribuir ferramenta</button></div>
    </form>
    <section className="surface table-surface assignment-history"><div className="table-toolbar"><div><p className="eyebrow">Posição atual</p><h3>Ferramentas rotativas cadastradas</h3></div></div><div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Código</th><th>Fabricante</th><th>Modelo</th><th>Categoria</th><th>Responsável</th><th>Situação</th></tr></thead><tbody>{rotatingTools.length ? rotatingTools.map(tool => { const holder = holderByItem.get(tool.id); const category = data.equipmentCategories.find(item => item.id === tool.equipmentCategoryId); return <tr key={tool.id}><td><b>{tool.equipment}</b></td><td>{tool.code}</td><td>{tool.brand || '—'}</td><td>{tool.model || '—'}</td><td>{category?.name ?? 'Não definida'}</td><td>{holder?.name ?? 'Estoque'}</td><td><span className={`status ${holder ? 'warning' : 'success'}`}>{holder ? 'Em uso' : 'Disponível'}</span></td></tr> }) : <tr><td colSpan={7} className="table-empty">Nenhuma ferramenta rotativa cadastrada nas Configurações.</td></tr>}</tbody></table></div></section>
    {data.stockAssignments.some(item => item.category === 'Ferramenta rotativa') && <section className="surface table-surface assignment-history"><div className="table-toolbar"><div><p className="eyebrow">Histórico</p><h3>Atribuições de ferramentas rotativas</h3></div><CheckCircle2 size={21} /></div><div className="responsive-table"><table><thead><tr><th>Data</th><th>Pessoa</th><th>Equipamento</th><th>Código</th><th>Atribuído por</th></tr></thead><tbody>{data.stockAssignments.filter(item => item.category === 'Ferramenta rotativa').slice().reverse().map(entry => <tr key={entry.id}><td>{new Date(entry.assignedAt).toLocaleString('pt-BR')}</td><td>{data.people.find(person => person.id === entry.personId)?.name ?? 'Pessoa removida'}</td><td>{entry.equipment}</td><td>{entry.code}</td><td>{entry.assignedBy}</td></tr>)}</tbody></table></div></section>}
  </>
}
