import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Camera, CheckCircle2, ChevronRight, FileText, PackageCheck, Printer, RotateCcw, Search, Send, Wrench } from 'lucide-react'
import { jsPDF } from 'jspdf'
import type { AppData, RmaRequest, RmaUrgency } from './store'

const todayInput = () => new Date().toISOString().slice(0, 10)
const movideskEndpoint = String(import.meta.env.VITE_MOVIEDESK_RMA_ENDPOINT ?? '/api/movidesk/rma').trim()
const serverHealthEndpoint = String(import.meta.env.VITE_GIO_HEALTH_ENDPOINT ?? '/api/health').trim()
type IntegrationState = 'checking' | 'ready' | 'server-pending' | 'unavailable'

function readImage(event: ChangeEvent<HTMLInputElement>, onReady: (value: string) => void) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => onReady(String(reader.result))
  reader.readAsDataURL(file)
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
  const [urgency, setUrgency] = useState<RmaUrgency>('Normal')
  const [details, setDetails] = useState('')
  const [photo, setPhoto] = useState('')
  const [sending, setSending] = useState(false)
  const [integrationState, setIntegrationState] = useState<IntegrationState>('checking')

  useEffect(() => {
    let active = true
    fetch(serverHealthEndpoint, { headers: { Accept: 'application/json' } })
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
    setCategory('RMA'); setUrgency('Normal'); setDetails(''); setPhoto('')
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
        const response = await fetch(movideskEndpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            localCode, title, client: request.client, equipment: request.equipment, withdrawalDate, technician: request.technicianName,
            service: request.service, category: request.category, urgency, details: request.details, photo: request.photo,
          }),
        })
        if (!response.ok) throw new Error(`Falha ${response.status}`)
        const result = await response.json() as { id?: string | number; ticketId?: string | number }
        const ticketId = String(result.ticketId ?? result.id ?? '').trim()
        if (!ticketId) throw new Error('Número do ticket não retornado')
        const sent: RmaRequest = { ...request, movideskTicketId: ticketId, status: 'Enviado ao Movidesk', sentToMovideskAt: new Date().toISOString() }
        nextData = { ...nextData, rmaRequests: nextData.rmaRequests.map(item => item.id === sent.id ? sent : item) }
        onChange(nextData, `Ticket ${ticketId} criado no Movidesk com sucesso.`)
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
          <label>Urgência<select value={urgency} onChange={event => setUrgency(event.target.value as RmaUrgency)}><option>Baixa</option><option>Normal</option><option>Alta</option><option>Urgente</option></select></label>
          <label className="rma-details">Detalhes do problema<textarea value={details} onChange={event => setDetails(event.target.value)} placeholder="Descreva o defeito, sintomas e demais informações importantes." required /></label>
          <label className={photo ? 'rma-photo-field filled' : 'rma-photo-field'}>
            {photo ? <img src={photo} alt="Foto do equipamento" /> : <Camera size={28} />}
            <b>{photo ? 'Foto adicionada' : 'Adicionar foto (opcional)'}</b><small>{photo ? 'Toque para trocar a imagem' : 'Use a câmera ou selecione uma imagem do aparelho'}</small>
            <input type="file" accept="image/*" onChange={event => readImage(event, setPhoto)} />
          </label>
        </div>
        <div className="rma-form-footer"><p><FileText size={17} />Título previsto: <b>RMA: Manutenção - {equipment.trim() || 'equipamento'} - {client.trim() || 'cliente'}</b></p><button className="primary-button" disabled={sending}><Send size={18} />{sending ? 'Registrando...' : 'Registrar solicitação'}</button></div>
      </form>
    </section>
  </>
}

