import { useMemo, useState } from 'react'
import { Check, Search, ShieldCheck, X } from 'lucide-react'

const departments = [
  'Técnico de Campo', 'RH', 'Financeiro', 'Logística', 'Estoque',
  'Service Desk', 'Implantação', 'Auditor', 'Segurança do Trabalho',
]

const groups = [
  { name: 'Pessoas e acessos', permissions: ['Visualizar pessoas', 'Cadastrar pessoas', 'Editar pessoas', 'Ativar ou desativar pessoas', 'Criar senha provisória', 'Redefinir senha', 'Atribuir grupos de acesso', 'Visualizar grupos', 'Editar matriz de permissões', 'Visualizar histórico de acessos'] },
  { name: 'Clientes', permissions: ['Visualizar clientes', 'Cadastrar clientes', 'Editar clientes', 'Excluir clientes', 'Visualizar localização dos clientes', 'Exportar clientes'] },
  { name: 'Veículos', permissions: ['Visualizar veículos', 'Cadastrar veículos', 'Editar veículos', 'Excluir veículos', 'Visualizar quilometragem atual', 'Visualizar rodízio', 'Visualizar histórico do veículo', 'Exportar veículos'] },
  { name: 'Trajetos', permissions: ['Registrar início de deslocamento', 'Registrar encontro', 'Registrar desencontro', 'Registrar chegada em casa', 'Visualizar próprios registros do dia', 'Visualizar registros de todos', 'Visualizar localização protegida', 'Visualizar horário real do envio', 'Exportar trajetos'] },
  { name: 'Ponto esquecido', permissions: ['Registrar ponto esquecido', 'Visualizar próprios avisos', 'Visualizar avisos de todos', 'Visualizar localização e horário reais', 'Marcar aviso como analisado', 'Adicionar parecer', 'Exportar pontos esquecidos'] },
  { name: 'Estoque central', permissions: ['Visualizar estoque central', 'Cadastrar item', 'Editar item', 'Excluir item', 'Ajustar saldo', 'Visualizar alertas de estoque mínimo', 'Visualizar alertas de saldo negativo', 'Visualizar movimentações', 'Exportar estoque central'] },
  { name: 'Estoque do técnico', permissions: ['Visualizar próprio estoque', 'Visualizar estoque de outros técnicos', 'Utilizar insumo', 'Informar cliente de utilização', 'Alterar status de ferramenta', 'Solicitar devolução', 'Transferir responsabilidade', 'Confirmar transferência', 'Registrar item danificado', 'Exportar estoque do técnico'] },
  { name: 'Solicitações', permissions: ['Criar solicitação', 'Visualizar solicitações próprias', 'Visualizar todas as solicitações', 'Editar até a separação', 'Cancelar solicitação', 'Marcar pedido recebido', 'Marcar em separação', 'Marcar aguardando retirada', 'Marcar enviado', 'Informar entrega parcial', 'Confirmar recebimento', 'Registrar divergência', 'Visualizar divergências', 'Exportar solicitações'] },
  { name: 'Auditoria de ferramentas', permissions: ['Iniciar auditoria de ferramentas', 'Visualizar auditorias de ferramentas', 'Responder checklist de ferramentas', 'Definir próxima auditoria', 'Assinar como auditor', 'Assinar como técnico', 'Aprovar ferramenta', 'Indicar manutenção', 'Bloquear ferramenta', 'Liberar ferramenta', 'Gerar PDF de ferramentas', 'Exportar auditorias de ferramentas'] },
  { name: 'EPIs', permissions: ['Visualizar EPIs', 'Cadastrar tipo de EPI', 'Editar EPI', 'Registrar entrega de EPI', 'Confirmar recebimento de EPI', 'Assinar termo de entrega', 'Visualizar validade e CA', 'Bloquear EPI', 'Liberar EPI', 'Registrar substituição', 'Gerar termo de responsabilidade', 'Exportar EPIs'] },
  { name: 'Auditoria de EPIs', permissions: ['Iniciar auditoria de EPI', 'Visualizar auditorias de EPI', 'Responder checklist de EPI', 'Definir próxima auditoria de EPI', 'Aprovar EPI', 'Aprovar EPI com observação', 'Indicar substituição de EPI', 'Bloquear uso de EPI', 'Liberar EPI', 'Gerar PDF de auditoria de EPI', 'Exportar auditorias de EPI'] },
  { name: 'Quilometragem', permissions: ['Registrar quilometragem', 'Visualizar própria quilometragem do dia', 'Visualizar registros de KM de todos', 'Visualizar histórico de KM do veículo', 'Registrar troca de condutor', 'Registrar avarias', 'Gerar PDF da troca', 'Visualizar dados escritos da troca', 'Exportar relatório de KM'] },
  { name: 'Notificações', permissions: ['Receber notificações', 'Visualizar notificações', 'Visualizar histórico de notificações', 'Visualizar alertas de saldo', 'Visualizar alertas de auditoria', 'Visualizar alertas de solicitações', 'Visualizar alertas de ponto esquecido'] },
  { name: 'Relatórios', permissions: ['Visualizar relatórios de trajetos', 'Exportar trajetos para Excel', 'Visualizar relatórios de ponto', 'Exportar pontos para Excel', 'Visualizar relatórios de KM', 'Exportar KM para Excel', 'Visualizar relatórios de estoque', 'Exportar estoque para Excel', 'Visualizar relatórios de solicitações', 'Exportar solicitações para Excel', 'Visualizar relatórios de auditoria', 'Exportar auditorias para Excel', 'Visualizar histórico de ações'] },
]

