import { ChangeEvent, PointerEvent as ReactPointerEvent, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, Camera, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, FileDown, ListChecks, PenLine, ShieldCheck, UserCheck, Wrench, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { hasProfile } from './access'
import type { AppData, AuditAnswer, AuditCategory, AuditItemResult, AuditRecord, InventoryItem } from './store'
import { publicAsset } from './paths'
import { auditCategoryForItem, itemAuditStatus, itemIdentifier, personalInventory } from './personalInventory'
import { auditAnswerIsNegative, auditAnswerLabel, auditItemStatus, auditSummaryStatus, ladderAnswerOptions, ladderBlockedMessage, ladderIsApproved, ladderNonConformities, ladderQuestions } from './auditChecklist'

const commonQuestions = [
  'O item está funcionando corretamente?',
  'Apresenta trincas, quebras ou deformações?',
  'O item está limpo e em condições adequadas de uso?',
  'Existe desgaste que comprometa a segurança?',
  'Precisa de manutenção preventiva ou corretiva?',
  'Está aprovado para continuar em uso?',
]

export type AuditStart = { category: AuditCategory; personId: string; personName: string; items: InventoryItem[]; scheduledDate: string; startedAt: string }

function itemsForAudit(data: AppData, category: AuditCategory, personId: string) {
  return personalInventory(data, personId).filter(item => auditCategoryForItem(item) === category)
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

export function AuditPage({ data, allowedCategories, onStart }: { data: AppData; allowedCategories: AuditCategory[]; onStart: (start: AuditStart) => void }) {
  const allCategories: { id: AuditCategory; label: string; description: string; icon: typeof Wrench }[] = [
    { id: 'Ferramentas', label: 'Ferramentas', description: 'Auditoria mensal de funcionamento e segurança.', icon: Wrench },
    { id: 'EPIs', label: 'EPIs', description: 'Auditoria mensal de conservação e aprovação.', icon: ShieldCheck },
    { id: 'Escadas', label: 'Escadas', description: 'Auditoria semanal de estabilidade, degraus e fixações.', icon: ListChecks },
  ]
  const categories = allCategories.filter(item => allowedCategories.includes(item.id))
  const [category, setCategory] = useState<AuditCategory>(allowedCategories[0] ?? 'Escadas')
  const [personId, setPersonId] = useState('')
  const selected = categories.find(item => item.id === category)!
  const SelectedIcon = selected.icon
  const selectedPerson = data.people.find(person => person.id === personId)
  const selectedItems = personId ? itemsForAudit(data, category, personId) : []
  const latestFor = (targetPersonId: string, type: AuditCategory) => [...data.audits].filter(item => item.personId === targetPersonId && item.category === type).sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0]
  const currentPerson = data.people.find(person => person.id === data.account.id)
  const canAuditOthers = hasProfile(currentPerson?.groups, 'Auditoria')
  const people = data.people.filter(person => person.active && (category !== 'Escadas' || canAuditOthers || person.id === data.account.id)).map(person => ({ person, items: itemsForAudit(data, category, person.id), latest: latestFor(person.id, category) })).filter(entry => entry.items.length > 0)

  if (selectedPerson) {
    const latest = latestFor(selectedPerson.id, category)
    const scheduledDate = latest?.nextAuditDate ?? todayDate()
    return <>
      <button className="text-button audit-back" onClick={() => setPersonId('')}><ChevronLeft size={17} /> Voltar para a lista de pessoas</button>
      <section className="page-intro"><div><p className="eyebrow">Auditoria de {category}</p><h2>{selectedPerson.name}</h2><p>Confira os equipamentos vinculados antes de iniciar a sequência do checklist.</p></div></section>
      <section className="surface audit-person-overview">
        <div className="section-heading"><div><p className="eyebrow">{selectedItems.length} {selectedItems.length === 1 ? 'equipamento' : 'equipamentos'}</p><h3>{category} de {selectedPerson.name}</h3></div><span className="audit-heading-icon"><SelectedIcon size={24} /></span></div>
        <div className="next-audit-summary"><CalendarDays size={20} /><div><span>Auditoria marcada para</span><b>{new Date(`${scheduledDate}T12:00:00`).toLocaleDateString('pt-BR')}</b></div><small>{latest ? 'Data definida automaticamente na auditoria anterior.' : 'Primeira auditoria disponível para iniciar hoje.'}</small></div>
        <div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Código</th><th>Marca / modelo</th><th>Categoria</th><th>Status</th></tr></thead><tbody>{selectedItems.map(item => { const status = itemAuditStatus(data, selectedPerson.id, item); return <tr key={item.id}><td>{item.equipment}</td><td>{item.code || '—'}</td><td>{[item.brand, item.model].filter(Boolean).join(' / ') || '—'}</td><td>{item.category}</td><td><span className={`status ${status === 'Não liberada' || status === 'Não aprovado' ? 'danger' : status === 'Não auditado' ? 'warning' : 'success'}`}>{status}</span></td></tr> })}</tbody></table></div>
        <div className="audit-start-row"><p><ClipboardCheck size={17} />Será solicitada uma foto e o checklist completo de cada equipamento.</p><button className="primary-button" onClick={() => onStart({ category, personId: selectedPerson.id, personName: selectedPerson.name, items: selectedItems, scheduledDate, startedAt: new Date().toISOString() })}>Iniciar auditoria <ChevronRight size={18} /></button></div>
      </section>
    </>
  }

  return <>
    <section className="page-intro"><div><p className="eyebrow">Gestão de segurança</p><h2>Auditorias</h2><p>Selecione o tipo e entre no usuário para conferir todos os equipamentos vinculados.</p></div></section>
    <section className="audit-category-grid">{categories.map(item => { const Icon = item.icon; return <button className={category === item.id ? 'audit-category-card active' : 'audit-category-card'} key={item.id} onClick={() => setCategory(item.id)}><span><Icon size={23} /></span><div><b>{item.label}</b><small>{item.description}</small></div><ChevronRight size={18} /></button> })}</section>
    <section className="surface table-surface audit-people-table"><div className="table-toolbar"><div><p className="eyebrow">Pessoas com equipamentos</p><h3>Auditorias de {selected.label}</h3></div><span className="audit-heading-icon"><SelectedIcon size={22} /></span></div><div className="responsive-table"><table><thead><tr><th>Pessoa</th><th>Auditoria</th><th>Data marcada</th><th>Qualidade da última auditoria</th><th>Equipamentos</th><th>Ação</th></tr></thead><tbody>{people.length ? people.map(({ person, items, latest }) => { const quality = category === 'Escadas' && items.some(item => item.ladderRestriction) ? 'Não liberada' : !latest ? 'Pendente' : auditSummaryStatus(category, latest.results); const date = latest?.nextAuditDate ?? todayDate(); return <tr key={person.id}><td><b>{person.name}</b><small className="table-subtitle">{person.groups.join(', ')}</small></td><td>{category}</td><td>{new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')}</td><td><span className={`status ${quality === 'Aprovada' || quality === 'Liberada' ? 'success' : quality === 'Pendente' ? 'warning' : 'danger'}`}>{quality}</span></td><td>{items.length}</td><td><button className="secondary-button compact" onClick={() => setPersonId(person.id)}>Entrar <ChevronRight size={16} /></button></td></tr> }) : <tr><td colSpan={6} className="table-empty">Nenhuma pessoa possui {category.toLowerCase()} aprovados no estoque pessoal.</td></tr>}</tbody></table></div></section>
  </>
}

export function AuditWizard({ data, start, onCancel, onComplete }: { data: AppData; start: AuditStart; onCancel: () => void; onComplete: (audit: AuditRecord) => void }) {
  const itemDrafts = useRef<Record<number, { answers: Record<number, AuditAnswer>; photo: string; currentIdentifier: string; newIdentifier: string; observation: string }>>({})
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<AuditItemResult[]>([])
  const [answers, setAnswers] = useState<Record<number, AuditAnswer>>({})
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false)
  const [photo, setPhoto] = useState('')
  const [currentIdentifier, setCurrentIdentifier] = useState(() => itemIdentifier(data, start.personId, start.items[0]))
  const [newIdentifier, setNewIdentifier] = useState('')
  const [observation, setObservation] = useState('')
  const [closingResults, setClosingResults] = useState<AuditItemResult[] | null>(null)
  const item = start.items[index]
  const isLadder = start.category === 'Escadas'
  const restriction = data.inventory.find(entry => entry.id === item.id)?.ladderRestriction
  const restricted = Boolean(restriction)
  const questions = isLadder ? ladderQuestions : commonQuestions
  const complete = Object.keys(answers).length === questions.length && Boolean(photo)

  const chooseAnswer = (questionIndex: number, answer: AuditAnswer) => {
    setAnswers(current => ({ ...current, [questionIndex]: answer }))
  }

  const openItem = (targetIndex: number, drafts = results) => {
    itemDrafts.current[index] = { answers, photo, currentIdentifier, newIdentifier, observation }
    const saved = drafts[targetIndex]
    const draft = itemDrafts.current[targetIndex]
    setIndex(targetIndex)
    setAnswers(draft?.answers ?? (saved ? Object.fromEntries(saved.answers.map((entry, answerIndex) => [answerIndex, entry.answer])) : {}))
    setPhoto(draft?.photo ?? saved?.photo ?? '')
    setCurrentIdentifier(draft?.currentIdentifier ?? saved?.currentIdentifier ?? itemIdentifier(data, start.personId, start.items[targetIndex]))
    setNewIdentifier(draft?.newIdentifier ?? saved?.newIdentifier ?? '')
    setObservation(draft?.observation ?? saved?.observation ?? '')
  }

  const reviseResults = (targetIndex: number) => {
    if (!closingResults) return
    setResults(closingResults)
    openItem(targetIndex, closingResults)
    setClosingResults(null); setReviewAcknowledged(false)
  }

  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(String(reader.result))
    reader.readAsDataURL(file)
  }

  const next = () => {
    if (!complete) return
    const nonConformities = isLadder ? questions.filter((_, questionIndex) => answers[questionIndex] === 'Não conforme') : []
    const restrictionQuestions = [...new Set([...(restriction?.questions ?? []), ...nonConformities])]
    const result: AuditItemResult = { inventoryItemId: item.id, equipment: item.equipment, code: item.code, currentIdentifier: currentIdentifier.trim(), newIdentifier: newIdentifier.trim(), observation: observation.trim(), restrictionReason: isLadder && (restricted || nonConformities.length > 0) ? `${ladderBlockedMessage}\n${restrictionQuestions.join('\n')}` : undefined, answers: questions.map((question, questionIndex) => ({ question, answer: answers[questionIndex] })), photo, approved: isLadder ? ladderIsApproved(answers, restricted) : answers[questions.length - 1] === true }
    const nextResults = [...results]
    nextResults[index] = result
    setResults(nextResults)
    if (index === start.items.length - 1) {
      setClosingResults(nextResults)
      return
    }
    openItem(index + 1, nextResults)
  }

  if (closingResults && isLadder && !reviewAcknowledged && closingResults.some(result => !result.approved)) return <div className="full-screen-layer ladder-block-screen ladder-final-review" role="dialog" aria-modal="true" aria-labelledby="ladder-review-title"><section className="surface"><AlertTriangle size={48} /><h2 id="ladder-review-title">Revisão final das escadas</h2><p>Foram identificadas as seguintes não conformidades:</p>{closingResults.map((result, resultIndex) => {
    const nonConformities = ladderNonConformities(result)
    if (result.approved) return null
    return <article className="ladder-review-item" key={result.inventoryItemId}><b>{result.equipment} · {result.newIdentifier || result.currentIdentifier || result.code}</b>{nonConformities.length ? <ul>{nonConformities.map(question => <li key={question}>{question}</li>)}</ul> : <p>Esta escada possui uma restrição anterior registrada. Nenhuma nova não conformidade foi marcada neste checklist.</p>}<button className="secondary-button compact" onClick={() => reviseResults(resultIndex)}>Revisar esta escada</button></article>
  })}<p className="ladder-review-instruction">{ladderBlockedMessage}</p><small>Se alguma resposta foi marcada por engano, volte e corrija. O status será alterado somente ao finalizar a auditoria assinada.</small><div><button className="secondary-button" onClick={() => reviseResults(0)}>Voltar ao checklist</button><button className="primary-button" autoFocus onClick={() => setReviewAcknowledged(true)}>Continuar para assinatura</button><button className="text-button" onClick={onCancel}>Cancelar auditoria</button></div></section></div>
  if (closingResults) return <AuditSigning data={data} start={start} results={closingResults} onCancel={onCancel} onBack={() => reviseResults(start.items.length - 1)} onComplete={onComplete} />

  return <div className="full-screen-layer audit-wizard-layer">
    <header className="form-page-header"><div><p className="eyebrow">Auditoria de {start.category} · {start.personName}</p><h2>{item.equipment}</h2><p>Item {index + 1} de {start.items.length} · código {item.code || 'não informado'}</p></div><button className="icon-button" onClick={onCancel} aria-label="Fechar auditoria"><X size={22} /></button></header>
    <div className="audit-progress"><span style={{ width: `${((index + 1) / start.items.length) * 100}%` }} /></div>
    <main className="audit-wizard-content">
      <section className="surface audit-item-info"><div><span>Equipamento</span><b>{item.equipment}</b></div><div><span>Marca / modelo</span><b>{[item.brand, item.model].filter(Boolean).join(' / ') || 'Não informado'}</b></div><div><span>Pessoa auditada</span><b>{start.personName}</b></div></section>
      {isLadder && restricted && <div className="ladder-restriction-banner" role="status"><AlertTriangle size={22} /><p>{ladderBlockedMessage}</p></div>}
      <section className="surface audit-identifiers"><div className="section-heading"><div><p className="eyebrow">Identificação do equipamento</p><h3>Identificadores e observação</h3></div></div><div className="form-grid"><label>Identificador atual<input type="text" maxLength={120} value={currentIdentifier} onChange={event => setCurrentIdentifier(event.target.value)} placeholder="Texto ou identificação atual" /></label><label>Novo identificador (opcional)<input type="text" maxLength={120} value={newIdentifier} onChange={event => setNewIdentifier(event.target.value)} placeholder="Preencha se houver uma nova identificação" /></label><label className="full">Observação do equipamento (opcional)<textarea rows={2} maxLength={500} value={observation} onChange={event => setObservation(event.target.value)} placeholder="Uma breve observação sobre este equipamento" /></label></div></section>
      <section className="surface audit-checklist"><div className="section-heading"><div><p className="eyebrow">Checklist obrigatório</p><h3>Condições do equipamento</h3></div><ListChecks size={22} /></div>{isLadder && <p className="table-subtitle">Marque “Não aplicável” somente quando a condição não se aplicar a esta escada. As não conformidades serão apresentadas para revisão ao final do checklist.</p>}{questions.map((question, questionIndex) => <div className={isLadder ? 'audit-question ladder-question' : 'audit-question'} key={question}><p><b>{questionIndex + 1}.</b> {question}</p><div>{isLadder ? ladderAnswerOptions.map(answer => <button key={answer} aria-pressed={answers[questionIndex] === answer} className={`answer-button ${answer === 'Conforme' ? 'yes' : answer === 'Não conforme' ? 'no' : 'not-applicable'}${answers[questionIndex] === answer ? ' active' : ''}`} onClick={() => chooseAnswer(questionIndex, answer)}>{answer}</button>) : <><button className={answers[questionIndex] === true ? 'answer-button yes active' : 'answer-button yes'} onClick={() => chooseAnswer(questionIndex, true)}>Sim</button><button className={answers[questionIndex] === false ? 'answer-button no active' : 'answer-button no'} onClick={() => chooseAnswer(questionIndex, false)}>Não</button></>}</div></div>)}</section>
      <section className="surface audit-photo-section"><div className="section-heading"><div><p className="eyebrow">Evidência obrigatória</p><h3>Foto do equipamento</h3></div><Camera size={22} /></div><label className={photo ? 'audit-photo-field filled' : 'audit-photo-field'}><Camera size={28} /><b>{photo ? 'Foto adicionada' : 'Abrir câmera'}</b><small>{photo ? 'Toque para substituir a foto' : 'Registre a condição atual do equipamento'}</small><input key={item.id} type="file" accept="image/*" capture="environment" onChange={choosePhoto} /></label>{photo && <img className="audit-photo-preview" src={photo} alt={`Registro de ${item.equipment}`} />}</section>
    </main>
    <footer className="audit-wizard-footer"><button className="secondary-button" disabled={index === 0} onClick={() => openItem(index - 1)}><ChevronLeft size={18} /> Anterior</button><p>{Object.keys(answers).length} de {questions.length} respostas · {photo ? 'foto pronta' : 'foto pendente'}</p><button className="primary-button" disabled={!complete} onClick={next}>{index === start.items.length - 1 ? <><PenLine size={18} /> {isLadder ? 'Concluir checklist' : 'Continuar para assinatura'}</> : <>Próximo equipamento <ChevronRight size={18} /></>}</button></footer>
  </div>
}

function AuditSigning({ data, start, results, onCancel, onBack, onComplete }: { data: AppData; start: AuditStart; results: AuditItemResult[]; onCancel: () => void; onBack: () => void; onComplete: (audit: AuditRecord) => void }) {
  const [auditorSignature, setAuditorSignature] = useState<string | null>(null)
  const [auditedSignature, setAuditedSignature] = useState<string | null>(null)
  const [activeSigner, setActiveSigner] = useState<'auditor' | 'audited' | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const selfAudit = data.account.id === start.personId
  const ready = Boolean(auditorSignature) && (selfAudit || Boolean(auditedSignature))

  const finish = async () => {
    if (!ready || !auditorSignature) return
    setGenerating(true); setError('')
    const completedAt = new Date()
    const nextAuditDate = start.category === 'Escadas' ? oneWeekAfter(completedAt) : oneMonthAfter(completedAt)
    const safeName = start.personName.replace(/[^a-zA-ZÀ-ÿ0-9]+/g, ' ').trim().replace(/\s+/g, '-')
    const pdfFileName = `Relatório de Auditoria - ${start.category} - ${safeName} - ${todayDate()}.pdf`
    const record: AuditRecord = { id: crypto.randomUUID(), personId: start.personId, category: start.category, auditorName: data.account.name, auditedName: start.personName, scheduledDate: start.scheduledDate, nextAuditDate, startedAt: start.startedAt, completedAt: completedAt.toISOString(), pdfFileName, results }
    try {
      const pdfData = await createAuditPdf(record, auditorSignature, selfAudit ? undefined : auditedSignature ?? undefined)
      onComplete({ ...record, pdfData, results: results.map(result => ({ ...result, photo: '' })) })
    } catch {
      setError('Não foi possível gerar o PDF. Tente finalizar novamente.'); setGenerating(false)
    }
  }

  if (activeSigner) {
    const isAuditor = activeSigner === 'auditor'
    const signerName = isAuditor ? data.account.name : start.personName
    return <SignatureCapture signerName={signerName} signerRole={selfAudit ? 'Técnico responsável pela autoauditoria' : isAuditor ? 'Responsável pela auditoria' : 'Pessoa auditada'} onCancel={() => setActiveSigner(null)} onSave={signature => { if (isAuditor) setAuditorSignature(signature); else setAuditedSignature(signature); setActiveSigner(null) }} />
  }

  return <div className="full-screen-layer audit-signing-layer">
    <header className="form-page-header"><div><p className="eyebrow">Etapa final</p><h2>Assinaturas da auditoria</h2><p>{start.category} · {start.personName}</p></div><button className="icon-button" onClick={onCancel} aria-label="Cancelar auditoria"><X size={22} /></button></header>
    <main className="audit-signing-content">
      <section className="surface audit-signing-summary"><div className="section-heading"><div><p className="eyebrow">Resumo</p><h3>Auditoria pronta para finalizar</h3></div><CheckCircle2 size={23} /></div><div className="audit-parties"><div><span>Responsável</span><b>{data.account.name}</b></div><div><span>Pessoa auditada</span><b>{start.personName}</b></div><div><span>Equipamentos</span><b>{results.length}</b></div><div><span>Resultado</span><b>{auditSummaryStatus(start.category, results)}</b></div></div>{start.category === 'Escadas' && results.some(result => !result.approved) && <p className="ladder-restriction-banner">{ladderBlockedMessage}</p>}</section>
      <section className="surface signature-selector-card"><div className="section-heading"><div><p className="eyebrow">Assinatura obrigatória</p><h3>{selfAudit ? 'Assinatura do técnico' : 'Assinaturas dos responsáveis'}</h3></div><PenLine size={22} /></div>
        <button className={auditorSignature ? 'signature-select registered' : 'signature-select'} onClick={() => setActiveSigner('auditor')}><span>{selfAudit ? <UserCheck size={22} /> : <PenLine size={22} />}</span><div><b>{selfAudit ? start.personName : data.account.name}</b><small>{selfAudit ? 'Técnico responsável pela autoauditoria' : 'Responsável pela auditoria'}</small></div><strong>{auditorSignature ? 'Assinatura registrada' : 'Toque para assinar'}</strong><ChevronRight size={18} /></button>
        {!selfAudit && <button className={auditedSignature ? 'signature-select registered' : 'signature-select'} onClick={() => setActiveSigner('audited')}><span><UserCheck size={22} /></span><div><b>{start.personName}</b><small>Pessoa auditada</small></div><strong>{auditedSignature ? 'Assinatura registrada' : 'Toque para assinar'}</strong><ChevronRight size={18} /></button>}
      </section>
      {error && <p className="audit-final-error"><AlertTriangle size={17} />{error}</p>}
      <div className="audit-signing-actions"><button className="secondary-button" disabled={generating} onClick={onBack}>Voltar ao checklist</button><button className="secondary-button" disabled={generating} onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={!ready || generating} onClick={finish}>{generating ? 'Gerando PDF...' : <><FileDown size={18} /> Finalizar e salvar PDF</>}</button></div>
    </main>
  </div>
}

function SignatureCapture({ signerName, signerRole, onCancel, onSave }: { signerName: string; signerRole: string; onCancel: () => void; onSave: (signature: string) => void }) {
  const [signature, setSignature] = useState<string | null>(null)
  return <div className="full-screen-layer signature-capture-layer">
    <header className="form-page-header"><div><p className="eyebrow">Registrar assinatura</p><h2>{signerName}</h2><p>{signerRole}</p></div><button className="icon-button" onClick={onCancel} aria-label="Fechar assinatura"><X size={22} /></button></header>
    <main className="signature-capture-content"><section className="surface"><div className="section-heading"><div><p className="eyebrow">Use o dedo na tela</p><h3>Assine dentro do espaço abaixo</h3></div><PenLine size={23} /></div><SignaturePad label={`Assinatura de ${signerName}`} onChange={setSignature} /></section></main>
    <footer className="signature-capture-footer"><button className="secondary-button" onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={!signature} onClick={() => signature && onSave(signature)}><CheckCircle2 size={18} /> Registrar assinatura</button></footer>
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
  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => { drawing.current = true; canvasRef.current!.setPointerCapture(event.pointerId); const context = canvasRef.current!.getContext('2d')!; const current = point(event); context.beginPath(); context.moveTo(current.x, current.y) }
  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const context = canvasRef.current!.getContext('2d')!; const current = point(event); context.lineWidth = 2.4; context.lineCap = 'round'; context.strokeStyle = '#242729'; context.lineTo(current.x, current.y); context.stroke() }
  const stopDrawing = () => { if (drawing.current) onChange(canvasRef.current!.toDataURL('image/png')); drawing.current = false }
  const clear = () => { const canvas = canvasRef.current!; canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height); onChange(null) }
  return <div className="signature-wrap audit-signature-pad"><canvas ref={canvasRef} width="900" height="250" onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={stopDrawing} onPointerCancel={stopDrawing} /><span>{label}</span><button type="button" onClick={clear}>Limpar assinatura</button></div>
}

async function createAuditPdf(record: AuditRecord, responsibleSignature: string, auditedSignature?: string) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let logo = ''
  try { logo = await fetch(publicAsset('alert-logo.png')).then(response => response.blob()).then(blobToDataUrl) } catch { /* O título mantém o documento identificável. */ }
  const header = (title: string, subtitle: string) => {
    if (logo) pdf.addImage(logo, 'PNG', 15, 10, 44, 22)
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(48, 51, 54); pdf.text(title, 15, 42)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(112, 117, 122); pdf.text(subtitle, 15, 48)
    pdf.setDrawColor(245, 130, 0); pdf.setLineWidth(1); pdf.line(15, 53, 195, 53)
  }

  const approved = record.results.filter(result => result.approved).length
  const resultStatus = auditSummaryStatus(record.category, record.results)
  header(`Relatório de Auditoria de ${record.category}`, 'GIO — Gestão Integrada de Operações')
  const summary = [
    ['Auditor', record.auditorName], ['Pessoa auditada', record.auditedName],
    ['Data agendada', record.scheduledDate ? new Date(`${record.scheduledDate}T12:00:00`).toLocaleDateString('pt-BR') : 'Não registrado'],
    ['Início', new Date(record.startedAt).toLocaleString('pt-BR')], ['Conclusão', new Date(record.completedAt).toLocaleString('pt-BR')],
    ['Próxima auditoria', new Date(`${record.nextAuditDate}T12:00:00`).toLocaleDateString('pt-BR')],
    ['Resultado geral', resultStatus],
    ['Equipamentos aprovados', `${approved} de ${record.results.length}`],
  ]
  let y = 66
  pdf.setFontSize(10)
  summary.forEach(([label, value]) => { pdf.setFont('helvetica', 'bold'); pdf.setTextColor(70, 73, 76); pdf.text(`${label}:`, 15, y); pdf.setFont('helvetica', 'normal'); const lines = pdf.splitTextToSize(value, 120) as string[]; pdf.text(lines, 75, y); y += Math.max(9, lines.length * 4.5 + 3) })
  y += 5
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text('Resumo dos equipamentos', 15, y); y += 8
  record.results.forEach((result, index) => {
    if (y > 276) { pdf.addPage(); header('Resumo dos equipamentos', `${record.auditedName} · continuação`); y = 65 }
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(48, 51, 54); pdf.text(`${index + 1}. ${result.equipment}`, 15, y)
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(result.approved ? 35 : 157, result.approved ? 107 : 51, result.approved ? 58 : 46); pdf.text(auditItemStatus(record.category, result.approved).toUpperCase(), 155, y); y += 8
  })

  record.results.forEach((result, itemIndex) => {
    const isLadder = record.category === 'Escadas'
    const itemTitle = `${itemIndex + 1}. ${result.equipment}`
    const itemSubtitle = `Código ${result.code || 'não informado'} · ${auditItemStatus(record.category, result.approved)}`
    pdf.addPage(); header(itemTitle, itemSubtitle)
    let questionY = 65
    result.answers.forEach((answer, answerIndex) => {
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal')
      const lines = pdf.splitTextToSize(`${answerIndex + 1}. ${answer.question}`, isLadder ? 130 : 88) as string[]
      const height = Math.max(10, lines.length * 4 + 4)
      if (questionY + height > 275) { pdf.addPage(); header(itemTitle, `${itemSubtitle} · continuação`); questionY = 65; pdf.setFontSize(8) }
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(55, 58, 60); pdf.text(lines, 15, questionY)
      const negative = auditAnswerIsNegative(answer.answer)
      const neutral = answer.answer === 'Não aplicável'
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(neutral ? 90 : negative ? 157 : 35, neutral ? 90 : negative ? 51 : 107, neutral ? 90 : negative ? 46 : 58); pdf.text(auditAnswerLabel(answer.answer).toUpperCase(), isLadder ? 154 : 106, questionY)
      questionY += height
    })
    if (result.photo && !isLadder) {
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(70, 73, 76); pdf.text('Evidência fotográfica', 121, 64)
      addContainedImage(pdf, result.photo, 121, 70, 74, 82)
    }
    let detailY = isLadder ? questionY + 7 : Math.max(questionY + 7, 166)
    const details = [['Identificador atual', result.currentIdentifier || result.code || 'Não informado'], ['Novo identificador', result.newIdentifier || 'Não informado'], ['Observação', result.observation || 'Sem observações']]
    if (result.restrictionReason) details.push(['Restrição de uso', result.restrictionReason])
    details.forEach(([label, value]) => {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(55, 58, 60)
      const lines = pdf.splitTextToSize(`${label}: ${value}`, 180) as string[]
      lines.forEach(line => {
        if (detailY > 278) { pdf.addPage(); header('Identificação e observação', result.equipment); detailY = 65; pdf.setFontSize(9); pdf.setTextColor(55, 58, 60) }
        pdf.text(line, 15, detailY); detailY += 4.5
      })
      detailY += 3
    })
    if (result.photo && isLadder) {
      if (detailY + 84 > 278) { pdf.addPage(); header('Evidência fotográfica', itemTitle); detailY = 65 }
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.text('Foto da escada', 15, detailY)
      addContainedImage(pdf, result.photo, 15, detailY + 6, 100, 74)
    }
  })

  pdf.addPage(); header('Conclusão da auditoria', `${record.category} · ${record.auditedName}`)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(55, 58, 60); pdf.text(`Resultado: ${resultStatus.toUpperCase()}`, 15, 68)
  pdf.setFontSize(10); pdf.text(`Auditor responsável: ${record.auditorName}`, 15, 82)
  pdf.text(`Pessoa auditada: ${record.auditedName}`, 15, 93)
  pdf.text(`Equipamentos aprovados: ${approved} de ${record.results.length}`, 15, 104)
  pdf.text(`Próxima auditoria: ${new Date(`${record.nextAuditDate}T12:00:00`).toLocaleDateString('pt-BR')}`, 15, 115)
  pdf.setFontSize(9); pdf.text(`Assinatura do responsável: ${record.auditorName}`, 15, 137)
  pdf.addImage(responsibleSignature, 'PNG', 15, 143, 78, 28); pdf.setDrawColor(120, 124, 126); pdf.line(15, 173, 93, 173)
  if (auditedSignature) { pdf.text(`Assinatura da pessoa auditada: ${record.auditedName}`, 108, 137); pdf.addImage(auditedSignature, 'PNG', 108, 143, 78, 28); pdf.line(108, 173, 186, 173) }
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(112, 117, 122); pdf.text(`Documento gerado em ${new Date(record.completedAt).toLocaleString('pt-BR')}.`, 15, 190)
  if (record.category === 'Escadas' && record.results.some(result => !result.approved)) { pdf.setFontSize(10); pdf.setTextColor(157, 51, 46); pdf.text(pdf.splitTextToSize(ladderBlockedMessage, 180), 15, 205) }
  const pdfData = pdf.output('datauristring')
  pdf.save(record.pdfFileName)
  return pdfData
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
