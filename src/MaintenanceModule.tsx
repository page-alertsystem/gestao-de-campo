import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Camera, CheckCircle2, ChevronRight, FileText, PackageCheck, Printer, RotateCcw, Search, Send, Wrench } from 'lucide-react'
import { jsPDF } from 'jspdf'
import type { AppData, RmaRequest, RmaUrgency } from './store'
import { publicAsset } from './paths'
import { serverApiFetch } from './serverApi'

const todayInput = () => new Date().toISOString().slice(0, 10)
const movideskEndpoint = String(import.meta.env.VITE_MOVIEDESK_RMA_ENDPOINT ?? '/api/movidesk/rma').trim()
const serverHealthEndpoint = String(import.meta.env.VITE_GIO_HEALTH_ENDPOINT ?? '/api/health').trim()
type IntegrationState = 'checking' | 'ready' | 'server-pending' | 'unavailable'
type ThermalReceiptVariant = 'full' | 'summary'
type ThermalPrintChoice = { request: RmaRequest; receiving: boolean }
type MovideskRmaResult = {
  id?: string | number
  ticketId?: string | number
  internalId?: string | number
  actionId?: string | number
  photoUploaded?: boolean
  attachmentError?: string
}

async function readImage(event: ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return ''
  if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.')
  return optimizeImage(file)
}

async function optimizeImage(source: Blob | string) {
  const objectUrl = typeof source === 'string' ? source : URL.createObjectURL(source)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Não foi possível abrir esta imagem.'))
      element.src = objectUrl
    })
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight)
    const scale = Math.min(1, 1600 / largestSide)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Este aparelho não conseguiu preparar a foto.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.78)
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(objectUrl)
  }
}

function rmaPayload(request: RmaRequest, photo = request.photo) {
  return {
    localCode: request.localCode, title: request.title, client: request.client, equipment: request.equipment,
    withdrawalDate: request.withdrawalDate, technician: request.technicianName, service: request.service,
    category: request.category, urgency: request.urgency, details: request.details, photo,
  }
}

async function sendRmaToMovidesk(request: RmaRequest, optimizeStoredPhoto = false) {
  const photo = request.photo && optimizeStoredPhoto ? await optimizeImage(request.photo) : request.photo
  const response = await serverApiFetch(movideskEndpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rmaPayload(request, photo)),
  })
  const result = await response.json().catch(() => ({})) as MovideskRmaResult & { error?: string }
  if (!response.ok) throw new Error(result.error || `Falha ${response.status}`)
  const ticketId = String(result.ticketId ?? result.id ?? '').trim()
  if (!ticketId) throw new Error('Número do ticket não retornado')
  return { result, ticketId, photo }
}

function withMovideskResult(request: RmaRequest, ticketId: string, result: MovideskRmaResult, photo = request.photo): RmaRequest {
  const photoUploaded = !photo || result.photoUploaded === true
  return {
    ...request,
    photo,
    movideskTicketId: ticketId,
    movideskInternalId: String(result.internalId ?? '').trim() || request.movideskInternalId,
    movideskActionId: String(result.actionId ?? '').trim() || request.movideskActionId,
    status: 'Enviado ao Movidesk',
    sentToMovideskAt: request.sentToMovideskAt ?? new Date().toISOString(),
    photoSentToMovideskAt: photoUploaded && photo ? new Date().toISOString() : request.photoSentToMovideskAt,
    integrationError: photoUploaded ? undefined : (result.attachmentError || 'O ticket foi criado, mas a foto ficou pendente de envio.'),
  }
}

function nextRmaCode(data: AppData) {
  const now = new Date()
  const prefix = `RMA${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`
  const sequence = data.rmaRequests.filter(item => item.localCode.startsWith(prefix)).length + 1
  return `${prefix}${String(sequence).padStart(4, '0')}`
}

