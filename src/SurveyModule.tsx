import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, FileText, ImagePlus, RotateCcw, Send } from 'lucide-react'
import type { AppData, SurveyRequest } from './store'
import { serverApiFetch } from './serverApi'

const surveyEndpoint = String(import.meta.env.VITE_MOVIEDESK_SURVEY_ENDPOINT ?? '/api/movidesk/survey').trim()
const serverHealthEndpoint = String(import.meta.env.VITE_GIO_HEALTH_ENDPOINT ?? '/api/health').trim()
type IntegrationState = 'checking' | 'ready' | 'server-pending' | 'unavailable'
type MovideskSurveyResult = {
  id?: string | number
  ticketId?: string | number
  internalId?: string | number
  actionId?: string | number
  status?: string
  photoUploaded?: boolean
  attachmentError?: string
}

const todayInput = () => new Date().toISOString().slice(0, 10)

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
}

function nextSurveyCode(data: AppData) {
  const now = new Date()
  const prefix = `LEV${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`
  const sequence = data.surveyRequests.filter(item => item.localCode.startsWith(prefix)).length + 1
  return `${prefix}${String(sequence).padStart(4, '0')}`
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

async function readImage(event: ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return ''
  if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.')
  return optimizeImage(file)
}

function surveyPayload(request: SurveyRequest, photo = request.photo) {
  return {
    localCode: request.localCode,
    title: `Levantamento: ${request.client} ${request.area}`,
    client: request.client,
    startDate: request.startDate,
    endDate: request.endDate,
    area: request.area,
    details: request.details,
    requestedBy: request.requestedByName,
    photo,
  }
}

async function sendSurveyToMovidesk(request: SurveyRequest) {
  const response = await serverApiFetch(surveyEndpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(surveyPayload(request)),
  })
  const result = await response.json().catch(() => ({})) as MovideskSurveyResult & { error?: string }
  if (!response.ok) throw new Error(result.error || `Falha ${response.status}`)
  const ticketId = String(result.ticketId ?? result.id ?? '').trim()
  if (!ticketId) throw new Error('O Movidesk não devolveu o número do ticket.')
  return { result, ticketId }
}

function withMovideskResult(request: SurveyRequest, ticketId: string, result: MovideskSurveyResult): SurveyRequest {
  const photoUploaded = !request.photo || result.photoUploaded === true
  const now = new Date().toISOString()
  return {
    ...request,
    movideskTicketId: ticketId,
    movideskInternalId: String(result.internalId ?? '').trim() || request.movideskInternalId,
    movideskActionId: String(result.actionId ?? '').trim() || request.movideskActionId,
    status: String(result.status || '1 - Aberto').trim(),
    sentToMovideskAt: request.sentToMovideskAt ?? now,
    photoSentToMovideskAt: photoUploaded && request.photo ? now : request.photoSentToMovideskAt,
    lastStatusCheckAt: now,
    integrationError: photoUploaded ? undefined : (result.attachmentError || 'O ticket foi criado, mas a foto ficou pendente.'),
  }
}

export function latestSurveySyncTime(now = new Date()) {
  const latest = new Date(now)
  latest.setHours(now.getHours() < 12 ? 0 : 12, 0, 0, 0)
  return latest
}

export function nextSurveySyncTime(now = new Date()) {
  const next = new Date(now)
  if (now.getHours() < 12) next.setHours(12, 0, 0, 0)
  else {
    next.setDate(next.getDate() + 1)
    next.setHours(0, 0, 0, 0)
  }
  return next
}

export function surveyNeedsStatusSync(request: SurveyRequest, now = new Date()) {
  if (request.resolved || !request.movideskTicketId) return false
  const checkedAt = request.lastStatusCheckAt ? new Date(request.lastStatusCheckAt) : null
  return !checkedAt || Number.isNaN(checkedAt.getTime()) || checkedAt < latestSurveySyncTime(now)
}

export async function fetchSurveyStatus(request: SurveyRequest) {
  const response = await serverApiFetch(`/api/movidesk/tickets/${encodeURIComponent(request.movideskTicketId)}`, { headers: { Accept: 'application/json' } })
  const result = await response.json().catch(() => ({})) as { status?: string; resolved?: boolean; error?: string }
  if (!response.ok) throw new Error(result.error || `Falha ${response.status}`)
  return {
    status: result.resolved ? 'Resolvido' : String(result.status || request.status).trim(),
    resolved: result.resolved === true,
    checkedAt: new Date().toISOString(),
  }
}

