import { ChangeEvent, FormEvent, useMemo, useState } from 'react'
import { ArrowLeft, Camera, CheckCircle2, ChevronRight, ClipboardCheck, PackageCheck, Plus, ShieldCheck, ShoppingCart, X } from 'lucide-react'
import {
  formatQuantity,
  parseQuantity,
  type AppData,
  type EquipmentApprovalRequest,
  type EquipmentStockRequest,
  type EquipmentType,
  type InventoryItem,
  type StockAssignment,
} from './store'

type DataChange = (data: AppData, message?: string) => void

function readPhoto(event: ChangeEvent<HTMLInputElement>, onReady: (photo: string) => void) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => onReady(String(reader.result ?? ''))
  reader.readAsDataURL(file)
}

function statusTone(status: string) {
  if (status === 'Cancelado' || status === 'Danificado') return 'danger'
  if (status === 'Atendido' || status === 'Devolvido ao estoque' || status === 'Enviado para aprovação' || status === 'Concluído') return 'success'
  return 'warning'
}

function categoryName(data: AppData, id?: string) {
  return data.equipmentCategories.find(category => category.id === id)?.name ?? 'Sem categoria definida'
}

export function PersonalEquipmentRequestModal({ data, equipmentType, onClose, onChange }: { data: AppData; equipmentType: EquipmentType; onClose: () => void; onChange: DataChange }) {
  const categories = data.equipmentCategories.filter(category => category.active && category.type === equipmentType)
  const [equipment, setEquipment] = useState('')
  const [reason, setReason] = useState('')
  const [equipmentCategoryId, setEquipmentCategoryId] = useState(categories[0]?.id ?? '')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!equipment.trim() || !reason.trim()) return
    const request: EquipmentApprovalRequest = {
      id: crypto.randomUUID(), personId: data.account.id, personName: data.account.name,
      equipment: equipment.trim(), code: '', situation: 'Solicitação de equipamento', reason: reason.trim(),
      category: categoryName(data, equipmentCategoryId), equipmentCategoryId: equipmentCategoryId || undefined,
      equipmentType, quantity: 1, createdAt: new Date().toISOString(), createdBy: data.account.name, status: 'Aguardando TST',
    }
    onChange({
      ...data,
      equipmentApprovalRequests: [...data.equipmentApprovalRequests, request],
      notifications: [...data.notifications, { id: crypto.randomUUID(), title: 'Solicitação aguardando o TST', detail: `${data.account.name} solicitou ${request.equipment}.`, createdAt: request.createdAt, read: false, critical: false }],
    }, 'Solicitação enviada para aprovação da Segurança do Trabalho.')
    onClose()
  }

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Solicitar material">
    <button className="modal-backdrop" onClick={onClose} aria-label="Fechar" />
    <form className="quick-modal equipment-request-modal" onSubmit={submit}>
      <div className="modal-heading"><div><p className="eyebrow">Pessoal · {equipmentType}</p><h2>Solicitar material</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></div>
      <label>Equipamento<input value={equipment} onChange={event => setEquipment(event.target.value)} placeholder="Informe o equipamento necessário" required /></label>
      {categories.length > 0 && <label>Categoria<select value={equipmentCategoryId} onChange={event => setEquipmentCategoryId(event.target.value)}><option value="">Sem categoria definida</option>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>}
      <label>Motivo<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Explique por que o material é necessário" required /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!equipment.trim() || !reason.trim()}><PackageCheck size={17} /> Salvar solicitação</button></div>
    </form>
  </div>
}

