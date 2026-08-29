import { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, Camera, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, FileDown, ListChecks, LockKeyhole, PenLine, ShieldCheck, UserCheck, Wrench, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import type { AppData, AuditCategory, AuditItemResult, AuditRecord, InventoryItem } from './store'
import { hashPassword } from './store'

const commonQuestions = [
  'O item está funcionando corretamente?',
  'Apresenta trincas, quebras ou deformações?',
  'O item está limpo e em condições adequadas de uso?',
  'Existe desgaste que comprometa a segurança?',
  'Precisa de manutenção preventiva ou corretiva?',
  'Está aprovado para continuar em uso?',
]

const ladderQuestions = [
  'A identificação e as informações da escada estão legíveis?',
  'Os degraus estão íntegros, sem trincas, quebras ou deformações?',
  'Os degraus estão firmes, sem folgas ou movimentos?',
  'As laterais estão sem rachaduras, empenamentos ou corrosão?',
  'Os pés antiderrapantes estão completos e em boas condições?',
  'As travas e articulações abrem e fecham corretamente?',
  'Parafusos, rebites e demais fixações estão firmes?',
  'A escada está limpa, sem óleo, graxa ou material escorregadio?',
  'A escada está sem adaptações ou reparos improvisados?',
  'A escada está estável, sem tremer, e aprovada para uso seguro?',
]

export type AuditStart = { category: AuditCategory; personId: string; personName: string; items: InventoryItem[]; startedAt: string }

function itemsForAudit(data: AppData, category: AuditCategory, personId: string) {
  const totals = new Map<string, number>()
  data.stockAssignments.filter(item => item.personId === personId && item.status === 'Aprovado e retirado').forEach(item => totals.set(item.inventoryItemId, (totals.get(item.inventoryItemId) ?? 0) + item.quantity))
  data.materialUsages.filter(item => item.personId === personId).forEach(item => totals.set(item.inventoryItemId, (totals.get(item.inventoryItemId) ?? 0) - item.quantity))
  return data.inventory.filter(item => {
    const matches = category === 'Ferramentas' ? item.category.includes('Ferramenta') : category === 'EPIs' ? item.category === 'EPI' : item.category === 'Escada'
    return matches && (totals.get(item.id) ?? 0) > 0
  })
}

function todayDate() { return new Date().toISOString().slice(0, 10) }
function oneMonthAfter(date: Date) {
  const lastDayOfNextMonth = new Date(date.getFullYear(), date.getMonth() + 2, 0).getDate()
  const next = new Date(date.getFullYear(), date.getMonth() + 1, Math.min(date.getDate(), lastDayOfNextMonth))
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}
function oneWeekAfter(date: Date) {
  const next = new Date(date)
  next.setDate(next.getDate() + 7)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

export function AuditPage({ data, onStart }: { data: AppData; onStart: (start: AuditStart) => void }) {
  const categories: { id: AuditCategory; label: string; description: string; icon: typeof Wrench }[] = [
    { id: 'Ferramentas', label: 'Ferramentas', description: 'Auditoria mensal de funcionamento e segurança.', icon: Wrench },
    { id: 'EPIs', label: 'EPIs', description: 'Auditoria mensal de conservação e aprovação.', icon: ShieldCheck },
    { id: 'Escadas', label: 'Escadas', description: 'Auditoria semanal de estabilidade, degraus e fixações.', icon: ListChecks },
  ]
  const [category, setCategory] = useState<AuditCategory>('Ferramentas')
  const [personId, setPersonId] = useState('')
  const selected = categories.find(item => item.id === category)!
  const SelectedIcon = selected.icon
  const selectedPerson = data.people.find(person => person.id === personId)
  const selectedItems = personId ? itemsForAudit(data, category, personId) : []
  const latestFor = (targetPersonId: string, type: AuditCategory) => [...data.audits].filter(item => item.personId === targetPersonId && item.category === type).sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0]
  const people = data.people.filter(person => person.active).map(person => ({ person, items: itemsForAudit(data, category, person.id), latest: latestFor(person.id, category) })).filter(entry => entry.items.length > 0)

  if (selectedPerson) {
    const latest = latestFor(selectedPerson.id, category)
    const scheduledDate = latest?.nextAuditDate ?? todayDate()
    return <>
      <button className="text-button audit-back" onClick={() => setPersonId('')}><ChevronLeft size={17} /> Voltar para a lista de pessoas</button>
      <section className="page-intro"><div><p className="eyebrow">Auditoria de {category}</p><h2>{selectedPerson.name}</h2><p>Confira os equipamentos vinculados antes de iniciar a sequência do checklist.</p></div></section>
      <section className="surface audit-person-overview">
        <div className="section-heading"><div><p className="eyebrow">{selectedItems.length} {selectedItems.length === 1 ? 'equipamento' : 'equipamentos'}</p><h3>{category} de {selectedPerson.name}</h3></div><span className="audit-heading-icon"><SelectedIcon size={24} /></span></div>
        <div className="next-audit-summary"><CalendarDays size={20} /><div><span>Auditoria marcada para</span><b>{new Date(`${scheduledDate}T12:00:00`).toLocaleDateString('pt-BR')}</b></div><small>{latest ? 'Data definida automaticamente na auditoria anterior.' : 'Primeira auditoria disponível para iniciar hoje.'}</small></div>
        <div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Código</th><th>Marca / modelo</th><th>Categoria</th></tr></thead><tbody>{selectedItems.map(item => <tr key={item.id}><td>{item.equipment}</td><td>{item.code || '—'}</td><td>{[item.brand, item.model].filter(Boolean).join(' / ') || '—'}</td><td>{item.category}</td></tr>)}</tbody></table></div>
        <div className="audit-start-row"><p><ClipboardCheck size={17} />Será solicitada uma foto e o checklist completo de cada equipamento.</p><button className="primary-button" onClick={() => onStart({ category, personId: selectedPerson.id, personName: selectedPerson.name, items: selectedItems, startedAt: new Date().toISOString() })}>Iniciar auditoria <ChevronRight size={18} /></button></div>
      </section>
    </>
  }

  return <>
    <section className="page-intro"><div><p className="eyebrow">Gestão de segurança</p><h2>Auditorias</h2><p>Selecione o tipo e entre no usuário para conferir todos os equipamentos vinculados.</p></div></section>
    <section className="audit-category-grid">{categories.map(item => { const Icon = item.icon; return <button className={category === item.id ? 'audit-category-card active' : 'audit-category-card'} key={item.id} onClick={() => setCategory(item.id)}><span><Icon size={23} /></span><div><b>{item.label}</b><small>{item.description}</small></div><ChevronRight size={18} /></button> })}</section>
    <section className="surface table-surface audit-people-table"><div className="table-toolbar"><div><p className="eyebrow">Pessoas com equipamentos</p><h3>Auditorias de {selected.label}</h3></div><span className="audit-heading-icon"><SelectedIcon size={22} /></span></div><div className="responsive-table"><table><thead><tr><th>Pessoa</th><th>Auditoria</th><th>Data marcada</th><th>Qualidade da última auditoria</th><th>Equipamentos</th><th>Ação</th></tr></thead><tbody>{people.length ? people.map(({ person, items, latest }) => { const approved = latest?.results.filter(result => result.approved).length ?? 0; const quality = !latest ? 'Pendente' : approved === latest.results.length ? 'Aprovada' : 'Com ressalvas'; const date = latest?.nextAuditDate ?? todayDate(); return <tr key={person.id}><td><b>{person.name}</b><small className="table-subtitle">{person.groups.join(', ')}</small></td><td>{category}</td><td>{new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')}</td><td><span className={`status ${quality === 'Aprovada' ? 'success' : quality === 'Pendente' ? 'warning' : 'danger'}`}>{quality}</span></td><td>{items.length}</td><td><button className="secondary-button compact" onClick={() => setPersonId(person.id)}>Entrar <ChevronRight size={16} /></button></td></tr> }) : <tr><td colSpan={6} className="table-empty">Nenhuma pessoa possui {category.toLowerCase()} aprovados no estoque pessoal.</td></tr>}</tbody></table></div></section>
  </>
}

export function AuditWizard({ data, start, onCancel, onComplete }: { data: AppData; start: AuditStart; onCancel: () => void; onComplete: (audit: AuditRecord) => void }) {
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<AuditItemResult[]>([])
  const [answers, setAnswers] = useState<Record<number, boolean>>({})
  const [photo, setPhoto] = useState('')
  const [closingResults, setClosingResults] = useState<AuditItemResult[] | null>(null)
  const item = start.items[index]
  const questions = start.category === 'Escadas' ? ladderQuestions : commonQuestions
  const complete = Object.keys(answers).length === questions.length && Boolean(photo)

  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(String(reader.result))
    reader.readAsDataURL(file)
  }

  const next = () => {
    if (!complete) return
    const result: AuditItemResult = { inventoryItemId: item.id, equipment: item.equipment, code: item.code, answers: questions.map((question, questionIndex) => ({ question, answer: answers[questionIndex] })), photo, approved: answers[questions.length - 1] === true }
    const nextResults = [...results, result]
    if (index === start.items.length - 1) {
      setClosingResults(nextResults)
      return
    }
    setResults(nextResults); setIndex(current => current + 1); setAnswers({}); setPhoto('')
  }

  if (closingResults) return <AuditFinalization data={data} start={start} results={closingResults} onCancel={onCancel} onComplete={onComplete} />

  return <div className="full-screen-layer audit-wizard-layer">
    <header className="form-page-header"><div><p className="eyebrow">Auditoria de {start.category} · {start.personName}</p><h2>{item.equipment}</h2><p>Item {index + 1} de {start.items.length} · código {item.code || 'não informado'}</p></div><button className="icon-button" onClick={onCancel} aria-label="Fechar auditoria"><X size={22} /></button></header>
    <div className="audit-progress"><span style={{ width: `${((index + 1) / start.items.length) * 100}%` }} /></div>
    <main className="audit-wizard-content">
      <section className="surface audit-item-info"><div><span>Equipamento</span><b>{item.equipment}</b></div><div><span>Marca / modelo</span><b>{[item.brand, item.model].filter(Boolean).join(' / ') || 'Não informado'}</b></div><div><span>Pessoa auditada</span><b>{start.personName}</b></div></section>
      <section className="surface audit-checklist"><div className="section-heading"><div><p className="eyebrow">Checklist obrigatório</p><h3>Condições do equipamento</h3></div><ListChecks size={22} /></div>{questions.map((question, questionIndex) => <div className="audit-question" key={question}><p><b>{questionIndex + 1}.</b> {question}</p><div><button className={answers[questionIndex] === true ? 'answer-button yes active' : 'answer-button yes'} onClick={() => setAnswers({ ...answers, [questionIndex]: true })}>Sim</button><button className={answers[questionIndex] === false ? 'answer-button no active' : 'answer-button no'} onClick={() => setAnswers({ ...answers, [questionIndex]: false })}>Não</button></div></div>)}</section>
      <section className="surface audit-photo-section"><div className="section-heading"><div><p className="eyebrow">Evidência obrigatória</p><h3>Foto do equipamento</h3></div><Camera size={22} /></div><label className={photo ? 'audit-photo-field filled' : 'audit-photo-field'}><Camera size={28} /><b>{photo ? 'Foto adicionada' : 'Abrir câmera'}</b><small>{photo ? 'Toque para substituir a foto' : 'Registre a condição atual do equipamento'}</small><input type="file" accept="image/*" capture="environment" onChange={choosePhoto} /></label>{photo && <img className="audit-photo-preview" src={photo} alt={`Registro de ${item.equipment}`} />}</section>
    </main>
    <footer className="audit-wizard-footer"><button className="secondary-button" disabled={index === 0} onClick={() => { const previous = results[index - 1]; if (!previous) return; setIndex(current => current - 1); setResults(current => current.slice(0, -1)); setAnswers(Object.fromEntries(previous.answers.map((answer, answerIndex) => [answerIndex, answer.answer]))); setPhoto(previous.photo) }}><ChevronLeft size={18} /> Anterior</button><p>{Object.keys(answers).length} de {questions.length} respostas · {photo ? 'foto pronta' : 'foto pendente'}</p><button className="primary-button" disabled={!complete} onClick={next}>{index === start.items.length - 1 ? <><CheckCircle2 size={18} /> Concluir auditoria</> : <>Próximo equipamento <ChevronRight size={18} /></>}</button></footer>
  </div>
}

function AuditFinalization({ data, start, results, onCancel, onComplete }: { data: AppData; start: AuditStart; results: AuditItemResult[]; onCancel: () => void; onComplete: (audit: AuditRecord) => void }) {
  const [stage, setStage] = useState<'auditor' | 'audited'>('auditor')
  const [password, setPassword] = useState('')
  const [auditorSignature, setAuditorSignature] = useState<string | null>(null)
  const [auditedSignature, setAuditedSignature] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)

  const confirmAuditor = async (event: FormEvent) => {
    event.preventDefault()
    if (!auditorSignature) { setError('A assinatura do auditor é obrigatória.'); return }
    if (await hashPassword(password) !== data.account.passwordHash) { setError('A senha informada não corresponde ao usuário conectado.'); return }
    setError(''); setStage('audited')
  }

  const finish = async (event: FormEvent) => {
    event.preventDefault()
    if (!auditedSignature) { setError('A assinatura da pessoa auditada é obrigatória.'); return }
    setGenerating(true); setError('')
    const completedAt = new Date()
    const nextAuditDate = start.category === 'Escadas' ? oneWeekAfter(completedAt) : oneMonthAfter(completedAt)
    const safeName = start.personName.replace(/[^a-zA-ZÀ-ÿ0-9]+/g, ' ').trim().replace(/\s+/g, '-')
    const pdfFileName = `Relatório de Auditoria - ${start.category} - ${safeName} - ${todayDate()}.pdf`
    const fullRecord: AuditRecord = { id: crypto.randomUUID(), personId: start.personId, category: start.category, auditorName: data.account.name, auditedName: start.personName, nextAuditDate, startedAt: start.startedAt, completedAt: completedAt.toISOString(), pdfFileName, results }
    try {
      await createAuditPdf(fullRecord, auditorSignature, auditedSignature)
      onComplete({ ...fullRecord, results: results.map(result => ({ ...result, photo: '' })) })
    } catch {
      setError('Não foi possível gerar o PDF. Tente novamente.'); setGenerating(false)
    }
  }

  return <div className="full-screen-layer audit-signature-layer">
    <header className="form-page-header"><div><p className="eyebrow">Finalização da auditoria</p><h2>{stage === 'auditor' ? 'Confirmação do auditor' : 'Assinatura da pessoa auditada'}</h2><p>Etapa {stage === 'auditor' ? '1' : '2'} de 2 · {start.category}</p></div><button className="icon-button" onClick={onCancel} aria-label="Cancelar finalização"><X size={22} /></button></header>
    <div className="signature-steps"><span className="active">1</span><i className={stage === 'audited' ? 'active' : ''} /><span className={stage === 'audited' ? 'active' : ''}>2</span><small>Auditor</small><small>Auditado</small></div>
    {stage === 'auditor' ? <form className="audit-signature-content" onSubmit={confirmAuditor}>
      <section className="surface audit-signature-card"><div className="section-heading"><div><p className="eyebrow">Usuário conectado</p><h3>Confirme sua identidade</h3></div><LockKeyhole size={22} /></div><div className="audit-parties"><div><span>Auditor</span><b>{data.account.name}</b></div><div><span>Pessoa auditada</span><b>{start.personName}</b></div></div><label className="audit-password-field">Senha do auditor<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required placeholder="Digite sua senha de acesso" /></label></section>
      <section className="surface audit-signature-card"><div className="section-heading"><div><p className="eyebrow">Assinatura obrigatória</p><h3>Assinatura do auditor</h3></div><PenLine size={22} /></div><SignaturePad label={`Assinatura de ${data.account.name}`} onChange={setAuditorSignature} /></section>
      {error && <p className="audit-final-error"><AlertTriangle size={17} />{error}</p>}
      <div className="audit-final-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button className="primary-button">Validar e continuar <ChevronRight size={18} /></button></div>
    </form> : <form className="audit-signature-content" onSubmit={finish}>
      <section className="surface audit-signature-card"><div className="section-heading"><div><p className="eyebrow">Identidade do auditor validada</p><h3>{data.account.name}</h3></div><CheckCircle2 size={22} /></div><p className="signature-instruction">Agora entregue o celular para <b>{start.personName}</b> conferir e assinar.</p></section>
      <section className="surface audit-signature-card"><div className="section-heading"><div><p className="eyebrow">Assinatura obrigatória</p><h3>Assinatura de {start.personName}</h3></div><UserCheck size={22} /></div><SignaturePad label={`Assinatura de ${start.personName}`} onChange={setAuditedSignature} /></section>
      {error && <p className="audit-final-error"><AlertTriangle size={17} />{error}</p>}
      <div className="audit-final-actions"><button type="button" className="secondary-button" disabled={generating} onClick={() => { setStage('auditor'); setError('') }}><ChevronLeft size={18} /> Voltar</button><button className="primary-button" disabled={generating}>{generating ? 'Gerando relatório...' : <><FileDown size={18} /> Finalizar e salvar PDF</>}</button></div>
    </form>}
  </div>
}

function SignaturePad({ label, onChange }: { label: string; onChange: (signature: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) }
  }
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawing.current = true
    canvasRef.current!.setPointerCapture(event.pointerId)
    const context = canvasRef.current!.getContext('2d')!
    const current = point(event)
    context.beginPath(); context.moveTo(current.x, current.y)
  }
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const context = canvasRef.current!.getContext('2d')!
    const current = point(event)
    context.lineWidth = 2.4; context.lineCap = 'round'; context.strokeStyle = '#242729'; context.lineTo(current.x, current.y); context.stroke()
  }
  const stop = () => { if (drawing.current) onChange(canvasRef.current!.toDataURL('image/png')); drawing.current = false }
  const clear = () => { const canvas = canvasRef.current!; canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height); onChange(null) }
  return <div className="signature-wrap audit-signature-pad"><canvas ref={canvasRef} width="900" height="230" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} /><span>{label} — assine com o dedo dentro da área</span><button type="button" onClick={clear}>Limpar assinatura</button></div>
}

