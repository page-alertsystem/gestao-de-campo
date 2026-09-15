import { FormEvent, PointerEvent as ReactPointerEvent, useRef, useState } from 'react'
import { AlertTriangle, Camera, CheckCircle2, ChevronRight, Download, FileCheck2, PenLine, Plus, Trash2, UserPlus, Users, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import type { AppData, AprRecord } from './store'
import { publicAsset } from './paths'

type AprPhoto = { id: string; name: string; data: string }
type AprSheet = { id: string; front?: AprPhoto; back?: AprPhoto }

const newAprSheet = (): AprSheet => ({ id: crypto.randomUUID() })

function localDateInput(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function nowTimeInput() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function downloadPdf(record: AprRecord) {
  if (!record.pdfData) return
  const link = document.createElement('a')
  link.href = record.pdfData
  link.download = record.pdfFileName
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function AprApprovedPage({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const [formOpen, setFormOpen] = useState(false)
  const [completed, setCompleted] = useState<AprRecord | null>(null)
  const recent = [...data.aprRecords].sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, 5)

  const complete = (record: AprRecord) => {
    onChange({ ...data, aprRecords: [...data.aprRecords, record] }, 'APR aprovada registrada e salva em Documentos.')
    setFormOpen(false)
    setCompleted(record)
  }

  return <>
    <section className="page-intro"><div><p className="eyebrow">Operação</p><h2>APR Aprovada</h2><p>Registre a liberação da atividade, as imagens da APR e a assinatura do técnico responsável.</p></div><button className="primary-button" onClick={() => setFormOpen(true)}><Plus size={18} /> Adicionar APR</button></section>
    <section className="document-summary-grid apr-summary-grid">
      <article className="metric-card"><span><FileCheck2 size={21} /></span><div><b>{data.aprRecords.length}</b><small>APRs registradas</small></div></article>
      <article className="metric-card"><span><Users size={21} /></span><div><b>{new Set(data.aprRecords.flatMap(record => record.technicians)).size}</b><small>Técnicos envolvidos</small></div></article>
      <article className="metric-card"><span><Camera size={21} /></span><div><b>{data.aprRecords.reduce((total, record) => total + record.frontPhotoCount + record.backPhotoCount, 0)}</b><small>Imagens documentadas</small></div></article>
    </section>
    <section className="surface apr-recent-card"><div className="table-toolbar"><div><p className="eyebrow">Registros recentes</p><h3>Últimas APRs aprovadas</h3></div></div>{recent.length ? <div className="apr-recent-list">{recent.map(record => <article key={record.id}><span><FileCheck2 size={18} /></span><div><b>{record.client} · {record.unit}</b><small>{record.technicians.join(', ')} · liberação em {new Date(`${record.releaseDate}T12:00:00`).toLocaleDateString('pt-BR')} às {record.releaseTime}</small></div></article>)}</div> : <div className="table-empty">Nenhuma APR aprovada foi registrada até o momento.</div>}</section>
    {formOpen && <AprForm data={data} onCancel={() => setFormOpen(false)} onComplete={complete} />}
    {completed && <AprDownloadDialog record={completed} onClose={() => setCompleted(null)} />}
  </>
}

function AprForm({ data, onCancel, onComplete }: { data: AppData; onCancel: () => void; onComplete: (record: AprRecord) => void }) {
  const [selectedTechnicians, setSelectedTechnicians] = useState<string[]>([])
  const [externalTechnicians, setExternalTechnicians] = useState<string[]>([])
  const [showExternal, setShowExternal] = useState(false)
  const [externalName, setExternalName] = useState('')
  const [client, setClient] = useState('')
  const [unit, setUnit] = useState('')
  const [releaseDate, setReleaseDate] = useState(localDateInput)
  const [releaseTime, setReleaseTime] = useState(nowTimeInput)
  const [description, setDescription] = useState('')
  const [sheets, setSheets] = useState<AprSheet[]>(() => [newAprSheet()])
  const [signature, setSignature] = useState<string | null>(null)
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const people = data.people.filter(person => person.active)
  const technicianNames = [...people.filter(person => selectedTechnicians.includes(person.id)).map(person => person.name), ...externalTechnicians]

  const toggleTechnician = (personId: string) => setSelectedTechnicians(current => current.includes(personId) ? current.filter(id => id !== personId) : [...current, personId])
  const addExternal = () => {
    const name = externalName.trim()
    if (!name) return
    if (!externalTechnicians.some(item => item.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) setExternalTechnicians(current => [...current, name])
    setExternalName('')
  }
  const addPhoto = async (file: File | undefined, sheetId: string, side: 'front' | 'back') => {
    if (!file) return
    setProcessingPhoto(true); setError('')
    try {
      const photo = { id: crypto.randomUUID(), name: file.name, data: await compressPhoto(file) }
      setSheets(current => current.map(sheet => sheet.id === sheetId ? { ...sheet, [side]: photo } : sheet))
    } catch {
      setError('Não foi possível preparar esta imagem. Tente tirar a foto novamente.')
    } finally {
      setProcessingPhoto(false)
    }
  }
  const removePhoto = (sheetId: string, side: 'front' | 'back') => setSheets(current => current.map(sheet => {
    if (sheet.id !== sheetId) return sheet
    const updated = { ...sheet }
    delete updated[side]
    return updated
  }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!technicianNames.length) return setError('Adicione pelo menos um técnico envolvido na APR.')
    const incompleteSheet = sheets.findIndex(sheet => !sheet.front || !sheet.back)
    if (incompleteSheet >= 0) return setError(`Adicione a frente e o verso da folha ${incompleteSheet + 1}.`)
    if (!signature) return setError('Registre a assinatura do técnico responsável antes de concluir.')
    setGenerating(true); setError('')
    const createdAt = new Date().toISOString()
    const safeClient = client.trim().replace(/[^a-zA-ZÀ-ÿ0-9]+/g, ' ').trim().replace(/\s+/g, '-') || 'Cliente'
    const record: AprRecord = {
      id: crypto.randomUUID(), createdAt, createdById: data.account.id, createdByName: data.account.name,
      technicians: technicianNames, client: client.trim(), unit: unit.trim(), releaseDate, releaseTime,
      description: description.trim(), frontPhotoCount: sheets.length, backPhotoCount: sheets.length,
      signedBy: data.account.name, pdfFileName: `APR Aprovada - ${safeClient} - ${releaseDate}.pdf`,
    }
    try {
      record.pdfData = await createAprPdf(record, sheets, signature)
      onComplete(record)
    } catch {
      setError('Não foi possível gerar o PDF da APR. Tente concluir novamente.')
      setGenerating(false)
    }
  }

  return <div className="full-screen-layer apr-form-layer"><form className="apr-form" onSubmit={submit}>
    <header className="form-page-header"><div><p className="eyebrow">Operação</p><h2>Adicionar APR aprovada</h2><p>Preencha os dados da liberação, inclua todas as páginas fotografadas e registre a assinatura.</p></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Fechar formulário da APR"><X size={22} /></button></header>
    <main className="apr-form-content">
      <section className="form-section"><div className="form-section-title"><span><Users size={20} /></span><div><h3>Técnicos envolvidos</h3><p>Selecione pessoas cadastradas e, se necessário, inclua outros nomes.</p></div></div>
        <fieldset className="apr-technician-selector"><legend>Técnicos cadastrados</legend><div>{people.map(person => <label className={selectedTechnicians.includes(person.id) ? 'selected' : ''} key={person.id}><input type="checkbox" checked={selectedTechnicians.includes(person.id)} onChange={() => toggleTechnician(person.id)} /><span>{person.name}</span></label>)}</div></fieldset>
        <div className="apr-external-control"><button type="button" className="secondary-button" onClick={() => setShowExternal(current => !current)}><UserPlus size={17} /> Outro técnico</button>{showExternal && <div><label>Nome do outro técnico<input value={externalName} onChange={event => setExternalName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addExternal() } }} placeholder="Digite o nome completo" /></label><button type="button" className="primary-button" onClick={addExternal} disabled={!externalName.trim()}><Plus size={16} /> Adicionar nome</button></div>}</div>
        {externalTechnicians.length > 0 && <div className="apr-external-list">{externalTechnicians.map(name => <span key={name}>{name}<button type="button" onClick={() => setExternalTechnicians(current => current.filter(item => item !== name))} aria-label={`Remover ${name}`}><X size={13} /></button></span>)}</div>}
      </section>

      <section className="form-section"><div className="form-section-title"><span><FileCheck2 size={20} /></span><div><h3>Informações da liberação</h3><p>A data e o horário podem ser informados manualmente.</p></div></div><div className="large-form-grid">
        <label>Cliente<input value={client} onChange={event => setClient(event.target.value)} placeholder="Digite o cliente" required /></label>
        <label>Unidade<input value={unit} onChange={event => setUnit(event.target.value)} placeholder="Digite a unidade" required /></label>
        <label>Data da liberação<input type="date" value={releaseDate} onChange={event => setReleaseDate(event.target.value)} required /></label>
        <label>Horário da liberação<input type="time" value={releaseTime} onChange={event => setReleaseTime(event.target.value)} required /></label>
        <label className="full">Descrição da atividade<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={4000} placeholder="Descreva completamente a atividade liberada pela APR" required /></label>
      </div></section>

      <section className="form-section"><div className="form-section-title"><span><Camera size={20} /></span><div><h3>Folhas da APR</h3><p>Fotografe a frente e o verso de cada folha. Cada imagem ocupará uma página do PDF.</p></div></div><div className="apr-sheet-list">
        {sheets.map((sheet, index) => <AprSheetCard key={sheet.id} sheet={sheet} index={index} canRemove={sheets.length > 1} processing={processingPhoto} onAdd={(file, side) => void addPhoto(file, sheet.id, side)} onRemovePhoto={side => removePhoto(sheet.id, side)} onRemoveSheet={() => setSheets(current => current.filter(item => item.id !== sheet.id))} />)}
        <button type="button" className="secondary-button apr-add-sheet" onClick={() => setSheets(current => [...current, newAprSheet()])} disabled={processingPhoto}><Plus size={17} /> Adicionar outra folha</button>
      </div></section>

      <section className="form-section apr-signature-section"><div className="form-section-title"><span><PenLine size={20} /></span><div><h3>Assinatura do técnico responsável</h3><p>A assinatura será exibida na última página do PDF.</p></div></div><button type="button" className={signature ? 'signature-select registered' : 'signature-select'} onClick={() => setSignatureOpen(true)}><span><PenLine size={22} /></span><div><b>{data.account.name}</b><small>Técnico responsável pelo registro</small></div><strong>{signature ? 'Assinatura registrada' : 'Toque para assinar'}</strong><ChevronRight size={18} /></button></section>
      {error && <div className="form-error apr-form-error"><AlertTriangle size={18} />{error}</div>}
    </main>
    <footer className="form-page-footer"><p><FileCheck2 size={17} />O PDF será arquivado em Documentos → APRs.</p><div><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={generating || processingPhoto}>{generating ? 'Gerando PDF...' : 'Concluir APR'} {!generating && <ChevronRight size={18} />}</button></div></footer>
  </form>{signatureOpen && <AprSignatureDialog signer={data.account.name} initial={signature} onCancel={() => setSignatureOpen(false)} onSave={value => { setSignature(value); setSignatureOpen(false); setError('') }} />}</div>
}

function AprSheetCard({ sheet, index, canRemove, processing, onAdd, onRemovePhoto, onRemoveSheet }: { sheet: AprSheet; index: number; canRemove: boolean; processing: boolean; onAdd: (file: File | undefined, side: 'front' | 'back') => void; onRemovePhoto: (side: 'front' | 'back') => void; onRemoveSheet: () => void }) {
  return <article className="apr-sheet-card"><div className="apr-sheet-heading"><div><b>Folha {index + 1}</b><small>{sheet.front && sheet.back ? 'Frente e verso adicionados' : 'Adicione os dois lados da folha'}</small></div>{canRemove && <button type="button" onClick={onRemoveSheet} aria-label={`Remover folha ${index + 1}`}><Trash2 size={16} /> Remover folha</button>}</div><div className="apr-sheet-photo-grid">
    <AprSheetPhoto sheetNumber={index + 1} side="front" photo={sheet.front} processing={processing} onAdd={file => onAdd(file, 'front')} onRemove={() => onRemovePhoto('front')} />
    <AprSheetPhoto sheetNumber={index + 1} side="back" photo={sheet.back} processing={processing} onAdd={file => onAdd(file, 'back')} onRemove={() => onRemovePhoto('back')} />
  </div></article>
}

function AprSheetPhoto({ sheetNumber, side, photo, processing, onAdd, onRemove }: { sheetNumber: number; side: 'front' | 'back'; photo?: AprPhoto; processing: boolean; onAdd: (file?: File) => void; onRemove: () => void }) {
  const label = side === 'front' ? 'Frente' : 'Verso'
  return <div className={photo ? 'apr-sheet-photo has-photo' : 'apr-sheet-photo'}><label><input aria-label={`${label} da folha ${sheetNumber}`} type="file" accept="image/*" capture="environment" disabled={processing} onChange={event => { onAdd(event.target.files?.[0]); event.target.value = '' }} />{photo ? <img src={photo.data} alt={`${label} da folha ${sheetNumber}`} /> : <Camera size={24} />}<span><b>{processing ? 'Preparando imagem...' : `${label} da folha`}</b><small>{photo ? 'Toque para substituir a foto' : 'Abrir câmera ou galeria'}</small></span></label>{photo && <button type="button" onClick={onRemove} aria-label={`Remover ${label.toLocaleLowerCase('pt-BR')} da folha ${sheetNumber}`}><Trash2 size={15} /></button>}</div>
}

function AprSignatureDialog({ signer, initial, onCancel, onSave }: { signer: string; initial: string | null; onCancel: () => void; onSave: (signature: string) => void }) {
  const [signature, setSignature] = useState<string | null>(initial)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) }
  }
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawing.current = true
    const canvas = canvasRef.current!
    canvas.setPointerCapture(event.pointerId)
    const context = canvas.getContext('2d')!
    const current = point(event)
    context.beginPath(); context.moveTo(current.x, current.y)
  }
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const context = canvasRef.current!.getContext('2d')!
    const current = point(event)
    context.lineWidth = 2.5; context.lineCap = 'round'; context.strokeStyle = '#17211b'; context.lineTo(current.x, current.y); context.stroke()
  }
  const stop = () => { if (drawing.current) setSignature(canvasRef.current!.toDataURL('image/png')); drawing.current = false }
  const clear = () => { canvasRef.current?.getContext('2d')?.clearRect(0, 0, 900, 260); setSignature(null) }
  return <div className="modal-layer apr-signature-layer" role="dialog" aria-modal="true" aria-labelledby="apr-signature-title"><button className="modal-backdrop" onClick={onCancel} aria-label="Fechar assinatura" /><section className="quick-modal apr-signature-modal"><div className="modal-heading"><div><p className="eyebrow">Assinatura da APR</p><h2 id="apr-signature-title">Assinatura de {signer}</h2></div><button type="button" className="icon-button" onClick={onCancel}><X size={20} /></button></div><p className="form-intro">Assine com o dedo ou com o mouse dentro do espaço abaixo.</p><div className="signature-wrap"><canvas ref={canvasRef} width="900" height="260" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} /><span>Assinatura do técnico responsável</span><button type="button" onClick={clear}>Limpar assinatura</button></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button type="button" className="primary-button" disabled={!signature} onClick={() => signature && onSave(signature)}><CheckCircle2 size={17} /> Registrar assinatura</button></div></section></div>
}

