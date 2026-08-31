import { ChangeEvent, FormEvent, useState } from 'react'
import { ArrowLeft, Boxes, Camera, CheckCircle2, ChevronRight, ClipboardList, PackageCheck, Plus, Replace, UserCheck, X } from 'lucide-react'
import { formatQuantity, parseQuantity, type AppData, type InventoryItem, type StockAssignment, type StockRequest, type StockRequestItem } from './store'

type DataChange = (data: AppData, message?: string) => void

function requestStatusTone(status: string) {
  if (status === 'Pedido separado' || status === 'Substituído' || status === 'Enviado para aprovação') return 'success'
  if (status === 'Cancelado') return 'danger'
  return 'warning'
}

function effectiveItems(request: StockRequest) {
  return request.requestedItems.filter(item => item.status !== 'Cancelado')
}

export function StockRequestsPage({ data, onNewRequest }: { data: AppData; onNewRequest: () => void }) {
  const requests = [...data.stockRequests].filter(item => item.requester === data.account.name || item.author === data.account.name).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return <>
    <section className="page-intro"><div><p className="eyebrow">Gestão operacional</p><h2>Solicitações ao estoque</h2><p>Solicite materiais e acompanhe o andamento de cada pedido enviado ao Estoque.</p></div><button className="primary-button" onClick={onNewRequest}><Plus size={18} /> Nova solicitação</button></section>
    <section className="attention-grid stock-summary"><article className="metric-card"><span><ClipboardList size={21} /></span><div><b>{requests.length}</b><small>Solicitações realizadas</small></div></article><article className="metric-card"><span><Boxes size={21} /></span><div><b>{requests.filter(item => item.status !== 'Pedido separado').length}</b><small>Em andamento</small></div></article><article className="metric-card"><span><CheckCircle2 size={21} /></span><div><b>{requests.filter(item => item.status === 'Pedido separado').length}</b><small>Pedidos separados</small></div></article></section>
    <section className="surface table-surface"><div className="table-toolbar"><div><p className="eyebrow">Acompanhamento</p><h3>Minhas solicitações</h3></div></div><div className="responsive-table"><table><thead><tr><th>Código</th><th>Solicitado em</th><th>Técnico</th><th>Cliente</th><th>Itens</th><th>Previsão</th><th>Status</th></tr></thead><tbody>{requests.length ? requests.map(request => <tr key={request.id}><td><b>{request.code}</b></td><td>{new Date(request.createdAt).toLocaleString('pt-BR')}</td><td>{request.technician}</td><td>{request.client || 'Sem cliente'}</td><td>{request.items}</td><td>{request.expectedDate ? new Date(`${request.expectedDate}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informada'}</td><td><span className={`status ${requestStatusTone(request.status)}`}>{request.status}</span></td></tr>) : <tr><td colSpan={7} className="table-empty">Nenhuma solicitação realizada.</td></tr>}</tbody></table></div></section>
  </>
}

type ItemAction = { requestId: string; itemId: string; mode: 'cancel' | 'substitute' }

export function StockOrdersPage({ data, onChange }: { data: AppData; onChange: DataChange }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [itemAction, setItemAction] = useState<ItemAction | null>(null)
  const selected = data.stockRequests.find(item => item.id === selectedId)
  const requests = [...data.stockRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const advanceStatus = (request: StockRequest) => {
    const status = request.status === 'Pedido recebido' ? 'Em separação' : 'Pedido separado'
    onChange({ ...data, stockRequests: data.stockRequests.map(item => item.id === request.id ? { ...item, status } : item) }, status === 'Em separação' ? `Separação do pedido ${request.code} iniciada.` : `Pedido ${request.code} marcado como separado.`)
  }

  if (selected) return <>
    <button className="secondary-button audit-back" onClick={() => setSelectedId(null)}><ArrowLeft size={16} /> Voltar aos pedidos</button>
    <section className="page-intro order-detail-intro"><div><p className="eyebrow">Pedido {selected.code}</p><h2>Separação do pedido</h2><p>Solicitado por {selected.requester} para {selected.technician}{selected.client ? ` · cliente ${selected.client}` : ''}.</p></div><span className={`status ${requestStatusTone(selected.status)}`}>{selected.status}</span></section>
    <section className="surface order-summary-card"><div><small>Solicitado em</small><b>{new Date(selected.createdAt).toLocaleString('pt-BR')}</b></div><div><small>Retirada prevista</small><b>{selected.expectedDate ? new Date(`${selected.expectedDate}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informada'}</b></div><div><small>Quantidade de itens</small><b>{selected.items}</b></div><div><small>Observação</small><b>{selected.generalNotes || 'Sem observação'}</b></div></section>
    <section className="surface table-surface order-items-table"><div className="table-toolbar"><div><p className="eyebrow">Conferência</p><h3>Itens solicitados</h3></div></div><div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Marca / modelo</th><th>Quantidade</th><th>Situação</th><th>Detalhes</th><th>Ações</th></tr></thead><tbody>{selected.requestedItems.map(item => <tr key={item.id}><td><b>{item.equipment}</b></td><td>{[item.brand, item.model].filter(Boolean).join(' · ') || 'Não informado'}</td><td>{formatQuantity(item.quantity)}</td><td><span className={`status ${requestStatusTone(item.status)}`}>{item.status}</span></td><td>{item.status === 'Substituído' && item.substitute ? <span className="substitute-summary"><b>Substituído por:</b> {item.substitute.equipment} · {formatQuantity(item.substitute.quantity)}</span> : item.description || '—'}</td><td>{selected.status === 'Em separação' && item.status === 'Solicitado' ? <div className="table-actions"><button className="secondary-button compact danger-button" onClick={() => setItemAction({ requestId: selected.id, itemId: item.id, mode: 'cancel' })}><X size={14} /> Cancelar</button><button className="secondary-button compact" onClick={() => setItemAction({ requestId: selected.id, itemId: item.id, mode: 'substitute' })}><Replace size={14} /> Substituir</button></div> : '—'}</td></tr>)}</tbody></table></div></section>
    <section className="surface order-next-step"><div><PackageCheck size={23} /><div><h3>{selected.status === 'Pedido recebido' ? 'Pedido pronto para iniciar' : selected.status === 'Em separação' ? 'Finalize após conferir todos os itens' : 'Separação concluída'}</h3><p>{selected.status === 'Pedido separado' ? 'Este pedido já está disponível no Gerenciamento para atribuição dos equipamentos.' : 'Itens sem estoque podem ser cancelados ou substituídos durante a separação.'}</p></div></div>{selected.status !== 'Pedido separado' && <button className="primary-button" onClick={() => advanceStatus(selected)}>{selected.status === 'Pedido recebido' ? 'Iniciar separação' : 'Marcar como pedido separado'} <ChevronRight size={17} /></button>}</section>
    {itemAction && <RequestItemActionModal action={itemAction} request={selected} onClose={() => setItemAction(null)} onSave={updated => { onChange({ ...data, stockRequests: data.stockRequests.map(item => item.id === updated.id ? updated : item) }, itemAction.mode === 'cancel' ? 'Item cancelado no pedido.' : 'Substituição aprovada.'); setItemAction(null) }} />}
  </>

  return <>
    <section className="page-intro"><div><p className="eyebrow">Estoque e separação</p><h2>Pedidos</h2><p>Consulte as solicitações recebidas, faça a separação e resolva itens indisponíveis.</p></div></section>
    <section className="surface table-surface orders-table"><div className="table-toolbar"><div><p className="eyebrow">Fila do estoque</p><h3>Pedidos recebidos</h3></div></div><div className="responsive-table"><table><thead><tr><th>Código</th><th>Solicitante</th><th>Técnico responsável</th><th>Cliente</th><th>Itens</th><th>Status</th><th>Ação</th></tr></thead><tbody>{requests.length ? requests.map(request => <tr key={request.id}><td><b>{request.code}</b></td><td>{request.requester}</td><td>{request.technician}</td><td>{request.client || 'Sem cliente'}</td><td>{request.items}</td><td><span className={`status ${requestStatusTone(request.status)}`}>{request.status}</span></td><td><button className="secondary-button compact" onClick={() => setSelectedId(request.id)}>Acessar pedido <ChevronRight size={15} /></button></td></tr>) : <tr><td colSpan={7} className="table-empty">Nenhum pedido recebido.</td></tr>}</tbody></table></div></section>
  </>
}

function RequestItemActionModal({ action, request, onClose, onSave }: { action: ItemAction; request: StockRequest; onClose: () => void; onSave: (request: StockRequest) => void }) {
  const original = request.requestedItems.find(item => item.id === action.itemId)!
  const [description, setDescription] = useState('')
  const [equipment, setEquipment] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [quantity, setQuantity] = useState(String(original.quantity).replace('.', ','))
  const amount = parseQuantity(quantity)
  const valid = description.trim() && (action.mode === 'cancel' || (equipment.trim() && Number.isFinite(amount) && amount > 0))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    const updatedItem: StockRequestItem = action.mode === 'cancel'
      ? { ...original, status: 'Cancelado', description: description.trim() }
      : { ...original, status: 'Substituído', description: description.trim(), substitute: { equipment: equipment.trim(), brand: brand.trim(), model: model.trim(), quantity: amount } }
    onSave({ ...request, requestedItems: request.requestedItems.map(item => item.id === original.id ? updatedItem : item) })
  }
  return <div className="modal-layer"><button className="modal-backdrop" onClick={onClose} aria-label="Fechar" /><form className="quick-modal order-item-modal" onSubmit={submit}><div className="modal-heading"><div><p className="eyebrow">{request.code}</p><h2>{action.mode === 'cancel' ? 'Cancelar item' : 'Substituir item'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></div><div className="writeoff-item-summary"><PackageCheck size={21} /><div><b>{original.equipment}</b><span>{[original.brand, original.model].filter(Boolean).join(' · ') || 'Sem marca e modelo'}</span><small>Quantidade: {formatQuantity(original.quantity)}</small></div></div>{action.mode === 'substitute' && <div className="form-grid order-substitute-fields"><label>Equipamento substituto<input value={equipment} onChange={event => setEquipment(event.target.value)} required /></label><label>Marca (opcional)<input value={brand} onChange={event => setBrand(event.target.value)} /></label><label>Modelo (opcional)<input value={model} onChange={event => setModel(event.target.value)} /></label><label>Quantidade<input type="text" inputMode="decimal" pattern="[0-9]+([,.][0-9]+)?" value={quantity} onChange={event => setQuantity(event.target.value)} required /></label></div>}<label>Descrição / justificativa<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder={action.mode === 'cancel' ? 'Informe por que o item não será atendido' : 'Explique o motivo da substituição'} required /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Voltar</button><button className="primary-button" disabled={!valid}>{action.mode === 'cancel' ? 'Confirmar cancelamento' : 'Aprovar substituição'}</button></div></form></div>
}

export function EquipmentRequestBlock({ data, onChange }: { data: AppData; onChange: DataChange }) {
  const requests = [...data.stockRequests].filter(item => item.status === 'Pedido separado').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const activeRequest = data.stockRequests.find(item => item.id === activeRequestId)
  return <>
    <section className="surface table-surface equipment-request-block"><div className="table-toolbar"><div><p className="eyebrow">Solicitação de equipamento</p><h3>Pedidos prontos para atribuição</h3><span className="table-subtitle">Escolha quem receberá os equipamentos e registre as fotos antes de enviar para aprovação.</span></div></div><div className="responsive-table"><table><thead><tr><th>Solicitante</th><th>Código do bloco</th><th>Equipamentos</th><th>Quantidade total</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{requests.length ? requests.map(request => { const items = effectiveItems(request); const total = items.reduce((sum, item) => sum + (item.substitute?.quantity ?? item.quantity), 0); return <tr key={request.id}><td>{request.requester}</td><td><b>{request.code}</b></td><td>{items.length}</td><td>{formatQuantity(total)}</td><td><span className={`status ${request.assignmentStatus ? 'success' : 'warning'}`}>{request.assignmentStatus ?? 'Aguardando aprovação'}</span></td><td>{request.assignmentStatus ? <span>{request.assignedPersonName}</span> : <button className="primary-button compact" onClick={() => setActiveRequestId(request.id)}><UserCheck size={15} /> Aprovar</button>}</td></tr> }) : <tr><td colSpan={6} className="table-empty">Nenhum pedido separado aguardando atribuição.</td></tr>}</tbody></table></div></section>
    {activeRequest && <EquipmentApprovalModal data={data} request={activeRequest} onClose={() => setActiveRequestId(null)} onComplete={next => { onChange(next, `Equipamentos do pedido ${activeRequest.code} enviados para aprovação.`); setActiveRequestId(null) }} />}
  </>
}

function EquipmentApprovalModal({ data, request, onClose, onComplete }: { data: AppData; request: StockRequest; onClose: () => void; onComplete: (data: AppData) => void }) {
  const items = effectiveItems(request)
  const [personId, setPersonId] = useState('')
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const selectedPerson = data.people.find(person => person.id === personId)
  const ready = !!selectedPerson && items.length > 0 && items.every(item => photos[item.id])
  const capture = (itemId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhotos(current => ({ ...current, [itemId]: String(reader.result ?? '') }))
    reader.readAsDataURL(file)
  }
  const approve = () => {
    if (!selectedPerson || !ready) return
    let inventory = [...data.inventory]
    const assignments: StockAssignment[] = []
    items.forEach((requestedItem, index) => {
      const source = requestedItem.status === 'Substituído' && requestedItem.substitute ? requestedItem.substitute : requestedItem
      const matchIndex = inventory.findIndex(item => item.equipment.trim().toLowerCase() === source.equipment.trim().toLowerCase() && (!source.brand || item.brand.trim().toLowerCase() === source.brand.trim().toLowerCase()) && (!source.model || item.model.trim().toLowerCase() === source.model.trim().toLowerCase()))
      let inventoryItem: InventoryItem
      if (matchIndex >= 0) {
        inventoryItem = { ...inventory[matchIndex], quantity: inventory[matchIndex].quantity - source.quantity }
        inventory[matchIndex] = inventoryItem
      } else {
        inventoryItem = { id: crypto.randomUUID(), equipment: source.equipment, brand: source.brand, model: source.model, category: 'Ferramenta pessoal', unit: 'Unidade', quantity: -source.quantity, minimum: 0, code: `${request.code}-${String(index + 1).padStart(2, '0')}`, notes: `Criado a partir da solicitação ${request.code}.` }
        inventory.push(inventoryItem)
      }
      assignments.push({ id: crypto.randomUUID(), personId: selectedPerson.id, inventoryItemId: inventoryItem.id, equipment: inventoryItem.equipment, brand: inventoryItem.brand, model: inventoryItem.model, category: inventoryItem.category, unit: inventoryItem.unit, code: inventoryItem.code, quantity: source.quantity, assignedAt: new Date().toISOString(), assignedBy: data.account.name, notes: `Pedido ${request.code}${requestedItem.description ? ` · ${requestedItem.description}` : ''}`, status: 'Pendente', photo: photos[requestedItem.id], sourceRequestCode: request.code })
    })
    const stockRequests = data.stockRequests.map(item => item.id === request.id ? { ...item, assignmentStatus: 'Enviado para aprovação' as const, assignedPersonId: selectedPerson.id, assignedPersonName: selectedPerson.name, assignedAt: new Date().toISOString() } : item)
    onComplete({ ...data, inventory, stockRequests, stockAssignments: [...data.stockAssignments, ...assignments], notifications: [...data.notifications, { id: crypto.randomUUID(), title: 'Equipamentos aguardando aprovação', detail: `${request.code} · ${assignments.length} equipamentos para ${selectedPerson.name}`, createdAt: new Date().toISOString(), read: false, critical: false }] })
  }
  return <div className="modal-layer equipment-approval-layer"><button className="modal-backdrop" onClick={onClose} aria-label="Fechar" /><section className="quick-modal equipment-approval-modal"><div className="modal-heading"><div><p className="eyebrow">Pedido {request.code}</p><h2>Aprovar solicitação de equipamento</h2></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div><label>Pessoa que receberá os equipamentos<select value={personId} onChange={event => setPersonId(event.target.value)} required><option value="">Selecione a pessoa</option>{data.people.filter(person => person.active).map(person => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label><div className="equipment-photo-list">{items.map(item => { const source = item.status === 'Substituído' && item.substitute ? item.substitute : item; return <article key={item.id}><div><b>{source.equipment}</b><small>{formatQuantity(source.quantity)} · {[source.brand, source.model].filter(Boolean).join(' · ') || 'Sem marca/modelo'}</small></div><label className={photos[item.id] ? 'equipment-photo filled' : 'equipment-photo'}><input type="file" accept="image/*" capture="environment" onChange={event => capture(item.id, event)} />{photos[item.id] ? <><img src={photos[item.id]} alt={`Foto de ${source.equipment}`} /><span><CheckCircle2 size={16} /> Foto registrada</span></> : <><Camera size={22} /><b>Tirar foto</b></>}</label></article> })}</div><p className="assignment-warning"><Camera size={16} />É necessária uma foto de cada equipamento para enviar o bloco à aprovação da pessoa.</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!ready} onClick={approve}><CheckCircle2 size={17} /> Enviar para aprovação</button></div></section></div>
}
