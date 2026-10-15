export const profileNames = [
  'Técnico',
  'RH',
  'Logística',
  'Estoque',
  'Auditoria',
  'Service Desk',
  'Implantação',
  'Manutenção',
  'TST',
  'Administrador',
] as const

export type ProfileName = typeof profileNames[number]

export type Page =
  | 'inicio'
  | 'atendimento-preventiva'
  | 'operacao-km' | 'operacao-dia' | 'operacao-ponto' | 'operacao-apr' | 'operacao-retorno'
  | 'gestao-auditoria' | 'gestao-aprovacao-equipamentos' | 'gestao-levantamento'
  | 'pessoal-ferramentas' | 'pessoal-epis' | 'pessoal-aprovacoes'
  | 'estoque-solicitacoes-equipamentos' | 'estoque-baixas' | 'estoque-gerenciamento'
  | 'manutencao-rma' | 'manutencao-danificados'
  | 'documentos-auditorias' | 'documentos-troca-veiculo' | 'documentos-aprs'
  | 'relatorios-km' | 'relatorios-registro-dia' | 'relatorios-ponto' | 'relatorios-auditoria'
  | 'relatorios-ferramentas' | 'relatorios-epis'
  | 'relatorios-baixas' | 'relatorios-rma' | 'relatorios-levantamentos'
  | 'relatorios-preventivas'
  | 'configuracoes'

export const profileDescriptions: Record<ProfileName, string> = {
  'Técnico': 'Atendimento preventivo, operação, APR aprovada, ferramentas, EPIs, aprovações, auditoria semanal da própria escada e solicitação de RMA.',
  'RH': 'Acesso do técnico mais relatórios de registro do dia e ponto esquecido.',
  'Logística': 'Acesso do técnico mais consulta ao relatório de quilometragem.',
  'Estoque': 'Acesso do técnico mais solicitações de equipamentos, devoluções, ferramentas rotativas e relatórios do estoque.',
  'Auditoria': 'Acesso do técnico mais auditorias completas de ferramentas, EPIs e escadas.',
  'Service Desk': 'Acesso do técnico mais solicitações de levantamento e consulta das preventivas e levantamentos.',
  'Implantação': 'Acesso do técnico mais solicitações de levantamento e consulta das preventivas e levantamentos.',
  'Manutenção': 'Acesso do técnico mais recebimento de equipamentos danificados e relatório de RMA.',
  'TST': 'Acesso do técnico, APR aprovada e aprovação de baixas e solicitações de ferramentas e EPIs.',
  'Administrador': 'Acesso total a todas as funções, configurações, relatórios e documentos.',
}

const technicianPages: Page[] = [
  'inicio',
  'atendimento-preventiva',
  'operacao-km', 'operacao-dia', 'operacao-ponto', 'operacao-apr', 'operacao-retorno',
  'pessoal-ferramentas', 'pessoal-epis', 'pessoal-aprovacoes',
  'gestao-auditoria',
  'manutencao-rma',
]

const profilePages: Record<ProfileName, Page[]> = {
  'Técnico': technicianPages,
  'RH': ['relatorios-registro-dia', 'relatorios-ponto'],
  'Logística': ['relatorios-km'],
  'Estoque': [
    'estoque-solicitacoes-equipamentos', 'estoque-baixas', 'estoque-gerenciamento',
    'relatorios-baixas', 'relatorios-epis', 'relatorios-ferramentas',
  ],
  'Auditoria': ['gestao-auditoria'],
  'Service Desk': ['gestao-levantamento', 'relatorios-levantamentos', 'relatorios-preventivas'],
  'Implantação': ['gestao-levantamento', 'relatorios-levantamentos', 'relatorios-preventivas'],
  'Manutenção': ['manutencao-rma', 'manutencao-danificados', 'relatorios-rma'],
  'TST': ['gestao-aprovacao-equipamentos'],
  'Administrador': [
    'inicio',
    'atendimento-preventiva',
    'operacao-km', 'operacao-dia', 'operacao-ponto', 'operacao-apr', 'operacao-retorno',
    'gestao-auditoria', 'gestao-aprovacao-equipamentos', 'gestao-levantamento',
    'pessoal-ferramentas', 'pessoal-epis', 'pessoal-aprovacoes',
    'estoque-solicitacoes-equipamentos', 'estoque-baixas', 'estoque-gerenciamento',
    'manutencao-rma', 'manutencao-danificados',
    'documentos-auditorias', 'documentos-troca-veiculo', 'documentos-aprs',
    'relatorios-km', 'relatorios-registro-dia', 'relatorios-ponto', 'relatorios-auditoria',
    'relatorios-ferramentas', 'relatorios-epis',
    'relatorios-baixas', 'relatorios-rma', 'relatorios-levantamentos', 'relatorios-preventivas',
    'configuracoes',
  ],
}

const legacyProfiles: Record<string, ProfileName> = {
  'Técnico de Campo': 'Técnico',
  'Auditor': 'Auditoria',
  'Segurança do Trabalho': 'TST',
  'Seg. Trabalho': 'TST',
  'RMA': 'Manutenção',
}

export function normalizeProfiles(groups: string[] | undefined): ProfileName[] {
  const normalized = (groups ?? []).map(group => legacyProfiles[group] ?? group).filter((group): group is ProfileName => profileNames.includes(group as ProfileName))
  const unique = Array.from(new Set(normalized))
  if (unique.includes('Administrador')) return unique
  return ['Técnico', ...unique.filter(group => group !== 'Técnico')]
}

export function allowedPagesForProfiles(groups: string[] | undefined) {
  const profiles = normalizeProfiles(groups)
  const allowed = new Set<Page>()
  const effectiveProfiles = profiles.includes('Administrador') ? ['Administrador' as const] : profiles
  effectiveProfiles.forEach(profile => profilePages[profile].forEach(page => allowed.add(page)))
  return allowed
}

export function hasProfile(groups: string[] | undefined, profile: ProfileName) {
  const normalized = normalizeProfiles(groups)
  return normalized.includes('Administrador') || normalized.includes(profile)
}

export function profileSummary(groups: string[] | undefined) {
  const profiles = normalizeProfiles(groups)
  if (profiles.includes('Administrador')) return 'Administrador'
  return profiles.filter(profile => profile !== 'Técnico').join(', ') || 'Técnico'
}