export function RmaRequestPage({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const [client, setClient] = useState('')
  const [equipment, setEquipment] = useState('')
  const [withdrawalDate, setWithdrawalDate] = useState(todayInput())
  const [service, setService] = useState('Manutenção')
  const [category, setCategory] = useState('RMA')
  const [urgency, setUrgency] = useState<RmaUrgency>('Média')
  const [details, setDetails] = useState('')
  const [photo, setPhoto] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [photoLoading, setPhotoLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [integrationState, setIntegrationState] = useState<IntegrationState>('checking')

  useEffect(() => {
    let active = true
    serverApiFetch(serverHealthEndpoint, { headers: { Accept: 'application/json' } }, false)
      .then(async response => {
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Servidor indisponível')
        return response.json() as Promise<{ movideskConfigured?: boolean }>
      })
      .then(health => { if (active) setIntegrationState(health.movideskConfigured ? 'ready' : 'server-pending') })
      .catch(() => { if (active) setIntegrationState('unavailable') })
    return () => { active = false }
  }, [])

  const reset = () => {
    setClient(''); setEquipment(''); setWithdrawalDate(todayInput()); setService('Manutenção')
    setCategory('RMA'); setUrgency('Média'); setDetails(''); setPhoto(''); setPhotoError('')
  }

  const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    setPhotoLoading(true); setPhotoError('')
    try {
      const optimized = await readImage(event)
      if (optimized) setPhoto(optimized)
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Não foi possível preparar a foto.')
    } finally {
      setPhotoLoading(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSending(true)
    const createdAt = new Date().toISOString()
    const localCode = nextRmaCode(data)
    const title = `RMA: Manutenção - ${equipment.trim()} - ${client.trim()}`
    const request: RmaRequest = {
      id: crypto.randomUUID(), localCode, movideskTicketId: '', title, client: client.trim(), equipment: equipment.trim(),
      withdrawalDate, technicianId: data.account.id, technicianName: data.account.name, service: service.trim(), category: category.trim(),
      urgency, details: details.trim(), photo, createdAt, status: 'Aguardando integração Movidesk', printCount: 0,
    }
    let nextData: AppData = { ...data, rmaRequests: [...data.rmaRequests, request] }
    const integrationReady = integrationState === 'ready'
    onChange(nextData, integrationReady ? `Solicitação ${localCode} salva. Enviando ao Movidesk...` : `Solicitação ${localCode} salva no GIO e aguardando integração com o Movidesk.`)

    if (integrationReady) {
      try {
        const { result, ticketId } = await sendRmaToMovidesk(request)
        const sent = withMovideskResult(request, ticketId, result)
        nextData = { ...nextData, rmaRequests: nextData.rmaRequests.map(item => item.id === sent.id ? sent : item) }
        onChange(nextData, sent.integrationError ? `Ticket ${ticketId} criado. A foto ficou pendente e pode ser reenviada.` : `Ticket ${ticketId} criado no Movidesk com a foto.`)
      } catch {
        const failed: RmaRequest = { ...request, integrationError: 'Não foi possível enviar agora. O registro permanece salvo no GIO.' }
        nextData = { ...nextData, rmaRequests: nextData.rmaRequests.map(item => item.id === failed.id ? failed : item) }
        onChange(nextData, `Solicitação ${localCode} salva. O envio ao Movidesk ficou pendente.`)
      }
    }
    reset(); setSending(false)
  }

  return <>
    <section className="page-intro"><div><p className="eyebrow">Manutenção</p><h2>Solicitação de RMA</h2><p>Registre um equipamento danificado para encaminhamento à equipe de RMA. Cada equipamento gera um chamado individual.</p></div></section>
    <section className="surface rma-form-card">
      <div className="section-heading"><div><p className="eyebrow">Novo encaminhamento</p><h3>Dados do equipamento</h3></div><span className="rma-heading-icon"><Wrench size={23} /></span></div>
      <div className={integrationState === 'ready' ? 'rma-integration-state ready' : 'rma-integration-state'}>
        {integrationState === 'ready' ? <CheckCircle2 size={18} /> : integrationState === 'checking' ? <RotateCcw size={18} /> : <AlertTriangle size={18} />}
        <div><b>{integrationState === 'ready' ? 'Servidor local e Movidesk configurados' : integrationState === 'server-pending' ? 'Servidor local ativo; Movidesk aguarda configuração' : integrationState === 'checking' ? 'Verificando o servidor local...' : 'Acesse pelo servidor local para usar o Movidesk'}</b><small>O registro sempre será salvo no GIO. A credencial do Movidesk ficará protegida somente nesta máquina.</small></div>
      </div>
      <form className="rma-form" onSubmit={submit}>
        <div className="rma-form-grid">
          <label>Cliente<input value={client} onChange={event => setClient(event.target.value)} placeholder="Digite o nome do cliente" required /></label>
          <label>Equipamento<input value={equipment} onChange={event => setEquipment(event.target.value)} placeholder="Informe o equipamento" required /></label>
          <label>Data da retirada<input type="date" value={withdrawalDate} onChange={event => setWithdrawalDate(event.target.value)} required /></label>
          <label>Técnico responsável<input value={data.account.name} readOnly /></label>
          <label>Serviço<input value={service} onChange={event => setService(event.target.value)} placeholder="Ex.: Manutenção" required /></label>
          <label>Categoria<input value={category} onChange={event => setCategory(event.target.value)} placeholder="Ex.: RMA" required /></label>
          <label>Urgência<select value={urgency} onChange={event => setUrgency(event.target.value as RmaUrgency)}><option>Baixa</option><option>Média</option><option>Alta</option></select></label>
          <label className="rma-details">Detalhes do problema<textarea value={details} onChange={event => setDetails(event.target.value)} placeholder="Descreva o defeito, sintomas e demais informações importantes." required /></label>
          <label className={photo ? 'rma-photo-field filled' : 'rma-photo-field'}>
            {photo ? <img src={photo} alt="Foto do equipamento" /> : <Camera size={28} />}
            <b>{photoLoading ? 'Preparando foto...' : photo ? 'Foto adicionada e otimizada' : 'Adicionar foto (opcional)'}</b><small>{photo ? 'Toque para trocar a imagem' : 'Use a câmera ou selecione uma imagem do aparelho'}</small>
            <input type="file" accept="image/*" disabled={photoLoading} onChange={event => void selectPhoto(event)} />
          </label>
          {photoError && <p className="rma-table-warning">{photoError}</p>}
        </div>
        <div className="rma-form-footer"><p><FileText size={17} />Título previsto: <b>RMA: Manutenção - {equipment.trim() || 'equipamento'} - {client.trim() || 'cliente'}</b></p><button className="primary-button" disabled={sending || photoLoading}><Send size={18} />{sending ? 'Registrando...' : 'Registrar solicitação'}</button></div>
      </form>
    </section>
  </>
}

export function DamagedEquipmentPage({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState('')
  const [printChoice, setPrintChoice] = useState<ThermalPrintChoice | null>(null)
  const currentPerson = data.people.find(person => person.id === data.account.id)
  const canReceive = currentPerson?.groups.some(group => ['Administrador', 'RMA', 'Manutenção'].includes(group)) ?? false
  const requests = useMemo(() => [...data.rmaRequests].reverse().filter(item => `${item.movideskTicketId} ${item.localCode} ${item.client} ${item.technicianName} ${item.equipment}`.toLowerCase().includes(query.toLowerCase())), [data.rmaRequests, query])

  useEffect(() => {
    const legacyTickets = data.rmaRequests.filter(item => item.status === 'Enviado ao Movidesk' && /^\d{1,11}$/.test(item.movideskTicketId))
    if (!legacyTickets.length) return
    let active = true
    Promise.all(legacyTickets.map(async item => {
      try {
        const response = await serverApiFetch(`/api/movidesk/tickets/${encodeURIComponent(item.movideskTicketId)}`, { headers: { Accept: 'application/json' } })
        if (!response.ok) return null
        const ticket = await response.json() as { protocol?: string | number }
        const protocol = String(ticket.protocol ?? '').trim()
        return /^\d{12,}$/.test(protocol) ? { id: item.id, protocol } : null
      } catch { return null }
    })).then(resolved => {
      if (!active) return
      const protocols = new Map(resolved.filter((item): item is { id: string; protocol: string } => Boolean(item)).map(item => [item.id, item.protocol]))
      if (!protocols.size) return
      const next: AppData = { ...data, rmaRequests: data.rmaRequests.map(item => protocols.has(item.id) ? { ...item, movideskTicketId: protocols.get(item.id)! } : item) }
      onChange(next, 'Número público do ticket Movidesk atualizado no GIO.')
    })
    return () => { active = false }
  }, [data, onChange])

  const retryMovidesk = async (request: RmaRequest) => {
    setBusyId(request.id)
    try {
      const optimizedPhoto = request.photo ? await optimizeImage(request.photo) : ''
      let updated: RmaRequest
      let message: string
      if (request.movideskTicketId && request.movideskInternalId && request.movideskActionId && optimizedPhoto) {
        const response = await serverApiFetch('/api/movidesk/rma/photo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            internalId: request.movideskInternalId, actionId: request.movideskActionId,
            localCode: request.localCode, photo: optimizedPhoto,
          }),
        })
        const result = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) throw new Error(result.error || `Falha ${response.status}`)
        updated = { ...request, photo: optimizedPhoto, integrationError: undefined, photoSentToMovideskAt: new Date().toISOString() }
        message = `Foto anexada ao ticket ${request.movideskTicketId} com sucesso.`
      } else {
        const pending = { ...request, photo: optimizedPhoto }
        const { result, ticketId, photo } = await sendRmaToMovidesk(pending)
        updated = withMovideskResult(pending, ticketId, result, photo)
        message = updated.integrationError ? `Ticket ${ticketId} criado, mas a foto ainda está pendente.` : `Ticket ${ticketId} criado no Movidesk com a foto.`
      }
      const next: AppData = { ...data, rmaRequests: data.rmaRequests.map(item => item.id === request.id ? updated : item) }
      onChange(next, message)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Falha desconhecida.'
      const failed: RmaRequest = { ...request, integrationError: `Não foi possível enviar: ${detail}` }
      const next: AppData = { ...data, rmaRequests: data.rmaRequests.map(item => item.id === request.id ? failed : item) }
      onChange(next, `${request.localCode} continua salvo no GIO. Tente novamente em instantes.`)
    } finally {
      setBusyId('')
    }
  }

  const print = async (request: RmaRequest, receiving: boolean, variant: ThermalReceiptVariant) => {
    if (receiving && !window.confirm(`Confirmar o recebimento de ${request.equipment}? Esta ação não poderá ser desfeita.`)) return
    setPrintChoice(null)
    const preview = window.open('', '_blank')
    setBusyId(request.id)
    let savedData: AppData | null = null
    try {
      const now = new Date().toISOString()
      const updated: RmaRequest = receiving ? {
        ...request, status: 'Pedido recebido', receivedAt: now, receivedBy: data.account.name,
        printCount: request.printCount + 1, lastPrintedAt: now,
      } : { ...request, printCount: request.printCount + 1, lastPrintedAt: now }
      const next: AppData = { ...data, rmaRequests: data.rmaRequests.map(item => item.id === request.id ? updated : item) }
      savedData = next
      const version = variant === 'full' ? 'completa' : 'resumida'
      onChange(next, receiving ? `Recebimento confirmado no GIO. A versão ${version} foi aberta.` : `Versão ${version} aberta para reimpressão.`)
      await openThermalReceipt(updated, preview, variant)
    } catch {
      preview?.close()
      onChange(savedData ?? data, 'O recebimento foi mantido no GIO, mas não foi possível abrir o PDF. Use Reimprimir para tentar novamente.')
    } finally {
      setBusyId('')
    }
  }

  const received = data.rmaRequests.filter(item => item.status === 'Pedido recebido').length
  return <>
    <section className="page-intro"><div><p className="eyebrow">Manutenção</p><h2>Equipamentos danificados</h2><p>Acompanhe os chamados de RMA e confirme o recebimento físico dos equipamentos.</p></div></section>
    <section className="attention-grid rma-summary"><article className="metric-card"><span><Wrench size={21} /></span><div><b>{data.rmaRequests.length}</b><small>Equipamentos registrados</small></div></article><article className="metric-card"><span><PackageCheck size={21} /></span><div><b>{received}</b><small>Recebimentos confirmados</small></div></article><article className="metric-card"><span><Printer size={21} /></span><div><b>80 mm</b><small>Padrão de impressão térmica</small></div></article></section>
    <section className="surface table-surface damaged-equipment-table">
      <div className="table-toolbar"><div><p className="eyebrow">Controle de recebimento</p><h3>Tickets de equipamentos danificados</h3></div><label className="search-field"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar ticket ou equipamento" /></label></div>
      <div className="responsive-table"><table><thead><tr><th>Ticket Movidesk</th><th>Cliente</th><th>Técnico</th><th>Equipamento</th><th>Data da retirada</th><th>Status</th><th>Ação</th></tr></thead><tbody>{requests.length ? requests.map(item => <tr key={item.id}>
        <td><b>{item.movideskTicketId || 'Aguardando'}</b><small className="table-subtitle">{item.localCode}</small></td><td>{item.client}</td><td>{item.technicianName}</td><td><b>{item.equipment}</b></td><td>{new Date(`${item.withdrawalDate}T12:00:00`).toLocaleDateString('pt-BR')}</td><td><span className={`status ${item.status === 'Pedido recebido' ? 'success' : item.status === 'Enviado ao Movidesk' ? 'warning' : 'neutral'}`}>{item.status}</span>{item.integrationError && <small className="rma-table-warning">{item.movideskTicketId ? 'Foto pendente' : 'Envio pendente'}</small>}</td><td>{item.status === 'Pedido recebido' ? <button className="secondary-button compact" disabled={busyId === item.id} onClick={() => setPrintChoice({ request: item, receiving: false })}><RotateCcw size={15} /> Reimprimir</button> : item.status === 'Aguardando integração Movidesk' || (item.integrationError && item.movideskInternalId && item.movideskActionId) ? <button className="primary-button compact" disabled={busyId === item.id} onClick={() => void retryMovidesk(item)}><Send size={15} /> {item.movideskTicketId ? 'Reenviar foto' : 'Reenviar ao Movidesk'}</button> : canReceive ? <button className="primary-button compact" disabled={busyId === item.id} onClick={() => setPrintChoice({ request: item, receiving: true })}><PackageCheck size={15} /> Confirmar recebimento</button> : <span className="table-muted">Aguardando RMA</span>}</td>
      </tr>) : <tr><td colSpan={7} className="table-empty">Nenhum equipamento danificado foi registrado.</td></tr>}</tbody></table></div>
    </section>
    <section className="surface rma-print-note"><Printer size={21} /><div><b>Comprovante térmico de 80 mm</b><p>Escolha entre a versão completa, com todos os dados e espaço para anotações, ou a versão resumida com logo, ticket, data, técnico e equipamento.</p></div><ChevronRight size={19} /></section>
    {printChoice && <div className="modal-layer thermal-choice-layer">
      <button className="modal-backdrop" aria-label="Fechar escolha de impressão" onClick={() => setPrintChoice(null)} />
      <section className="quick-modal thermal-choice-modal" role="dialog" aria-modal="true" aria-labelledby="thermal-choice-title">
        <div className="modal-heading"><div><p className="eyebrow">Impressora térmica · 80 mm</p><h2 id="thermal-choice-title">Escolha a versão</h2></div></div>
        <p className="thermal-choice-intro">Ticket <b>{printChoice.request.movideskTicketId || printChoice.request.localCode}</b> · {printChoice.request.equipment}</p>
        <div className="thermal-choice-grid">
          <button type="button" className="thermal-choice-card" disabled={busyId === printChoice.request.id} onClick={() => void print(printChoice.request, printChoice.receiving, 'full')}>
            <span><FileText size={23} /></span><b>Versão completa</b><small>Logo, cliente, código, ticket, data, técnico, equipamento, descrição e espaço para anotações.</small>
          </button>
          <button type="button" className="thermal-choice-card summary" disabled={busyId === printChoice.request.id} onClick={() => void print(printChoice.request, printChoice.receiving, 'summary')}>
            <span><Printer size={23} /></span><b>Versão resumida</b><small>Logo, ticket, data, técnico e equipamento para identificação rápida.</small>
          </button>
        </div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPrintChoice(null)}>Cancelar</button></div>
      </section>
    </div>}
  </>
}

