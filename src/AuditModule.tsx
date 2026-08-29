import { ChangeEvent, useState } from 'react'
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

export function AuditWizard({ start, onCancel, onComplete }: { start: AuditStart; onCancel: () => void; onComplete: (audit: AuditRecord) => void }) {
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
      const completedAt = new Date()
      onComplete({ id: crypto.randomUUID(), personId: start.personId, category: start.category, nextAuditDate: start.category === 'Escadas' ? oneWeekAfter(completedAt) : oneMonthAfter(completedAt), startedAt: start.startedAt, completedAt: completedAt.toISOString(), results: nextResults })
      return
    }
    setResults(nextResults); setIndex(current => current + 1); setAnswers({}); setPhoto('')
  }

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
