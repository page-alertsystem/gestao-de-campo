import type { AppData, AuditAnswer, AuditCategory, AuditItemResult } from './store'

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

// Restriction is saved immediately, independently of the signed audit. Closing
// the wizard or changing an answer cannot silently release the same ladder.
export function restrictLadder(data: AppData, itemId: string, personId: string, question: string, reportedAt = new Date().toISOString()): AppData {
  return { ...data, inventory: data.inventory.map(item => {
    if (item.id !== itemId || item.category !== 'Escada') return item
    const previous = item.ladderRestriction
    return { ...item, ladderRestriction: {
      status: 'Não liberada', reportedAt: previous?.reportedAt ?? reportedAt,
      personId: previous?.personId ?? personId, reportedBy: previous?.reportedBy ?? data.account.name,
      questions: [...new Set([...(previous?.questions ?? []), question])],
    } }
  }) }
}
