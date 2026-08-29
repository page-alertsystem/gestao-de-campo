import { ChangeEvent, useMemo, useState } from 'react'
import { CalendarDays, Camera, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, ListChecks, ShieldCheck, Wrench, X } from 'lucide-react'
import type { AppData, AuditCategory, AuditItemResult, AuditRecord, InventoryItem } from './store'

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

export type AuditStart = { category: AuditCategory; nextAuditDate: string; items: InventoryItem[]; startedAt: string }

function itemsForAudit(data: AppData, category: AuditCategory) {
  const totals = new Map<string, number>()
  data.stockAssignments.filter(item => item.personId === data.account.id && item.status === 'Aprovado e retirado').forEach(item => totals.set(item.inventoryItemId, (totals.get(item.inventoryItemId) ?? 0) + item.quantity))
  data.materialUsages.filter(item => item.personId === data.account.id).forEach(item => totals.set(item.inventoryItemId, (totals.get(item.inventoryItemId) ?? 0) - item.quantity))
  return data.inventory.filter(item => {
    const matches = category === 'Ferramentas' ? item.category.includes('Ferramenta') : category === 'EPIs' ? item.category === 'EPI' : item.category === 'Escada'
    return matches && (totals.get(item.id) ?? 0) > 0
  })
}

export function AuditPage({ data, onStart }: { data: AppData; onStart: (start: AuditStart) => void }) {
  const categories: { id: AuditCategory; label: string; description: string; icon: typeof Wrench }[] = [
    { id: 'Ferramentas', label: 'Ferramentas', description: 'Condição, funcionamento e segurança das ferramentas.', icon: Wrench },
    { id: 'EPIs', label: 'EPIs', description: 'Conservação e aprovação dos equipamentos de proteção.', icon: ShieldCheck },
    { id: 'Escadas', label: 'Escadas', description: 'Estabilidade, degraus, fixações e travas de segurança.', icon: ListChecks },
  ]
  const [category, setCategory] = useState<AuditCategory>('Ferramentas')
  const latest = (type: AuditCategory) => [...data.audits].filter(item => item.personId === data.account.id && item.category === type).sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0]
  const [dates, setDates] = useState<Record<AuditCategory, string>>({ Ferramentas: latest('Ferramentas')?.nextAuditDate ?? '', EPIs: latest('EPIs')?.nextAuditDate ?? '', Escadas: latest('Escadas')?.nextAuditDate ?? '' })
  const items = itemsForAudit(data, category)
  const selected = categories.find(item => item.id === category)!
  const SelectedIcon = selected.icon

  return <>
    <section className="page-intro"><div><p className="eyebrow">Gestão de segurança</p><h2>Auditorias</h2><p>Confira todos os equipamentos da categoria em uma sequência simples, item por item.</p></div></section>
    <section className="audit-category-grid">{categories.map(item => { const Icon = item.icon; const next = latest(item.id)?.nextAuditDate; return <button className={category === item.id ? 'audit-category-card active' : 'audit-category-card'} key={item.id} onClick={() => setCategory(item.id)}><span><Icon size={23} /></span><div><b>{item.label}</b><small>{next ? `Próxima: ${new Date(`${next}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Sem próxima data definida'}</small></div><ChevronRight size={18} /></button> })}</section>

    <section className="surface audit-overview">
      <div className="section-heading"><div><p className="eyebrow">{items.length} {items.length === 1 ? 'item disponível' : 'itens disponíveis'}</p><h3>Auditoria de {selected.label}</h3><p className="audit-description">{selected.description}</p></div><span className="audit-heading-icon"><SelectedIcon size={24} /></span></div>
      <label className="next-audit-field"><CalendarDays size={19} /><span>Data da próxima auditoria</span><input type="date" min={new Date().toISOString().slice(0, 10)} value={dates[category]} onChange={event => setDates({ ...dates, [category]: event.target.value })} /></label>
      <div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Código</th><th>Marca / modelo</th><th>Categoria</th></tr></thead><tbody>{items.length ? items.map(item => <tr key={item.id}><td>{item.equipment}</td><td>{item.code || '—'}</td><td>{[item.brand, item.model].filter(Boolean).join(' / ') || '—'}</td><td>{item.category}</td></tr>) : <tr><td colSpan={4} className="table-empty">Nenhum item desta categoria está no seu estoque pessoal.</td></tr>}</tbody></table></div>
      <div className="audit-start-row"><p><ClipboardCheck size={17} />A auditoria abrirá um item por vez e solicitará checklist e foto.</p><button className="primary-button" disabled={!items.length || !dates[category]} onClick={() => onStart({ category, nextAuditDate: dates[category], items, startedAt: new Date().toISOString() })}>Iniciar auditoria <ChevronRight size={18} /></button></div>
    </section>
  </>
}

export function AuditWizard({ data, start, onCancel, onComplete }: { data: AppData; start: AuditStart; onCancel: () => void; onComplete: (audit: AuditRecord) => void }) {
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<AuditItemResult[]>([])
  const [answers, setAnswers] = useState<Record<number, boolean>>({})
  const [photo, setPhoto] = useState('')
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
      onComplete({ id: crypto.randomUUID(), personId: data.account.id, category: start.category, nextAuditDate: start.nextAuditDate, startedAt: start.startedAt, completedAt: new Date().toISOString(), results: nextResults })
      return
    }
    setResults(nextResults); setIndex(current => current + 1); setAnswers({}); setPhoto('')
  }

  return <div className="full-screen-layer audit-wizard-layer">
    <header className="form-page-header"><div><p className="eyebrow">Auditoria de {start.category}</p><h2>{item.equipment}</h2><p>Item {index + 1} de {start.items.length} · código {item.code || 'não informado'}</p></div><button className="icon-button" onClick={onCancel} aria-label="Fechar auditoria"><X size={22} /></button></header>
    <div className="audit-progress"><span style={{ width: `${((index + 1) / start.items.length) * 100}%` }} /></div>
    <main className="audit-wizard-content">
      <section className="surface audit-item-info"><div><span>Equipamento</span><b>{item.equipment}</b></div><div><span>Marca / modelo</span><b>{[item.brand, item.model].filter(Boolean).join(' / ') || 'Não informado'}</b></div><div><span>Próxima auditoria</span><b>{new Date(`${start.nextAuditDate}T12:00:00`).toLocaleDateString('pt-BR')}</b></div></section>
      <section className="surface audit-checklist"><div className="section-heading"><div><p className="eyebrow">Checklist obrigatório</p><h3>Condições do equipamento</h3></div><ListChecks size={22} /></div>{questions.map((question, questionIndex) => <div className="audit-question" key={question}><p><b>{questionIndex + 1}.</b> {question}</p><div><button className={answers[questionIndex] === true ? 'answer-button yes active' : 'answer-button yes'} onClick={() => setAnswers({ ...answers, [questionIndex]: true })}>Sim</button><button className={answers[questionIndex] === false ? 'answer-button no active' : 'answer-button no'} onClick={() => setAnswers({ ...answers, [questionIndex]: false })}>Não</button></div></div>)}</section>
      <section className="surface audit-photo-section"><div className="section-heading"><div><p className="eyebrow">Evidência obrigatória</p><h3>Foto do equipamento</h3></div><Camera size={22} /></div><label className={photo ? 'audit-photo-field filled' : 'audit-photo-field'}><Camera size={28} /><b>{photo ? 'Foto adicionada' : 'Abrir câmera'}</b><small>{photo ? 'Toque para substituir a foto' : 'Registre a condição atual do equipamento'}</small><input type="file" accept="image/*" capture="environment" onChange={choosePhoto} /></label>{photo && <img className="audit-photo-preview" src={photo} alt={`Registro de ${item.equipment}`} />}</section>
    </main>
    <footer className="audit-wizard-footer"><button className="secondary-button" disabled={index === 0} onClick={() => { const previous = results[index - 1]; if (!previous) return; setIndex(current => current - 1); setResults(current => current.slice(0, -1)); setAnswers(Object.fromEntries(previous.answers.map((answer, answerIndex) => [answerIndex, answer.answer]))); setPhoto(previous.photo) }}><ChevronLeft size={18} /> Anterior</button><p>{Object.keys(answers).length} de {questions.length} respostas · {photo ? 'foto pronta' : 'foto pendente'}</p><button className="primary-button" disabled={!complete} onClick={next}>{index === start.items.length - 1 ? <><CheckCircle2 size={18} /> Concluir auditoria</> : <>Próximo equipamento <ChevronRight size={18} /></>}</button></footer>
  </div>
}