export function SurveyPage({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const [client, setClient] = useState('')
  const [startDate, setStartDate] = useState(todayInput())
  const [endDate, setEndDate] = useState(todayInput())
  const [area, setArea] = useState('')
  const [details, setDetails] = useState('')
  const [photo, setPhoto] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [photoLoading, setPhotoLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [busyId, setBusyId] = useState('')
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

  const requests = useMemo(() => [...data.surveyRequests].reverse(), [data.surveyRequests])
  const reset = () => {
    setClient(''); setStartDate(todayInput()); setEndDate(todayInput()); setArea(''); setDetails(''); setPhoto(''); setPhotoError('')
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
    if (endDate < startDate) {
      setPhotoError('A data final não pode ser anterior à data inicial.')
      return
    }
    setSending(true)
    const request: SurveyRequest = {
      id: crypto.randomUUID(), localCode: nextSurveyCode(data), movideskTicketId: '', client: client.trim(), startDate, endDate,
      area: area.trim(), details: details.trim(), photo, requestedById: data.account.id, requestedByName: data.account.name,
      createdAt: new Date().toISOString(), status: 'Aguardando integração Movidesk', resolved: false,
    }
    let nextData: AppData = { ...data, surveyRequests: [...data.surveyRequests, request] }
    const integrationReady = integrationState === 'ready'
    onChange(nextData, integrationReady ? `${request.localCode} salvo. Enviando ao Movidesk...` : `${request.localCode} salvo e aguardando integração com o Movidesk.`)
    if (integrationReady) {
      try {
        const { result, ticketId } = await sendSurveyToMovidesk(request)
        const sent = withMovideskResult(request, ticketId, result)
        nextData = { ...nextData, surveyRequests: nextData.surveyRequests.map(item => item.id === request.id ? sent : item) }
        onChange(nextData, sent.integrationError ? `Ticket ${ticketId} criado. A foto ficou pendente.` : `Levantamento enviado no ticket ${ticketId}.`)
      } catch {
        const failed = { ...request, integrationError: 'Não foi possível enviar agora. A solicitação permanece salva no GIO.' }
        nextData = { ...nextData, surveyRequests: nextData.surveyRequests.map(item => item.id === request.id ? failed : item) }
        onChange(nextData, `${request.localCode} ficou pendente de envio ao Movidesk.`)
      }
    }
    reset(); setSending(false)
  }

  const retry = async (request: SurveyRequest) => {
    setBusyId(request.id)
    try {
      let updated: SurveyRequest
      let message: string
      if (request.movideskTicketId && request.movideskInternalId && request.movideskActionId && request.photo) {
        const optimizedPhoto = await optimizeImage(request.photo)
        const response = await serverApiFetch('/api/movidesk/tickets/photo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ internalId: request.movideskInternalId, actionId: request.movideskActionId, localCode: request.localCode, photo: optimizedPhoto }),
        })
        const result = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) throw new Error(result.error || `Falha ${response.status}`)
        updated = { ...request, photo: optimizedPhoto, integrationError: undefined, photoSentToMovideskAt: new Date().toISOString() }
        message = `Foto anexada ao ticket ${request.movideskTicketId}.`
      } else {
        const pending = { ...request, photo: request.photo ? await optimizeImage(request.photo) : '' }
        const { result, ticketId } = await sendSurveyToMovidesk(pending)
        updated = withMovideskResult(pending, ticketId, result)
        message = updated.integrationError ? `Ticket ${ticketId} criado, mas a foto ainda está pendente.` : `Levantamento enviado no ticket ${ticketId}.`
      }
      onChange({ ...data, surveyRequests: data.surveyRequests.map(item => item.id === request.id ? updated : item) }, message)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Falha desconhecida.'
      const failed = { ...request, integrationError: `Não foi possível enviar: ${detail}` }
      onChange({ ...data, surveyRequests: data.surveyRequests.map(item => item.id === request.id ? failed : item) }, `${request.localCode} continua salvo no GIO.`)
    } finally {
      setBusyId('')
    }
  }

  return <>
    <section className="page-intro"><div><p className="eyebrow">Gestão</p><h2>Levantamento</h2><p>Solicite o levantamento de uma área, defina o período e acompanhe o andamento pelo status do Movidesk.</p></div></section>
    <section className="surface rma-form-card">
      <div className="section-heading"><div><p className="eyebrow">Solicitar levantamento</p><h3>Informações da atividade</h3></div><span className="rma-heading-icon"><CalendarDays size={23} /></span></div>
      <div className={integrationState === 'ready' ? 'rma-integration-state ready' : 'rma-integration-state'}>
        {integrationState === 'ready' ? <CheckCircle2 size={18} /> : integrationState === 'checking' ? <RotateCcw size={18} /> : <AlertTriangle size={18} />}
        <div><b>{integrationState === 'ready' ? 'Movidesk pronto para receber a solicitação' : integrationState === 'checking' ? 'Verificando a integração...' : 'A solicitação será salva e ficará aguardando envio'}</b><small>O status será conferido automaticamente à meia-noite e ao meio-dia.</small></div>
      </div>
      <form className="rma-form" onSubmit={submit}>
        <div className="rma-form-grid">
          <label>Cliente<input value={client} onChange={event => setClient(event.target.value)} placeholder="Digite o nome do cliente" required /></label>
          <label>Data inicial<input type="date" value={startDate} onChange={event => { setStartDate(event.target.value); if (endDate < event.target.value) setEndDate(event.target.value) }} required /></label>
          <label>Data final<input type="date" min={startDate} value={endDate} onChange={event => setEndDate(event.target.value)} required /></label>
          <label>Área do levantamento<input value={area} onChange={event => setArea(event.target.value)} placeholder="Ex.: Rede, elétrica, infraestrutura" required /></label>
          <label>Solicitante<input value={data.account.name} readOnly /></label>
          <label className="rma-details">Detalhes da atividade<textarea value={details} onChange={event => setDetails(event.target.value)} placeholder="Descreva o que precisa ser levantado e as informações importantes para a equipe." required /></label>
          <label className={photo ? 'rma-photo-field filled' : 'rma-photo-field'}>
            {photo ? <img src={photo} alt="Foto do levantamento" /> : <ImagePlus size={28} />}
            <b>{photoLoading ? 'Preparando foto...' : photo ? 'Foto adicionada e otimizada' : 'Adicionar foto (opcional)'}</b>
            <small>{photo ? 'Toque para trocar a imagem' : 'Use a câmera ou selecione uma imagem do aparelho'}</small>
            <input type="file" accept="image/*" disabled={photoLoading} onChange={event => void selectPhoto(event)} />
          </label>
          {photoError && <p className="rma-table-warning">{photoError}</p>}
        </div>
        <div className="rma-form-footer"><p><FileText size={17} />Título previsto: <b>Levantamento: {client.trim() || 'CLIENTE'} {area.trim() || 'ÁREA'}</b></p><button className="primary-button" disabled={sending || photoLoading}><Send size={18} />{sending ? 'Enviando...' : 'Solicitar levantamento'}</button></div>
      </form>
    </section>

    <section className="surface table-surface damaged-equipment-table">
      <div className="table-toolbar"><div><p className="eyebrow">Acompanhamento</p><h3>Solicitações de levantamento</h3></div><small className="table-muted">Atualização automática: 00h e 12h</small></div>
      <div className="responsive-table"><table><thead><tr><th>Ticket Movidesk</th><th>Cliente</th><th>Solicitante</th><th>Área</th><th>Período</th><th>Status</th><th>Ação</th></tr></thead><tbody>{requests.length ? requests.map(item => <tr key={item.id}>
        <td><b>{item.movideskTicketId || 'Aguardando'}</b><small className="table-subtitle">{item.localCode}</small></td>
        <td>{item.client}</td><td>{item.requestedByName}</td><td><b>{item.area}</b></td><td>{formatDate(item.startDate)} a {formatDate(item.endDate)}</td>
        <td><span className={`status ${item.resolved ? 'success' : item.integrationError ? 'warning' : 'neutral'}`}>{item.status}</span>{item.integrationError && <small className="rma-table-warning">{item.movideskTicketId ? 'Foto pendente' : 'Envio pendente'}</small>}</td>
        <td>{item.resolved ? <span className="table-muted">Finalizado</span> : item.status === 'Aguardando integração Movidesk' || (item.integrationError && item.movideskInternalId && item.movideskActionId) ? <button className="primary-button compact" disabled={busyId === item.id} onClick={() => void retry(item)}><Send size={15} />{item.movideskTicketId ? 'Reenviar foto' : 'Reenviar'}</button> : <span className="table-muted">Acompanhamento automático</span>}</td>
      </tr>) : <tr><td colSpan={7} className="table-empty">Nenhuma solicitação de levantamento registrada.</td></tr>}</tbody></table></div>
    </section>
  </>
}