export function EquipmentApprovalsPage({ data, onChange }: { data: AppData; onChange: DataChange }) {
  const [selectedId, setSelectedId] = useState('')
  const [directOpen, setDirectOpen] = useState(false)
  const requests = useMemo(() => [...data.equipmentApprovalRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.equipmentApprovalRequests])
  const selected = requests.find(request => request.id === selectedId)

  const decide = (request: EquipmentApprovalRequest, action: 'Cancelar' | 'Devolver ao estoque' | 'Solicitar material') => {
    const now = new Date().toISOString()
    const status = action === 'Cancelar' ? 'Cancelado' : action === 'Devolver ao estoque' ? 'Devolvido ao estoque' : 'Enviado ao estoque'
    const equipmentApprovalRequests = data.equipmentApprovalRequests.map(item => item.id === request.id ? { ...item, status: status as EquipmentApprovalRequest['status'], processedAt: now, processedBy: data.account.name } : item)
    const materialUsages = request.materialUsageId ? data.materialUsages.map(item => item.id !== request.materialUsageId ? item : {
      ...item,
      workflowStatus: action === 'Cancelar' ? 'Cancelado' as const : action === 'Devolver ao estoque' ? 'Recebido' as const : 'Aguardando recebimento' as const,
      processedAt: now,
      processedBy: data.account.name,
    }) : data.materialUsages
    const stockRequest: EquipmentStockRequest | null = action !== 'Solicitar material' ? null : {
      id: crypto.randomUUID(), sourceApprovalId: request.id, personId: request.personId, personName: request.personName,
      requestedEquipment: request.equipment, reason: request.reason, equipmentType: request.equipmentType,
      equipmentCategoryId: request.equipmentCategoryId, categoryName: request.category, quantity: request.quantity,
      status: 'Criado', createdAt: now, requestedBy: data.account.name,
    }
    onChange({
      ...data,
      materialUsages,
      equipmentApprovalRequests,
      equipmentStockRequests: stockRequest ? [...data.equipmentStockRequests, stockRequest] : data.equipmentStockRequests,
      notifications: [...data.notifications, { id: crypto.randomUUID(), title: action === 'Solicitar material' ? 'Nova solicitação para o Estoque' : 'Análise do TST concluída', detail: `${request.equipment} · ${request.personName} · ${action}`, createdAt: now, read: false, critical: false }],
    }, action === 'Cancelar' ? 'Solicitação cancelada e equipamento devolvido ao estoque pessoal.' : action === 'Devolver ao estoque' ? 'Devolução aprovada e encerrada pelo TST.' : 'Solicitação aprovada e enviada ao Estoque.')
    setSelectedId('')
  }

  return <>
    <section className="page-intro"><div><p className="eyebrow">Segurança do Trabalho</p><h2>Aprovação de equipamentos</h2><p>Analise baixas, trocas e solicitações antes de encaminhar o atendimento ao Estoque.</p></div><button className="primary-button" onClick={() => setDirectOpen(true)}><Plus size={18} /> Solicitar para uma pessoa</button></section>
    <section className="attention-grid stock-summary"><article className="metric-card"><span><ShieldCheck size={21} /></span><div><b>{requests.filter(item => item.status === 'Aguardando TST').length}</b><small>Aguardando o TST</small></div></article><article className="metric-card"><span><ShoppingCart size={21} /></span><div><b>{requests.filter(item => item.status === 'Enviado ao estoque').length}</b><small>Enviadas ao Estoque</small></div></article><article className="metric-card"><span><CheckCircle2 size={21} /></span><div><b>{requests.filter(item => ['Atendido', 'Devolvido ao estoque'].includes(item.status)).length}</b><small>Concluídas</small></div></article></section>
    <section className="surface table-surface"><div className="table-toolbar"><div><p className="eyebrow">Fila do TST</p><h3>Movimentações de equipamentos</h3></div></div><div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Código</th><th>Situação</th><th>Motivo</th><th>Categoria</th><th>Tipo</th><th>Status</th><th>Ação</th></tr></thead><tbody>{requests.length ? requests.map(request => <tr key={request.id}><td><b>{request.equipment}</b><small className="table-subtitle">{request.personName}</small></td><td>{request.code || '—'}</td><td>{request.situation}</td><td>{request.reason}</td><td>{request.category}</td><td>{request.equipmentType}</td><td><span className={`status ${statusTone(request.status)}`}>{request.status}</span></td><td>{request.status === 'Aguardando TST' ? <button className="secondary-button compact" onClick={() => setSelectedId(request.id)}>Seguir <ChevronRight size={15} /></button> : '—'}</td></tr>) : <tr><td colSpan={8} className="table-empty">Nenhuma movimentação aguardando análise.</td></tr>}</tbody></table></div></section>
    {selected && <div className="modal-layer"><button className="modal-backdrop" onClick={() => setSelectedId('')} aria-label="Fechar" /><section className="quick-modal equipment-decision-modal"><div className="modal-heading"><div><p className="eyebrow">Decisão do TST</p><h2>{selected.equipment}</h2></div><button className="icon-button" onClick={() => setSelectedId('')}><X size={20} /></button></div><div className="writeoff-item-summary"><ShieldCheck size={22} /><div><b>{selected.personName}</b><span>{selected.situation} · {selected.category}</span><small>{selected.reason}</small></div></div><p className="form-intro">Escolha o destino desta movimentação. O cancelamento devolve o item ao estoque pessoal do técnico.</p><div className="decision-actions"><button className="secondary-button danger-button" onClick={() => decide(selected, 'Cancelar')}><X size={17} /> Cancelar</button><button className="secondary-button" onClick={() => decide(selected, 'Devolver ao estoque')}><ClipboardCheck size={17} /> Devolver ao estoque</button><button className="primary-button" onClick={() => decide(selected, 'Solicitar material')}><ShoppingCart size={17} /> Solicitar material</button></div></section></div>}
    {directOpen && <DirectTstRequestModal data={data} onClose={() => setDirectOpen(false)} onChange={onChange} />}
  </>
}

