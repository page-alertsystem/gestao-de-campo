export const profileNames = [
  'Técnico',
  'RH',
  'Logística',
  'Estoque',
  'Auditoria',
  'Service Desk',
  'Implantação',
  'Manutenção',
  'Administrador',
] as const

export type ProfileName = typeof profileNames[number]

export type Page =
  | 'inicio'
  | 'operacao-km' | 'operacao-dia' | 'operacao-ponto'
  | 'gestao-auditoria' | 'gestao-solicitacoes' | 'gestao-levantamento'
  | 'pessoal-ferramentas' | 'pessoal-insumos' | 'pessoal-epis' | 'pessoal-aprovacoes'
  | 'estoque-pedidos' | 'estoque-baixas' | 'estoque-gerenciamento'
  | 'manutencao-rma' | 'manutencao-danificados'
  | 'documentos-auditorias' | 'documentos-troca-veiculo'
  | 'relatorios-km' | 'relatorios-registro-dia' | 'relatorios-ponto' | 'relatorios-auditoria'
  | 'relatorios-solicitacoes' | 'relatorios-ferramentas' | 'relatorios-epis' | 'relatorios-insumos'
  | 'relatorios-baixas' | 'relatorios-rma' | 'relatorios-levantamentos'
  | 'configuracoes'

export const profileDescriptions: Record<ProfileName, string> = {
  'Técnico': 'Operação, estoque pessoal, aprovações, auditoria semanal da própria escada e solicitação de RMA.',
  'RH': 'Acesso do técnico mais relatórios de registro do dia e ponto esquecido.',
  'Logística': 'Acesso do técnico mais consulta ao relatório de quilometragem.',
  'Estoque': 'Acesso do técnico mais pedidos, baixas, gerenciamento e relatórios do estoque.',
  'Auditoria': 'Acesso do técnico mais auditorias completas de ferramentas, EPIs e escadas.',
  'Service Desk': 'Acesso do técnico mais solicitações ao estoque, levantamentos e relatório de levantamentos.',
  'Implantação': 'Acesso do técnico mais solicitações ao estoque, levantamentos e relatório de levantamentos.',
  'Manutenção': 'Acesso do técnico mais recebimento de equipamentos danificados e relatório de RMA.',
  'Administrador': 'Acesso total a todas as funções, configurações, relatórios e documentos.',
}

const technicianPages: Page[] = [
  'inicio',
  'operacao-km', 'operacao-dia', 'operacao-ponto',
  'pessoal-ferramentas', 'pessoal-insumos', 'pessoal-epis', 'pessoal-aprovacoes',
  'gestao-auditoria',
  'manutencao-rma',
]

const profilePages: Record<ProfileName, Page[]> = {
  'Técnico': technicianPages,
  'RH': ['relatorios-registro-dia', 'relatorios-ponto'],
  'Logística': ['relatorios-km'],
  'Estoque': [
    'estoque-pedidos', 'estoque-baixas', 'estoque-gerenciamento',
    'relatorios-baixas', 'relatorios-insumos', 'relatorios-epis', 'relatorios-ferramentas', 'relatorios-solicitacoes',
  ],
  'Auditoria': ['gestao-auditoria'],
  'Service Desk': ['gestao-solicitacoes', 'gestao-levantamento', 'relatorios-levantamentos'],
  'Implantação': ['gestao-solicitacoes', 'gestao-levantamento', 'relatorios-levantamentos'],
  'Manutenção': ['manutencao-rma', 'manutencao-danificados', 'relatorios-rma'],
  'Administrador': [
    'inicio',
    'operacao-km', 'operacao-dia', 'operacao-ponto',
    'gestao-auditoria', 'gestao-solicitacoes', 'gestao-levantamento',
    'pessoal-ferramentas', 'pessoal-insumos', 'pessoal-epis', 'pessoal-aprovacoes',
    'estoque-pedidos', 'estoque-baixas', 'estoque-gerenciamento',
    'manutencao-rma', 'manutencao-danificados',
    'documentos-auditorias', 'documentos-troca-veiculo',
    'relatorios-km', 'relatorios-registro-dia', 'relatorios-ponto', 'relatorios-auditoria',
    'relatorios-solicitacoes', 'relatorios-ferramentas', 'relatorios-epis', 'relatorios-insumos',
    'relatorios-baixas', 'relatorios-rma', 'relatorios-levantamentos',
    'configuracoes',
  ],
}

const legacyProfiles: Record<string, ProfileName> = {
  'Técnico de Campo': 'Técnico',
  'Auditor': 'Auditoria',
  'Segurança do Trabalho': 'Auditoria',
  'Seg. Trabalho': 'Auditoria',
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