async function createAuditPdf(record: AuditRecord, auditorSignature: string, auditedSignature: string) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let logo = ''
  try { logo = await fetch('/alert-logo.png').then(response => response.blob()).then(blobToDataUrl) } catch { /* O título mantém o documento identificável. */ }
  const header = (title: string, subtitle: string) => {
    if (logo) pdf.addImage(logo, 'PNG', 15, 10, 44, 22)
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(48, 51, 54); pdf.text(title, 15, 42)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(112, 117, 122); pdf.text(subtitle, 15, 48)
    pdf.setDrawColor(245, 130, 0); pdf.setLineWidth(1); pdf.line(15, 53, 195, 53)
  }

  const approved = record.results.filter(result => result.approved).length
  header(`Relatório de Auditoria de ${record.category}`, 'GIO — Gestão Integrada de Operações')
  const summary = [
    ['Auditor', record.auditorName], ['Pessoa auditada', record.auditedName],
    ['Início', new Date(record.startedAt).toLocaleString('pt-BR')], ['Conclusão', new Date(record.completedAt).toLocaleString('pt-BR')],
    ['Próxima auditoria', new Date(`${record.nextAuditDate}T12:00:00`).toLocaleDateString('pt-BR')],
    ['Resultado geral', approved === record.results.length ? 'Aprovada' : 'Com ressalvas'],
    ['Equipamentos aprovados', `${approved} de ${record.results.length}`],
  ]
  let y = 66
  pdf.setFontSize(10)
  summary.forEach(([label, value]) => { pdf.setFont('helvetica', 'bold'); pdf.setTextColor(70, 73, 76); pdf.text(`${label}:`, 15, y); pdf.setFont('helvetica', 'normal'); pdf.text(value, 57, y); y += 9 })
  y += 5
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text('Resumo dos equipamentos', 15, y); y += 8
  record.results.forEach((result, index) => {
    if (y > 276) { pdf.addPage(); header('Resumo dos equipamentos', `${record.auditedName} · continuação`); y = 65 }
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(48, 51, 54); pdf.text(`${index + 1}. ${result.equipment}`, 15, y)
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(result.approved ? 35 : 157, result.approved ? 107 : 51, result.approved ? 58 : 46); pdf.text(result.approved ? 'APROVADO' : 'NÃO APROVADO', 155, y); y += 8
  })

  record.results.forEach((result, itemIndex) => {
    pdf.addPage(); header(`${itemIndex + 1}. ${result.equipment}`, `Código ${result.code || 'não informado'} · ${result.approved ? 'Aprovado' : 'Não aprovado'}`)
    let questionY = 65
    pdf.setFontSize(8)
    result.answers.forEach((answer, answerIndex) => {
      const lines = pdf.splitTextToSize(`${answerIndex + 1}. ${answer.question}`, 92) as string[]
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(55, 58, 60); pdf.text(lines, 15, questionY)
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(answer.answer ? 35 : 157, answer.answer ? 107 : 51, answer.answer ? 58 : 46); pdf.text(answer.answer ? 'SIM' : 'NÃO', 106, questionY)
      questionY += Math.max(9, lines.length * 4 + 4)
    })
    if (result.photo) {
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(70, 73, 76); pdf.text('Evidência fotográfica', 121, 64)
      addContainedImage(pdf, result.photo, 121, 70, 74, 82)
    }
  })

  pdf.addPage(); header('Assinaturas e confirmação', `${record.category} · ${record.auditedName}`)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(55, 58, 60); pdf.text(`Auditor: ${record.auditorName}`, 15, 66)
  pdf.addImage(auditorSignature, 'PNG', 15, 72, 82, 30); pdf.setDrawColor(120, 124, 126); pdf.line(15, 104, 97, 104)
  pdf.text(`Pessoa auditada: ${record.auditedName}`, 15, 128)
  pdf.addImage(auditedSignature, 'PNG', 15, 134, 82, 30); pdf.line(15, 166, 97, 166)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(112, 117, 122)
  pdf.text(`Documento gerado em ${new Date(record.completedAt).toLocaleString('pt-BR')}.`, 15, 184)
  pdf.text('As assinaturas confirmam a realização da auditoria e o conhecimento dos resultados registrados.', 15, 191)
  pdf.save(record.pdfFileName)
}

function addContainedImage(pdf: jsPDF, dataUrl: string, x: number, y: number, maxWidth: number, maxHeight: number) {
  const properties = pdf.getImageProperties(dataUrl)
  const scale = Math.min(maxWidth / properties.width, maxHeight / properties.height)
  const width = properties.width * scale
  const height = properties.height * scale
  const format = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
  pdf.addImage(dataUrl, format, x + (maxWidth - width) / 2, y + (maxHeight - height) / 2, width, height)
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob)
  })
}