function AprDownloadDialog({ record, onClose }: { record: AprRecord; onClose: () => void }) {
  return <div className="modal-layer apr-download-layer" role="dialog" aria-modal="true" aria-labelledby="apr-download-title"><button className="modal-backdrop" onClick={onClose} aria-label="Fechar opção de download" /><section className="quick-modal apr-download-modal"><div className="apr-download-icon"><CheckCircle2 size={35} /></div><p className="eyebrow">APR salva com sucesso</p><h2 id="apr-download-title">Deseja baixar esse PDF?</h2><p>O documento já está registrado em <b>Documentos → APRs</b> e poderá ser baixado novamente depois.</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Agora não</button><button className="primary-button" onClick={() => { downloadPdf(record); onClose() }}><Download size={17} /> Baixar PDF</button></div></section></div>
}

async function compressPhoto(file: File) {
  const source = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = reject
      element.src = source
    })
    const maximum = 1800
    const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')!
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.84)
  } finally {
    URL.revokeObjectURL(source)
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function addContainedImage(pdf: jsPDF, dataUrl: string, x: number, y: number, maximumWidth: number, maximumHeight: number) {
  const properties = pdf.getImageProperties(dataUrl)
  const scale = Math.min(maximumWidth / properties.width, maximumHeight / properties.height)
  const width = properties.width * scale
  const height = properties.height * scale
  const format = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
  pdf.addImage(dataUrl, format, x + (maximumWidth - width) / 2, y + (maximumHeight - height) / 2, width, height)
}

export async function createAprPdf(record: AprRecord, sheets: AprSheet[], signature: string) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let logo = ''
  try { logo = await fetch(publicAsset('alert-logo.png')).then(response => response.blob()).then(blobToDataUrl) } catch { /* O título textual mantém o documento identificado. */ }
  const drawHeader = (subtitle: string) => {
    if (logo) addContainedImage(pdf, logo, 15, 9, 39, 20)
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); pdf.setTextColor(44, 48, 50); pdf.text('APR Aprovada', 65, 19)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(105, 111, 115); pdf.text(subtitle, 65, 26)
    pdf.setDrawColor(245, 130, 0); pdf.setLineWidth(1); pdf.line(15, 36, 195, 36)
  }
  const addPage = (subtitle: string) => { pdf.addPage(); drawHeader(subtitle) }

  drawHeader('GIO - Gestão Integrada de Operações')
  let y = 50
  const writeField = (label: string, value: string) => {
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(55, 59, 61); pdf.text(`${label}:`, 15, y)
    pdf.setFont('helvetica', 'normal')
    const lines = pdf.splitTextToSize(value || 'Não informado', 137) as string[]
    pdf.text(lines, 58, y)
    y += Math.max(9, lines.length * 4.3 + 4)
  }
  writeField('Técnicos', record.technicians.join(', '))
  writeField('Cliente', record.client)
  writeField('Unidade', record.unit)
  writeField('Liberação', `${new Date(`${record.releaseDate}T12:00:00`).toLocaleDateString('pt-BR')} às ${record.releaseTime}`)
  writeField('Criação no GIO', new Date(record.createdAt).toLocaleString('pt-BR'))
  writeField('Criado por', record.createdByName)
  y += 3
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(45, 49, 51); pdf.text('Descrição completa da atividade', 15, y); y += 8
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(55, 59, 61)
  const descriptionLines = pdf.splitTextToSize(record.description, 180) as string[]
  for (const line of descriptionLines) {
    if (y > 276) { addPage('Informações da APR - continuação'); y = 51; pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text('Descrição da atividade - continuação', 15, y); y += 8; pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10) }
    pdf.text(line, 15, y); y += 5
  }

  for (let index = 0; index < sheets.length; index += 1) {
    const { front, back } = sheets[index]
    if (front) {
      addPage(`Folha ${index + 1} - frente`)
      pdf.setDrawColor(214, 219, 216); pdf.roundedRect(15, 47, 180, 224, 3, 3)
      addContainedImage(pdf, front.data, 18, 50, 174, 218)
    }
    if (back) {
      addPage(`Folha ${index + 1} - verso`)
      pdf.setDrawColor(214, 219, 216); pdf.roundedRect(15, 47, 180, 224, 3, 3)
      addContainedImage(pdf, back.data, 18, 50, 174, 218)
    }
  }

  addPage('Assinatura e encerramento')
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(45, 49, 51); pdf.text('Confirmação do técnico responsável', 15, 57)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(65, 69, 71)
  pdf.text(`Técnico: ${record.signedBy}`, 15, 72)
  pdf.text(`Data da criação: ${new Date(record.createdAt).toLocaleString('pt-BR')}`, 15, 83)
  addContainedImage(pdf, signature, 30, 102, 150, 56)
  pdf.setDrawColor(110, 115, 117); pdf.line(30, 162, 180, 162)
  pdf.setFontSize(9); pdf.text(record.signedBy, 105, 168, { align: 'center' })
  pdf.setFontSize(8); pdf.setTextColor(110, 115, 117); pdf.text('Assinatura registrada eletronicamente no GIO.', 105, 176, { align: 'center' })

  const totalPages = pdf.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(125, 130, 132)
    pdf.text(`APR registrada em ${new Date(record.createdAt).toLocaleString('pt-BR')}`, 15, 289)
    pdf.text(`Página ${page} de ${totalPages}`, 195, 289, { align: 'right' })
  }
  return pdf.output('datauristring')
}