export function DamagedEquipmentPage({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState('')
  const currentPerson = data.people.find(person => person.id === data.account.id)
  const canReceive = currentPerson?.groups.some(group => ['Administrador', 'RMA', 'Manutenção'].includes(group)) ?? false
  const requests = useMemo(() => [...data.rmaRequests].reverse().filter(item => `${item.movideskTicketId} ${item.localCode} ${item.client} ${item.technicianName} ${item.equipment}`.toLowerCase().includes(query.toLowerCase())), [data.rmaRequests, query])

  const print = async (request: RmaRequest, receiving: boolean) => {
    if (receiving && !window.confirm(`Confirmar o recebimento de ${request.equipment}? Esta ação não poderá ser desfeita.`)) return
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
      onChange(next, receiving ? 'Recebimento confirmado no GIO. O comprovante térmico foi aberto.' : 'Comprovante aberto para reimpressão.')
      await openThermalReceipt(updated, preview)
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
        <td><b>{item.movideskTicketId || 'Aguardando'}</b><small className="table-subtitle">{item.localCode}</small></td><td>{item.client}</td><td>{item.technicianName}</td><td><b>{item.equipment}</b></td><td>{new Date(`${item.withdrawalDate}T12:00:00`).toLocaleDateString('pt-BR')}</td><td><span className={`status ${item.status === 'Pedido recebido' ? 'success' : item.status === 'Enviado ao Movidesk' ? 'warning' : 'neutral'}`}>{item.status}</span>{item.integrationError && <small className="rma-table-warning">Envio pendente</small>}</td><td>{item.status === 'Pedido recebido' ? <button className="secondary-button compact" disabled={busyId === item.id} onClick={() => void print(item, false)}><RotateCcw size={15} /> Reimprimir</button> : canReceive ? <button className="primary-button compact" disabled={busyId === item.id} onClick={() => void print(item, true)}><PackageCheck size={15} /> Confirmar recebimento</button> : <span className="table-muted">Aguardando RMA</span>}</td>
      </tr>) : <tr><td colSpan={7} className="table-empty">Nenhum equipamento danificado foi registrado.</td></tr>}</tbody></table></div>
    </section>
    <section className="surface rma-print-note"><Printer size={21} /><div><b>Comprovante térmico de 80 mm</b><p>Ao confirmar, o status muda somente no GIO e o PDF é aberto. Depois disso, a única ação disponível será reimprimir.</p></div><ChevronRight size={19} /></section>
  </>
}

async function openThermalReceipt(request: RmaRequest, preview: Window | null) {
  let logo = ''
  try { logo = await fetch('/alert-logo.png').then(response => response.blob()).then(blobToDataUrl) } catch { /* O comprovante continua identificável pelo texto. */ }
  const measuring = new jsPDF({ unit: 'mm', format: [80, 180] })
  const descriptionLines = measuring.splitTextToSize(request.details, 68) as string[]
  const pageHeight = Math.max(156, 102 + descriptionLines.length * 4 + 52)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, pageHeight] })
  let y = 5
  if (logo) {
    const properties = pdf.getImageProperties(logo)
    const width = 30
    const height = Math.min(15, width * properties.height / properties.width)
    pdf.addImage(logo, logo.startsWith('data:image/png') ? 'PNG' : 'JPEG', (80 - width) / 2, y, width, height)
    y += height + 5
  }
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(25, 25, 25); pdf.text('EQUIPAMENTO DANIFICADO', 40, y, { align: 'center' }); y += 5
  pdf.setDrawColor(25, 25, 25); pdf.setLineWidth(.35); pdf.line(5, y, 75, y); y += 6

  const field = (label: string, value: string) => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.text(label.toUpperCase(), 6, y); y += 4
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
    const lines = pdf.splitTextToSize(value || '—', 68) as string[]
    pdf.text(lines, 6, y); y += Math.max(6, lines.length * 4 + 2)
  }
  field('Cliente', request.client)
  field('Ticket', request.movideskTicketId || `${request.localCode} - aguardando Movidesk`)
  field('Data', new Date(`${request.withdrawalDate}T12:00:00`).toLocaleDateString('pt-BR'))
  field('Equipamento', request.equipment)
  field('Descrição', request.details)
  y += 2
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('ANOTAÇÕES', 40, y, { align: 'center' }); y += 3
  pdf.setDrawColor(35, 35, 35); pdf.setLineWidth(.35); pdf.roundedRect(6, y, 68, 46, 2, 2)
  y += 51
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6); pdf.setTextColor(90, 90, 90)
  pdf.text(`GIO · ${request.localCode} · impresso em ${new Date().toLocaleString('pt-BR')}`, 40, y, { align: 'center' })

  const blobUrl = URL.createObjectURL(pdf.output('blob'))
  if (preview && !preview.closed) preview.location.href = blobUrl
  else {
    const link = document.createElement('a')
    link.href = blobUrl; link.download = `RMA-${request.movideskTicketId || request.localCode}-80mm.pdf`; link.click()
  }
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120000)
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob)
  })
}
