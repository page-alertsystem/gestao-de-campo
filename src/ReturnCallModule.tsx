import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, ImagePlus, MessageSquareReply, RefreshCw, Send } from 'lucide-react'
import { serverApiFetch } from './serverApi'
import type { AppData, ReturnCallRequest } from './store'

type CategoryOption = {
  name: string
  serviceFirstLevelId?: number
  serviceName?: string
  defaultUrgency?: string
}

type Catalog = { categories: CategoryOption[]; urgencies: string[] }
type MovideskResult = {
  ticketId?: string | number
  id?: string | number
  internalId?: string | number
  actionId?: string | number
  status?: string
  photoUploaded?: boolean
  attachmentError?: string
}

const todayInput = () => {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
}

function nextReturnCode(data: AppData) {
  const now = new Date()
  const prefix = `RET${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`
  const sequence = data.returnCallRequests.filter(item => item.localCode.startsWith(prefix)).length + 1
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

function requestPayload(request: ReturnCallRequest, photo = request.photo) {
  return {
    localCode: request.localCode,
    client: request.client,
    urgency: request.urgency,
    category: request.category,
    serviceFirstLevelId: request.serviceFirstLevelId,
    date: request.date,
    description: request.description,
    openedBy: request.openedByName,
    photo,
  }
}

async function sendToMovidesk(request: ReturnCallRequest) {
  const response = await serverApiFetch('/api/movidesk/return', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestPayload(request)),
  })
  const result = await response.json().catch(() => ({})) as MovideskResult & { error?: string; detail?: string }
  if (!response.ok) throw new Error([result.error, result.detail].filter(Boolean).join(' ') || `Falha ${response.status}`)
  const ticketId = String(result.ticketId ?? result.id ?? '').trim()
  if (!ticketId) throw new Error('O Movidesk não devolveu o número do ticket.')
  return { result, ticketId }
}

function withMovideskResult(request: ReturnCallRequest, ticketId: string, result: MovideskResult): ReturnCallRequest {
  const photoUploaded = result.photoUploaded === true
  return {
    ...request,
    movideskTicketId: ticketId,
    movideskInternalId: String(result.internalId ?? '').trim() || request.movideskInternalId,
    movideskActionId: String(result.actionId ?? '').trim() || request.movideskActionId,
    status: String(result.status || '1 - Aberto').trim(),
    photoSentToMovideskAt: photoUploaded ? new Date().toISOString() : request.photoSentToMovideskAt,
    integrationError: photoUploaded ? undefined : (result.attachmentError || 'O chamado foi criado, mas a foto ficou pendente.'),
  }
}