const defaultEnabled = new Set([
  'Técnico de Campo::Registrar início de deslocamento', 'Técnico de Campo::Registrar encontro',
  'Técnico de Campo::Registrar desencontro', 'Técnico de Campo::Registrar chegada em casa',
  'Técnico de Campo::Registrar ponto esquecido', 'Técnico de Campo::Visualizar próprios registros do dia',
  'Técnico de Campo::Visualizar próprio estoque', 'Técnico de Campo::Criar solicitação',
  'Técnico de Campo::Registrar quilometragem', 'RH::Visualizar avisos de todos',
  'RH::Adicionar parecer', 'Estoque::Visualizar estoque central', 'Estoque::Cadastrar item',
  'Estoque::Visualizar todas as solicitações', 'Auditor::Iniciar auditoria de ferramentas',
  'Auditor::Iniciar auditoria de EPI', 'Segurança do Trabalho::Visualizar EPIs',
])

export function PermissionMatrix({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [query, setQuery] = useState('')
  const [enabled, setEnabled] = useState(defaultEnabled)
  const filtered = useMemo(() => groups.map(group => ({
    ...group,
    permissions: group.permissions.filter(permission => `${group.name} ${permission}`.toLowerCase().includes(query.toLowerCase())),
  })).filter(group => group.permissions.length), [query])

  const toggle = (department: string, permission: string) => {
    const key = `${department}::${permission}`
    setEnabled(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return <div className="matrix-page">
    <div className="matrix-header">
      <div><p className="eyebrow">Configurações</p><h2>Matriz de permissões</h2><p>Marque as ações permitidas para cada departamento. O Administrador sempre possui acesso total.</p></div>
      <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={21} /></button>
    </div>
    <div className="matrix-toolbar">
      <label className="search-field"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar funcionalidade" /></label>
      <div className="matrix-legend"><span className="permission on"><Check size={13} /></span> Permitido <span className="permission" /> Sem acesso</div>
    </div>
    <div className="matrix-table-wrap">
      <table className="matrix-table"><thead><tr><th>Funcionalidade</th>{departments.map(department => <th key={department}>{department}</th>)}</tr></thead><tbody>{filtered.map(group => <FragmentRows key={group.name} group={group} departments={departments} enabled={enabled} onToggle={toggle} />)}</tbody></table>
    </div>
    <div className="matrix-footer"><p><ShieldCheck size={17} />Toda alteração será registrada no histórico de segurança.</p><div><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={onSaved}>Salvar permissões</button></div></div>
  </div>
}

function FragmentRows({ group, departments: departmentList, enabled, onToggle }: { group: { name: string; permissions: string[] }; departments: string[]; enabled: Set<string>; onToggle: (department: string, permission: string) => void }) {
  return <>
    <tr className="matrix-group"><td colSpan={departmentList.length + 1}>{group.name}</td></tr>
    {group.permissions.map(permission => <tr key={permission}><td>{permission}</td>{departmentList.map(department => {
      const active = enabled.has(`${department}::${permission}`)
      return <td key={department}><button className={active ? 'permission on' : 'permission'} onClick={() => onToggle(department, permission)} aria-label={`${permission} para ${department}`}>{active && <Check size={13} />}</button></td>
    })}</tr>)}
  </>
}
