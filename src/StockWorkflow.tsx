import { ChangeEvent, FormEvent, useState } from 'react'
import { Camera, CheckCircle2, ClipboardCheck, Image, PackageCheck, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { formatQuantity, parseQuantity, type AppData, type InventoryItem, type MaterialDisposition, type MaterialUsage, type MaterialWorkflowStatus } from './store'

export function StockApprovals({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const pending = data.stockAssignments.filter(item => item.personId === data.account.id && item.status === 'Pendente')
  const approved = data.stockAssignments.filter(item => item.personId === data.account.id && item.status === 'Aprovado e retirado')
  const approve = (id: string) => {
    const assignment = data.stockAssignments.find(item => item.id === id)
    const equipment = data.inventory.find(item => item.id === assignment?.inventoryItemId)
    onChange({ ...data, stockAssignments: data.stockAssignments.map(item => item.id === id ? { ...item, status: 'Aprovado e retirado' as const, approvedAt: new Date().toISOString() } : item) }, `${assignment?.equipment ?? equipment?.equipment ?? 'Equipamento'} incluído no seu estoque.`)
  }
  return <>
    <section className="page-intro"><div><p className="eyebrow">Pessoal</p><h2>Aprovações</h2><p>Confirme o recebimento dos equipamentos atribuídos pelo Estoque ou Administrador.</p></div></section>
    <section className="approval-list">{pending.length ? pending.map(entry => <article className="surface approval-card" key={entry.id}><span><PackageCheck size={24} /></span><div><p className="eyebrow">Aguardando sua confirmação</p><h3>{entry.equipment}</h3><p>{formatQuantity(entry.quantity)} {entry.unit.toLowerCase()} · {entry.category} · código {entry.code}</p>{(entry.brand || entry.model) && <small>{[entry.brand, entry.model].filter(Boolean).join(' · ')}</small>}<small>Atribuído por {entry.assignedBy} em {new Date(entry.assignedAt).toLocaleString('pt-BR')}</small>{entry.notes && <small>Observação: {entry.notes}</small>}</div><button className="primary-button" onClick={() => approve(entry.id)}><CheckCircle2 size={18} /> Aprovar e confirmar retirada</button></article>) : <section className="surface empty-state"><ShieldCheck size={30} /><h3>Nenhuma aprovação pendente</h3><p>Quando um equipamento for atribuído a você, a solicitação aparecerá aqui.</p></section>}</section>
    {approved.length > 0 && <section className="surface table-surface approval-history"><div className="table-toolbar"><div><p className="eyebrow">Histórico</p><h3>Equipamentos aprovados e retirados</h3></div></div><div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Código</th><th>Quantidade</th><th>Atribuído por</th><th>Aprovado e retirado em</th></tr></thead><tbody>{approved.map(entry => <tr key={entry.id}><td>{entry.equipment}</td><td>{entry.code}</td><td>{formatQuantity(entry.quantity)} {entry.unit.toLowerCase()}</td><td>{entry.assignedBy}</td><td>{entry.approvedAt ? new Date(entry.approvedAt).toLocaleString('pt-BR') : 'Registro anterior'}</td></tr>)}</tbody></table></div></section>}
  </>
}

export function MaterialWriteOffModal({ data, item, available, onClose, onChange }: { data: AppData; item: InventoryItem; available: number; onClose: () => void; onChange: (data: AppData, message?: string) => void }) {
  const isSupply = item.category === 'Insumo'
  const options: MaterialDisposition[] = isSupply ? ['Instalado no cliente', 'Devolvido ao estoque'] : ['Devolvido ao estoque', 'Danificado']
  const [quantity, setQuantity] = useState('1')
  const [disposition, setDisposition] = useState<MaterialDisposition>(options[0])
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState('')
  const amount = parseQuantity(quantity)
  const invalidQuantity = !Number.isFinite(amount) || amount <= 0 || amount > available

  const capturePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (invalidQuantity || !description.trim() || !photo) return
    const workflowStatus: MaterialWorkflowStatus = disposition === 'Instalado no cliente' ? 'Utilizado' : 'Aguardando recebimento'
    const usage: MaterialUsage = {
      id: crypto.randomUUID(), personId: data.account.id, personName: data.account.name, inventoryItemId: item.id,
      equipment: item.equipment, brand: item.brand, model: item.model, category: item.category, unit: item.unit,
      code: item.code, notes: item.notes, quantity: amount, declaredDate: new Date().toISOString().slice(0, 10),
      usedAt: new Date().toISOString(), disposition, workflowStatus, description: description.trim(), photo,
    }
    onChange({ ...data, materialUsages: [...data.materialUsages, usage] }, `Baixa de ${item.equipment} registrada.`)
    onClose()
  }

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={`Dar baixa em ${item.equipment}`}>
    <button className="modal-backdrop" onClick={onClose} aria-label="Fechar" />
    <form className="quick-modal writeoff-modal" onSubmit={submit}>
      <div className="modal-heading"><div><p className="eyebrow">Estoque pessoal</p><h2>Dar baixa no equipamento</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>
      <div className="writeoff-item-summary"><PackageCheck size={22} /><div><b>{item.equipment}</b><span>{item.category} · código {item.code}</span><small>Disponível: {formatQuantity(available)} {item.unit.toLowerCase()}</small></div></div>
      <div className="form-grid writeoff-fields">
        <label>Quantidade<input type="text" inputMode="decimal" pattern="[0-9]+([,.][0-9]+)?" title="Digite um número inteiro ou decimal, como 2 ou 1,5" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="Ex.: 2 ou 1,5" required /></label>
        <label>Situação<select value={disposition} onChange={event => setDisposition(event.target.value as MaterialDisposition)} required>{options.map(option => <option key={option}>{option}</option>)}</select></label>
        <label className="full">Detalhes da baixa<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Informe o motivo e todos os detalhes da baixa" required /></label>
      </div>
      {invalidQuantity && <p className="assignment-warning">A quantidade deve ser maior que zero e não pode ultrapassar o saldo disponível.</p>}
      <label className={photo ? 'writeoff-photo-field filled' : 'writeoff-photo-field'}>
        <input type="file" accept="image/*" capture="environment" onChange={capturePhoto} required={!photo} />
        {photo ? <><img src={photo} alt="Foto da baixa" /><span><CheckCircle2 size={18} /> Foto registrada pela câmera</span></> : <><Camera size={28} /><b>Tirar foto pela câmera</b><small>A foto é obrigatória para concluir a baixa</small></>}
      </label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={invalidQuantity || !description.trim() || !photo}><ClipboardCheck size={18} /> Confirmar baixa</button></div>
    </form>
  </div>
}

function statusTone(status: MaterialWorkflowStatus) {
  if (status === 'Cancelado') return 'danger'
  if (status === 'Aguardando recebimento') return 'warning'
  return 'success'
}

export function MaterialWriteOffsPage({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const entries = [...data.materialUsages].sort((a, b) => b.usedAt.localeCompare(a.usedAt))
  const updateStatus = (entry: MaterialUsage, status: 'Recebido' | 'Cancelado') => {
    if (entry.workflowStatus !== 'Aguardando recebimento') return
    const inventory = status === 'Recebido' && entry.disposition === 'Devolvido ao estoque'
      ? data.inventory.map(item => item.id === entry.inventoryItemId ? { ...item, quantity: item.quantity + entry.quantity } : item)
      : data.inventory
    const materialUsages = data.materialUsages.map(item => item.id === entry.id ? { ...item, workflowStatus: status, processedAt: new Date().toISOString(), processedBy: data.account.name } : item)
    onChange({ ...data, inventory, materialUsages }, status === 'Recebido' ? `${entry.equipment} recebido pelo estoque.` : `Baixa de ${entry.equipment} cancelada.`)
  }

  return <>
    <section className="page-intro"><div><p className="eyebrow">Estoque e administração</p><h2>Baixa de Materiais</h2><p>Acompanhe as baixas realizadas pelas pessoas e confirme o recebimento das devoluções ou itens danificados.</p></div></section>
    <section className="writeoff-summary-grid">
      <article className="surface writeoff-summary"><ClipboardCheck size={22} /><div><b>{entries.length}</b><span>Baixas registradas</span></div></article>
      <article className="surface writeoff-summary warning"><RotateCcw size={22} /><div><b>{entries.filter(item => item.workflowStatus === 'Aguardando recebimento').length}</b><span>Aguardando recebimento</span></div></article>
      <article className="surface writeoff-summary"><CheckCircle2 size={22} /><div><b>{entries.filter(item => item.workflowStatus === 'Recebido').length}</b><span>Recebidas pelo estoque</span></div></article>
    </section>
    <section className="writeoff-list">{entries.length ? entries.map(entry => <article className="surface writeoff-card" key={entry.id}>
      <div className="writeoff-card-photo">{entry.photo ? <img src={entry.photo} alt={`Foto da baixa de ${entry.equipment}`} /> : <span><Image size={25} /><small>Registro anterior<br />sem foto</small></span>}</div>
      <div className="writeoff-card-content">
        <div className="writeoff-card-heading"><div><p className="eyebrow">{entry.personName}</p><h3>{entry.equipment}</h3></div><span className={`status ${statusTone(entry.workflowStatus)}`}>{entry.workflowStatus}</span></div>
        <div className="writeoff-details">
          <span><small>Categoria</small><b>{entry.category}</b></span><span><small>Código</small><b>{entry.code}</b></span>
          <span><small>Marca / modelo</small><b>{[entry.brand, entry.model].filter(Boolean).join(' · ') || 'Não informado'}</b></span>
          <span><small>Quantidade</small><b>{formatQuantity(entry.quantity)} {entry.unit.toLowerCase()}</b></span>
          <span><small>Situação informada</small><b>{entry.disposition}</b></span><span><small>Registro</small><b>{new Date(entry.usedAt).toLocaleString('pt-BR')}</b></span>
        </div>
        {entry.notes && <p className="writeoff-notes"><b>Informações do equipamento:</b> {entry.notes}</p>}
        <p className="writeoff-description"><b>Detalhes da baixa:</b> {entry.description}</p>
        {entry.processedAt && <small className="writeoff-processed">Processado por {entry.processedBy} em {new Date(entry.processedAt).toLocaleString('pt-BR')}</small>}
        {entry.workflowStatus === 'Aguardando recebimento' && <div className="writeoff-actions"><button className="secondary-button danger-button" onClick={() => updateStatus(entry, 'Cancelado')}><X size={17} /> Cancelar baixa</button><button className="primary-button" onClick={() => updateStatus(entry, 'Recebido')}><CheckCircle2 size={17} /> Marcar como recebido</button></div>}
      </div>
    </article>) : <section className="surface empty-state"><ClipboardCheck size={30} /><h3>Nenhuma baixa registrada</h3><p>As baixas realizadas nas áreas pessoais de Ferramentas, Insumos e EPIs aparecerão aqui.</p></section>}</section>
  </>
}