async function openThermalReceipt(request: RmaRequest, preview: Window | null, variant: ThermalReceiptVariant) {
  let logo = ''
  try { logo = await fetch(publicAsset('alert-logo.png')).then(response => response.blob()).then(blobToDataUrl) } catch { /* O comprovante continua identificável pelo texto. */ }
  const pageWidth = 80
  const safeLeft = 7
  const safeRight = 7
  const contentWidth = pageWidth - safeLeft - safeRight
  const contentCenter = safeLeft + contentWidth / 2
  const printedDate = new Date(`${request.withdrawalDate}T12:00:00`).toLocaleDateString('pt-BR')
  const ticket = request.movideskTicketId || `${request.localCode} - aguardando Movidesk`
  const fields = variant === 'summary'
    ? [['Ticket', ticket], ['Data', printedDate], ['Técnico', request.technicianName], ['Equipamento', request.equipment]]
    : [['Cliente', request.client], ['Código GIO', request.localCode], ['Ticket', ticket], ['Data', printedDate], ['Técnico', request.technicianName], ['Equipamento', request.equipment], ['Descrição', request.details]]
  const measuring = new jsPDF({ unit: 'mm', format: [pageWidth, 180] })
  measuring.setFont('helvetica', 'normal'); measuring.setFontSize(8)
  const preparedFields = fields.map(([label, value]) => ({ label, lines: measuring.splitTextToSize(value || '—', contentWidth) as string[] }))
  const labelHeight = 3.2
  const lineHeight = 3.4
  const valueHeight = (lines: string[]) => Math.max(4.8, lines.length * lineHeight + 1)
  const fieldsHeight = preparedFields.reduce((total, field) => total + labelHeight + valueHeight(field.lines), 0)
  const logoWidth = 28
  const logoHeight = logo ? (() => {
    const properties = measuring.getImageProperties(logo)
    return Math.min(13, logoWidth * properties.height / properties.width)
  })() : 0
  const logoBlockHeight = logo ? logoHeight + 3 : 0
  const pageHeight = variant === 'summary'
    ? Math.max(82, 6 + logoBlockHeight + fieldsHeight + 6)
    : Math.max(125, 6 + logoBlockHeight + 9 + fieldsHeight + 49)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageWidth, pageHeight] })
  let y = 6
  if (logo) {
    pdf.addImage(logo, logo.startsWith('data:image/png') ? 'PNG' : 'JPEG', contentCenter - logoWidth / 2, y, logoWidth, logoHeight)
    y += logoHeight + 3
  }
  if (variant === 'full') {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(25, 25, 25); pdf.text('EQUIPAMENTO DANIFICADO', contentCenter, y, { align: 'center' }); y += 4.5
    pdf.setDrawColor(25, 25, 25); pdf.setLineWidth(.35); pdf.line(safeLeft, y, pageWidth - safeRight, y); y += 4.5
  }

  const field = (label: string, lines: string[]) => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); pdf.setTextColor(25, 25, 25); pdf.text(label.toUpperCase(), safeLeft, y); y += labelHeight
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8)
    pdf.text(lines, safeLeft, y, { lineHeightFactor: 1.05 }); y += valueHeight(lines)
  }
  preparedFields.forEach(item => field(item.label, item.lines))
  if (variant === 'full') {
    y += 1.5
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.text('ANOTAÇÕES', contentCenter, y, { align: 'center' }); y += 3
    pdf.setDrawColor(35, 35, 35); pdf.setLineWidth(.35); pdf.roundedRect(safeLeft, y, contentWidth, 32, 2, 2)
    y += 36
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); pdf.setTextColor(90, 90, 90)
    pdf.text(`GIO · ${request.localCode} · impresso em ${new Date().toLocaleString('pt-BR')}`, contentCenter, y, { align: 'center', maxWidth: contentWidth })
  }

  const blobUrl = URL.createObjectURL(pdf.output('blob'))
  if (preview && !preview.closed) preview.location.href = blobUrl
  else {
    const link = document.createElement('a')
    link.href = blobUrl; link.download = `RMA-${request.movideskTicketId || request.localCode}-${variant === 'full' ? 'completo' : 'resumido'}-80mm.pdf`; link.click()
  }
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120000)
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob)
  })
}