function DirectTstRequestModal({ data, onClose, onChange }: { data: AppData; onClose: () => void; onChange: DataChange }) {
  const people = data.people.filter(person => person.active)
  const [personId, setPersonId] = useState(people[0]?.id ?? '')
  const [equipmentType, setEquipmentType] = useState<EquipmentType>('Ferramenta')
  const categories = data.equipmentCategories.filter(category => category.active && category.type === equipmentType)
  const [equipmentCategoryId, setEquipmentCategoryId] = useState('')
  const [equipment, setEquipment] = useState('')
  const [reason, setReason] = useState('')
  const [quantity, setQuantity] = useState('1')
  const amount = parseQuantity(quantity)
  const person = people.find(item => item.id === personId)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!person || !equipment.trim() || !reason.trim() || !Number.isFinite(amount) || amount <= 0) return
    const now = new Date().toISOString()
    const category = data.equipmentCategories.find(item => item.id === equipmentCategoryId)
    const approvalId = crypto.randomUUID()
    const approval: EquipmentApprovalRequest = {
      id: approvalId, personId: person.id, personName: person.name, equipment: equipment.trim(), code: '',
      situation: 'Solicitação de equipamento', reason: reason.trim(), category: category?.name ?? 'Sem categoria definida',
      equipmentCategoryId: category?.id, equipmentType, quantity: amount, createdAt: now, createdBy: data.account.name,
      status: 'Enviado ao estoque', processedAt: now, processedBy: data.account.name,
    }
    const stockRequest: EquipmentStockRequest = {
      id: crypto.randomUUID(), sourceApprovalId: approvalId, personId: person.id, personName: person.name,
      requestedEquipment: equipment.trim(), reason: reason.trim(), equipmentType, equipmentCategoryId: category?.id,
      categoryName: category?.name ?? 'Sem categoria definida', quantity: amount, status: 'Criado', createdAt: now, requestedBy: data.account.name,
    }
    onChange({ ...data, equipmentApprovalRequests: [...data.equipmentApprovalRequests, approval], equipmentStockRequests: [...data.equipmentStockRequests, stockRequest] }, `Solicitação para ${person.name} enviada ao Estoque.`)
    onClose()
  }
  return <div className="modal-layer"><button className="modal-backdrop" onClick={onClose} aria-label="Fechar" /><form className="quick-modal" onSubmit={submit}><div className="modal-heading"><div><p className="eyebrow">Solicitação direta do TST</p><h2>Atribuir solicitação a uma pessoa</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></div><div className="form-grid"><label className="full">Pessoa<select value={personId} onChange={event => setPersonId(event.target.value)} required>{people.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Tipo<select value={equipmentType} onChange={event => { setEquipmentType(event.target.value as EquipmentType); setEquipmentCategoryId('') }}><option>Ferramenta</option><option>EPI</option></select></label><label>Categoria<select value={equipmentCategoryId} onChange={event => setEquipmentCategoryId(event.target.value)}><option value="">Sem categoria definida</option>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>Equipamento<input value={equipment} onChange={event => setEquipment(event.target.value)} required /></label><label>Quantidade<input type="text" inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} required /></label><label className="full">Motivo<textarea value={reason} onChange={event => setReason(event.target.value)} required /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!person || !equipment.trim() || !reason.trim() || !Number.isFinite(amount) || amount <= 0}><ShoppingCart size={17} /> Enviar ao Estoque</button></div></form></div>
}

