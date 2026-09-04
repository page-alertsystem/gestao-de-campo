import type { AppData, AuditAnswer, AuditCategory, AuditItemResult, AuditRecord } from './store'

export const ladderQuestions = [
  'A escada está em bom estado de conservação? (degraus, montantes laterais, ausência de trincas, deformações, corrosão, parafusos fixos e funcionamento adequado)',
  'A escada possui TAG de identificação?',
  'A escada está isenta de óleo ou algum produto químico derrapante? Há presença de umidade, graxa ou sujeira que comprometa o uso?',
  'As sapatas estão íntegras, antiderrapantes e com boa aderência?',
  'A escada está estável e adequada para uso no local?',
  'A escada é de material não condutivo (fibra de vidro)?',
  'A escada possui ponto de amarração adequado? Está sendo utilizada com fixação segura (topo/base)?',
  'A escada é adequada para o tipo de atividade a ser realizada?',
  'A escada é extensível? Se sim: possui limitador de curso? Possui cordas para amarração?',
  'A escada é de abrir? Se sim: possui limitador?',
  'A escada possui rodas? Se sim: possui travamento das rodas?',
  'A escada é plataforma? Se sim: se for tipo rampa, possui guarda-corpo na rampa e na plataforma?',
]

export const ladderAnswerOptions = ['Conforme', 'Não conforme', 'Não aplicável'] as const
export const ladderBlockedMessage = 'Escada não liberada. Favor entrar em contato com seu gestor e solicitar a substituição.'
export function auditAnswerLabel(answer: AuditAnswer) { return typeof answer === 'boolean' ? answer ? 'Sim' : 'Não' : answer }
export function auditAnswerIsNegative(answer: AuditAnswer) { return answer === false || answer === 'Não conforme' }
export function auditItemStatus(category: AuditCategory, approved: boolean) { return category === 'Escadas' ? approved ? 'Liberada' : 'Não liberada' : approved ? 'Aprovado' : 'Não aprovado' }
export function auditSummaryStatus(category: AuditCategory, results: AuditItemResult[]) {
  const approved = results.length > 0 && results.every(result => result.approved)
  return category === 'Escadas' ? approved ? 'Liberada' : 'Não liberada' : approved ? 'Aprovada' : 'Com ressalvas'
}

export function ladderIsApproved(answers: Record<number, AuditAnswer>, restricted: boolean) {
  return !restricted && ladderQuestions.every((_, index) => answers[index] === 'Conforme' || answers[index] === 'Não aplicável')
}

export function ladderNonConformities(result: AuditItemResult) {
  return result.answers.filter(entry => entry.answer === 'Não conforme').map(entry => entry.question)
}

// Draft selections have no side effects. Persist the signed audit and its
// confirmed restrictions together, without changing earlier recorded blocks.
export function recordCompletedAudit(data: AppData, audit: AuditRecord): AppData {
  if (data.audits.some(entry => entry.id === audit.id)) return data
  const inventory = audit.category !== 'Escadas' ? data.inventory : data.inventory.map(item => {
    if (item.category !== 'Escada') return item
    const result = audit.results.find(entry => entry.inventoryItemId === item.id)
    const questions = result ? ladderNonConformities(result) : []
    if (!questions.length) return item
    const previous = item.ladderRestriction
    return { ...item, ladderRestriction: {
      status: 'Não liberada' as const, reportedAt: previous?.reportedAt ?? audit.completedAt,
      personId: previous?.personId ?? audit.personId, reportedBy: previous?.reportedBy ?? audit.auditorName,
      questions: [...new Set([...(previous?.questions ?? []), ...questions])],
    } }
  })
  return { ...data, inventory, audits: [...data.audits, audit] }
}