export function ReturnCallPage({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const [catalog, setCatalog] = useState<Catalog>({ categories: [], urgencies: [] })
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [catalogError, setCatalogError] = useState('')
  const [catalogTick, setCatalogTick] = useState(0)
  const [client, setClient] = useState('')
  const [urgency, setUrgency] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(todayInput())
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState('')
  const [photoLoading, setPhotoLoading] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    let active = true
    setCatalogState('loading'); setCatalogError('')
    serverApiFetch('/api/movidesk/return/categories', { headers: { Accept: 'application/json' } })
      .then(async response => {
        const result = await response.json().catch(() => ({})) as Catalog & { error?: string; detail?: string }
        if (!response.ok) throw new Error([result.error, result.detail].filter(Boolean).join(' ') || `Falha ${response.status}`)
        return result
      })
      .then(result => {
        if (!active) return
        setCatalog({ categories: result.categories ?? [], urgencies: result.urgencies ?? [] })
        setCatalogState('ready')
      })
      .catch(reason => {
        if (!active) return
        setCatalogState('error')
        setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar as categorias.')
      })
    return () => { active = false }
  }, [catalogTick])

  const requests = useMemo(() => [...data.returnCallRequests].reverse(), [data.returnCallRequests])
  const reset = () => {
    setClient(''); setUrgency(''); setCategory(''); setDate(todayInput()); setDescription(''); setPhoto(''); setError('')
  }

  const selectCategory = (name: string) => {
    setCategory(name)
    const selected = catalog.categories.find(item => item.name === name)
    if (selected?.defaultUrgency && catalog.urgencies.includes(selected.defaultUrgency)) setUrgency(selected.defaultUrgency)
  }

  const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    setPhotoLoading(true); setError('')
    try {
      const optimized = await readImage(event)
      if (optimized) setPhoto(optimized)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a foto.')
    } finally {
      setPhotoLoading(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!photo) {
      setError('Anexe uma foto antes de abrir o chamado.')
      return
    }
    const selectedCategory = catalog.categories.find(item => item.name === category)
    const request: ReturnCallRequest = {
      id: crypto.randomUUID(), localCode: nextReturnCode(data), movideskTicketId: '', client: client.trim(), urgency,
      category, serviceFirstLevelId: selectedCategory?.serviceFirstLevelId, date, description: description.trim(), photo,
      openedById: data.account.id, openedByName: data.account.name, createdAt: new Date().toISOString(),
      status: 'Aguardando integração Movidesk',
    }
    setSending(true); setError('')
    let nextData: AppData = { ...data, returnCallRequests: [...data.returnCallRequests, request] }
    onChange(nextData, `${request.localCode} salvo. Enviando o chamado interno ao Movidesk...`)
    try {
      const { result, ticketId } = await sendToMovidesk(request)
      const sent = withMovideskResult(request, ticketId, result)
      nextData = { ...nextData, returnCallRequests: nextData.returnCallRequests.map(item => item.id === request.id ? sent : item) }
      onChange(nextData, sent.integrationError ? `Ticket ${ticketId} criado. A foto ficou pendente.` : `Chamado interno ${ticketId} aberto no Movidesk.`)
      reset()
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'Falha desconhecida.'
      const failed = { ...request, integrationError: detail }
      nextData = { ...nextData, returnCallRequests: nextData.returnCallRequests.map(item => item.id === request.id ? failed : item) }
      onChange(nextData, `${request.localCode} ficou salvo, mas o Movidesk recusou o envio.`)
      setError(detail)
    } finally {
      setSending(false)
    }
  }

  const retry = async (request: ReturnCallRequest) => {
    setBusyId(request.id); setError('')
    try {
      let updated: ReturnCallRequest
      let message: string
      if (request.movideskTicketId && request.movideskInternalId && request.movideskActionId) {
        const response = await serverApiFetch('/api/movidesk/tickets/photo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ internalId: request.movideskInternalId, actionId: request.movideskActionId, localCode: request.localCode, photo: await optimizeImage(request.photo) }),
        })
        const result = await response.json().catch(() => ({})) as { error?: string; detail?: string }
        if (!response.ok) throw new Error([result.error, result.detail].filter(Boolean).join(' ') || `Falha ${response.status}`)
        updated = { ...request, integrationError: undefined, photoSentToMovideskAt: new Date().toISOString() }
        message = `Foto anexada ao ticket ${request.movideskTicketId}.`
      } else {
        const pending = { ...request, photo: await optimizeImage(request.photo) }
        const { result, ticketId } = await sendToMovidesk(pending)
        updated = withMovideskResult(pending, ticketId, result)
        message = updated.integrationError ? `Ticket ${ticketId} criado. A foto ficou pendente.` : `Chamado interno ${ticketId} aberto no Movidesk.`
      }
      onChange({ ...data, returnCallRequests: data.returnCallRequests.map(item => item.id === request.id ? updated : item) }, message)
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'Falha desconhecida.'
      setError(detail)
      onChange({ ...data, returnCallRequests: data.returnCallRequests.map(item => item.id === request.id ? { ...item, integrationError: detail } : item) }, `${request.localCode} continua pendente.`)
    } finally {
      setBusyId('')
    }
  }

  return <>
    <section className="page-intro"><div><p className="eyebrow">Operação</p><h2>Chamado de retorno</h2><p>Abra um chamado interno no Movidesk com a categoria oficial, os dados do cliente e a foto do atendimento.</p></div></section>
    <section className="surface rma-form-card">
      <div className="section-heading"><div><p className="eyebrow">Novo chamado interno</p><h3>Informações do retorno</h3></div><span className="rma-heading-icon"><MessageSquareReply size={23} /></span></div>
      <div className={catalogState === 'ready' ? 'rma-integration-state ready' : 'rma-integration-state'}>
        {catalogState === 'ready' ? <CheckCircle2 size={18} /> : catalogState === 'loading' ? <RefreshCw size={18} /> : <AlertTriangle size={18} />}
        <div><b>{catalogState === 'ready' ? 'Categorias carregadas diretamente do Movidesk' : catalogState === 'loading' ? 'Carregando categorias do Movidesk...' : 'Não foi possível carregar as categorias'}</b><small>{catalogState === 'error' ? catalogError : 'O ticket e a primeira ação serão registrados como internos.'}</small></div>
        {catalogState === 'error' && <button type="button" className="secondary-button compact" onClick={() => setCatalogTick(value => value + 1)}>Tentar novamente</button>}
      </div>
      <form className="rma-form" onSubmit={submit}>
        <div className="rma-form-grid">
          <label>Cliente<input value={client} onChange={event => setClient(event.target.value)} placeholder="Digite o nome do cliente" required /></label>
          <label>Data<input type="date" value={date} onChange={event => setDate(event.target.value)} required /></label>
          <label>Solicitante<input value={data.account.name} readOnly /></label>
          <label>Categoria<select value={category} onChange={event => selectCategory(event.target.value)} disabled={catalogState !== 'ready'} required><option value="">Selecione</option>{catalog.categories.map(item => <option key={`${item.serviceFirstLevelId ?? 0}-${item.name}`} value={item.name}>{item.name}</option>)}</select></label>
          <label>Urgência<select value={urgency} onChange={event => setUrgency(event.target.value)} disabled={catalogState !== 'ready'} required><option value="">Selecione</option>{catalog.urgencies.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="rma-details">Descrição<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Descreva o motivo do retorno e todas as informações importantes." required /></label>
          <label className={photo ? 'rma-photo-field filled' : 'rma-photo-field'}>
            {photo ? <img src={photo} alt="Foto do chamado" /> : <ImagePlus size={28} />}
            <b>{photoLoading ? 'Preparando foto...' : photo ? 'Foto adicionada' : 'Anexar foto'}</b>
            <small>{photo ? 'Toque para trocar a imagem' : 'Abra a câmera ou selecione uma imagem'}</small>
            <input type="file" accept="image/*" capture="environment" disabled={photoLoading} onChange={event => void selectPhoto(event)} required={!photo} />
          </label>
        </div>
        {error && <p className="form-error"><AlertTriangle size={16} />{error}</p>}
        <div className="rma-form-footer"><p><CalendarDays size={17} />Título previsto: <b>Chamado de retorno: {client.trim() || 'CLIENTE'}</b></p><button className="primary-button" disabled={sending || photoLoading || catalogState !== 'ready'}><Send size={18} />{sending ? 'Abrindo chamado...' : 'Abrir chamado interno'}</button></div>
      </form>
    </section>

    <section className="surface table-surface damaged-equipment-table">
      <div className="table-toolbar"><div><p className="eyebrow">Histórico</p><h3>Chamados de retorno</h3></div><small className="table-muted">Registros criados pelo GIO</small></div>
      <div className="responsive-table"><table><thead><tr><th>Ticket Movidesk</th><th>Cliente</th><th>Data</th><th>Categoria</th><th>Urgência</th><th>Solicitante</th><th>Status</th><th>Ação</th></tr></thead><tbody>{requests.length ? requests.map(item => <tr key={item.id}>
        <td><b>{item.movideskTicketId || 'Aguardando'}</b><small className="table-subtitle">{item.localCode}</small></td><td>{item.client}</td><td>{formatDate(item.date)}</td><td>{item.category}</td><td>{item.urgency}</td><td>{item.openedByName}</td>
        <td><span className={`status ${item.integrationError ? 'warning' : 'success'}`}>{item.integrationError ? (item.movideskTicketId ? 'Foto pendente' : 'Envio pendente') : item.status}</span>{item.integrationError && <small className="rma-table-warning">{item.integrationError}</small>}</td>
        <td>{item.integrationError ? <button className="primary-button compact" disabled={busyId === item.id} onClick={() => void retry(item)}><RefreshCw size={15} />{busyId === item.id ? 'Enviando...' : item.movideskTicketId ? 'Reenviar foto' : 'Reenviar'}</button> : <span className="table-muted">Concluído</span>}</td>
      </tr>) : <tr><td colSpan={8} className="table-empty">Nenhum chamado de retorno registrado.</td></tr>}</tbody></table></div>
    </section>
  </>
}