export function EquipmentStockRequestsPage({ data, onChange }: { data: AppData; onChange: DataChange }) {
  const [selectedId, setSelectedId] = useState('')
  const requests = useMemo(() => [...data.equipmentStockRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.equipmentStockRequests])
  const selected = requests.find(request => request.id === selectedId)
  const updateStatus = (request: EquipmentStockRequest, status: EquipmentStockRequest['status']) => {
    const now = new Date().toISOString()
    onChange({ ...data, equipmentStockRequests: data.equipmentStockRequests.map(item => item.id === request.id ? { ...item, status, ...(status === 'Recebido' ? { receivedAt: now, receivedBy: data.account.name } : {}) } : item) }, `Solicitação alterada para ${status}.`)
  }

  if (selected) return <EquipmentStockRequestDetail data={data} request={selected} onBack={() => setSelectedId('')} onChange={onChange} onStatus={status => updateStatus(selected, status)} />

  return <>
    <section className="page-intro"><div><p className="eyebrow">Estoque</p><h2>Solicitações de equipamentos</h2><p>Receba as solicitações aprovadas pelo TST, acompanhe compras e conclua a separação para o técnico.</p></div></section>
    <section className="attention-grid stock-summary"><article className="metric-card"><span><PackageCheck size={21} /></span><div><b>{requests.filter(item => item.status === 'Criado').length}</b><small>Criadas</small></div></article><article className="metric-card"><span><ShoppingCart size={21} /></span><div><b>{requests.filter(item => item.status === 'Aguardando compra').length}</b><small>Aguardando compra</small></div></article><article className="metric-card"><span><ClipboardCheck size={21} /></span><div><b>{requests.filter(item => item.status === 'Em separação').length}</b><small>Em separação</small></div></article></section>
    <section className="surface table-surface"><div className="table-toolbar"><div><p className="eyebrow">Fila do estoque</p><h3>Solicitações recebidas do TST</h3></div></div><div className="responsive-table"><table><thead><tr><th>Solicitado para</th><th>Equipamento</th><th>Categoria</th><th>Tipo</th><th>Quantidade</th><th>Status</th><th>Ação</th></tr></thead><tbody>{requests.length ? requests.map(request => <tr key={request.id}><td><b>{request.personName}</b><small className="table-subtitle">Por {request.requestedBy}</small></td><td>{request.requestedEquipment}</td><td>{request.categoryName}</td><td>{request.equipmentType}</td><td>{formatQuantity(request.quantity)}</td><td><span className={`status ${statusTone(request.status)}`}>{request.status}</span></td><td><button className="secondary-button compact" onClick={() => setSelectedId(request.id)}>Acessar <ChevronRight size={15} /></button></td></tr>) : <tr><td colSpan={7} className="table-empty">Nenhuma solicitação de equipamento recebida.</td></tr>}</tbody></table></div></section>
  </>
}

function EquipmentStockRequestDetail({ data, request, onBack, onChange, onStatus }: { data: AppData; request: EquipmentStockRequest; onBack: () => void; onChange: DataChange; onStatus: (status: EquipmentStockRequest['status']) => void }) {
  const categories = data.equipmentCategories.filter(category => category.active && category.type === request.equipmentType)
  const [form, setForm] = useState({
    equipment: request.equipment || request.requestedEquipment,
    equipmentCategoryId: request.equipmentCategoryId || categories[0]?.id || '', brand: request.brand || '', model: request.model || '',
    code: request.code || '', ca: request.ca || '', serialNumber: request.serialNumber || '', notes: request.notes || '',
  })
  const [photo, setPhoto] = useState(request.photo || '')
  const duplicateCode = Boolean(form.code.trim() && data.inventory.some(item => item.code.trim().toLocaleUpperCase('pt-BR') === form.code.trim().toLocaleUpperCase('pt-BR')))

  const completeSeparation = (event: FormEvent) => {
    event.preventDefault()
    const category = data.equipmentCategories.find(item => item.id === form.equipmentCategoryId)
    if (!form.equipment.trim() || !form.code.trim() || !category || duplicateCode || !photo) return
    const now = new Date().toISOString()
    const item: InventoryItem = {
      id: crypto.randomUUID(), equipment: form.equipment.trim(), brand: form.brand.trim(), model: form.model.trim(),
      category: request.equipmentType === 'EPI' ? 'EPI' : 'Ferramenta pessoal', equipmentCategoryId: category.id,
      unit: 'Unidade', quantity: 0, minimum: 0, code: form.code.trim().toLocaleUpperCase('pt-BR'), ca: form.ca.trim(),
      serialNumber: form.serialNumber.trim(), notes: form.notes.trim(),
    }
    const assignment: StockAssignment = {
      id: crypto.randomUUID(), personId: request.personId, inventoryItemId: item.id, equipment: item.equipment,
      brand: item.brand, model: item.model, category: item.category, equipmentCategoryId: item.equipmentCategoryId,
      unit: item.unit, code: item.code, ca: item.ca, serialNumber: item.serialNumber, quantity: request.quantity,
      assignedAt: now, assignedBy: data.account.name, notes: item.notes, status: 'Pendente', photo,
      sourceRequestCode: `EQ-${request.id.slice(0, 8).toUpperCase()}`,
    }
    const equipmentStockRequests = data.equipmentStockRequests.map(entry => entry.id === request.id ? {
      ...entry, ...form, photo, categoryName: category.name, status: 'Enviado para aprovação' as const,
      completedAt: now, completedBy: data.account.name, assignmentId: assignment.id,
    } : entry)
    const equipmentApprovalRequests = data.equipmentApprovalRequests.map(entry => entry.id === request.sourceApprovalId ? { ...entry, status: 'Atendido' as const, processedAt: now, processedBy: data.account.name } : entry)
    onChange({
      ...data,
      inventory: [...data.inventory, item], stockAssignments: [...data.stockAssignments, assignment],
      equipmentStockRequests, equipmentApprovalRequests,
      notifications: [...data.notifications, { id: crypto.randomUUID(), title: 'Equipamento pronto para aprovação', detail: `${item.equipment} foi separado para ${request.personName}.`, createdAt: now, read: false, critical: false }],
    }, `Equipamento separado e enviado para aprovação de ${request.personName}.`)
    onBack()
  }

  return <>
    <button className="secondary-button audit-back" onClick={onBack}><ArrowLeft size={16} /> Voltar às solicitações</button>
    <section className="page-intro"><div><p className="eyebrow">Solicitação para {request.personName}</p><h2>{request.requestedEquipment}</h2><p>{request.reason}</p></div><span className={`status ${statusTone(request.status)}`}>{request.status}</span></section>
    <section className="surface order-summary-card"><div><small>Tipo</small><b>{request.equipmentType}</b></div><div><small>Categoria solicitada</small><b>{request.categoryName}</b></div><div><small>Quantidade</small><b>{formatQuantity(request.quantity)}</b></div><div><small>Solicitado por</small><b>{request.requestedBy}</b></div></section>
    {request.status === 'Criado' && <section className="surface order-next-step"><div><PackageCheck size={23} /><div><h3>Confirmar entrada da solicitação</h3><p>Ao confirmar, a solicitação passa para o status Recebido.</p></div></div><button className="primary-button" onClick={() => onStatus('Recebido')}>Marcar como recebido <ChevronRight size={17} /></button></section>}
    {request.status === 'Recebido' && <section className="surface order-next-step"><div><ShoppingCart size={23} /><div><h3>Definir forma de atendimento</h3><p>Informe se será necessário comprar o equipamento ou se a separação pode começar.</p></div></div><div className="row-actions"><button className="secondary-button" onClick={() => onStatus('Aguardando compra')}>Aguardando compra</button><button className="primary-button" onClick={() => onStatus('Em separação')}>Iniciar separação</button></div></section>}
    {request.status === 'Aguardando compra' && <section className="surface order-next-step"><div><ShoppingCart size={23} /><div><h3>Aguardando compra</h3><p>Quando o equipamento estiver disponível, inicie a separação.</p></div></div><button className="primary-button" onClick={() => onStatus('Em separação')}>Iniciar separação</button></section>}
    {request.status === 'Em separação' && <form className="surface simple-assignment-form" onSubmit={completeSeparation}><div className="section-heading"><div><p className="eyebrow">Dados do equipamento entregue</p><h3>Concluir separação</h3></div><ClipboardCheck size={22} /></div><div className="simple-assignment-grid"><label>Equipamento<input value={form.equipment} onChange={event => setForm({ ...form, equipment: event.target.value })} required /></label><label>Categoria<select value={form.equipmentCategoryId} onChange={event => setForm({ ...form, equipmentCategoryId: event.target.value })} required><option value="">Selecione</option>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>Fabricante<input value={form.brand} onChange={event => setForm({ ...form, brand: event.target.value })} /></label><label>Modelo<input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} /></label><label>Código / patrimônio<input value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toLocaleUpperCase('pt-BR') })} required /></label><label>C.A. {request.equipmentType === 'EPI' ? '' : '(opcional)'}<input value={form.ca} onChange={event => setForm({ ...form, ca: event.target.value })} required={request.equipmentType === 'EPI'} /></label><label>Número de série (opcional)<input value={form.serialNumber} onChange={event => setForm({ ...form, serialNumber: event.target.value })} /></label><label className="wide">Observações (opcional)<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label></div>{duplicateCode && <p className="assignment-warning">Já existe um equipamento com este código. Informe um código individual diferente.</p>}<label className={photo ? 'writeoff-photo-field filled' : 'writeoff-photo-field'}><input type="file" accept="image/*" capture="environment" onChange={event => readPhoto(event, setPhoto)} />{photo ? <><img src={photo} alt="Equipamento separado" /><span><CheckCircle2 size={18} /> Foto registrada</span></> : <><Camera size={28} /><b>Tirar foto do equipamento</b><small>A foto será apresentada à pessoa na aprovação</small></>}</label><div className="simple-assignment-footer"><p>Ao concluir, o equipamento será enviado para a aba <b>Aprovações</b> da pessoa.</p><button className="primary-button" disabled={!form.equipment.trim() || !form.code.trim() || !form.equipmentCategoryId || duplicateCode || !photo}><CheckCircle2 size={18} /> Concluir separação</button></div></form>}
    {request.status === 'Enviado para aprovação' && <section className="surface empty-state"><CheckCircle2 size={30} /><h3>Enviado para aprovação</h3><p>O equipamento foi separado e aguarda a confirmação de recebimento de {request.personName}.</p></section>}
  </>
}
