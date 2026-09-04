import { useMemo, useState, type ComponentType } from 'react'
import {
  Boxes, CarFront, ClipboardCheck, Download, FileBarChart, FileSpreadsheet, Filter, MapPin,
  PackageCheck, RotateCcw, Search, ShieldCheck, Wrench, X,
} from 'lucide-react'
import { formatQuantity, type AppData, type StockAssignment } from './store'
import { auditAnswerLabel, auditItemStatus, auditSummaryStatus } from './auditChecklist'

export type ReportId = 'km' | 'registro-dia' | 'ponto' | 'auditoria' | 'solicitacoes' | 'ferramentas' | 'epis' | 'insumos' | 'baixas' | 'rma' | 'levantamentos'
type CellValue = string | number
type ReportDetail = { label: string; value?: string; image?: string }
type ReportRow = {
  id: string
  date: string
  person: string
  client: string
  status: string
  values: Record<string, CellValue>
  details: ReportDetail[]
}
type ReportDefinition = {
  id: ReportId
  label: string
  icon: ComponentType<{ size?: number }>
  columns: { key: string; label: string }[]
  rows: (data: AppData) => ReportRow[]
}
type Filters = { startDate: string; endDate: string; person: string; client: string; status: string; query: string }

const emptyFilters: Filters = { startDate: '', endDate: '', person: '', client: '', status: '', query: '' }
const missing = 'Não registrado'

function dateParts(value?: string) {
  if (!value) return { date: missing, time: missing, full: missing, isoDate: '' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { date: missing, time: missing, full: missing, isoDate: '' }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return {
    date: date.toLocaleDateString('pt-BR'), time: date.toLocaleTimeString('pt-BR'),
    full: date.toLocaleString('pt-BR'), isoDate: `${year}-${month}-${day}`,
  }
}

function declaredDate(value?: string) {
  if (!value) return missing
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? missing : date.toLocaleDateString('pt-BR')
}

function coordinate(value?: number) {
  return typeof value === 'number' ? value.toFixed(6) : missing
}

function yesNo(value: boolean) { return value ? 'Sim' : 'Não' }
function unique(values: string[]) { return [...new Set(values.filter(value => value && value !== missing))].sort((a, b) => a.localeCompare(b, 'pt-BR')) }

function assignmentRows(data: AppData, filter: (item: StockAssignment) => boolean): ReportRow[] {
  return data.stockAssignments.filter(filter).map(item => {
    const person = data.people.find(entry => entry.id === item.personId)?.name || 'Pessoa não encontrada'
    const approved = dateParts(item.approvedAt)
    const assigned = dateParts(item.assignedAt)
    return {
      id: item.id, date: approved.isoDate || assigned.isoDate, person, client: '', status: item.status,
      values: {
        pessoa: person, equipamento: item.equipment, modelo: [item.brand, item.model].filter(Boolean).join(' / ') || missing,
        quantidade: formatQuantity(item.quantity), recebimento: approved.date, status: item.status,
      },
      details: [
        { label: 'Código', value: item.code || missing }, { label: 'Categoria', value: item.category },
        { label: 'Unidade', value: item.unit }, { label: 'Atribuído em', value: assigned.full },
        { label: 'Atribuído por', value: item.assignedBy }, { label: 'Observações', value: item.notes || 'Sem observações' },
        ...(item.photo ? [{ label: 'Foto do equipamento', image: item.photo }] : []),
      ],
    }
  })
}

const reports: ReportDefinition[] = [
  {
    id: 'km', label: 'KM', icon: CarFront,
    columns: [
      ['veiculo', 'Veículo'], ['condutor', 'Condutor'], ['dataAtual', 'Data atual'], ['horaAtual', 'Horário atual'],
      ['dataInformada', 'Data informada'], ['horaInformada', 'Horário informado'], ['latitude', 'Latitude'], ['longitude', 'Longitude'],
      ['horaRegistrada', 'Horário registrado'], ['km', 'KM registrado'], ['cliente', 'Cliente'], ['destino', 'Destino'],
      ['motivo', 'Motivo'], ['troca', 'Troca de condutor'], ['avarias', 'Avarias'], ['observacao', 'Observações'],
    ].map(([key, label]) => ({ key, label })),
    rows: data => data.kmRecords.map(item => {
      const opened = dateParts(item.formOpenedAt)
      const recorded = dateParts(item.createdAt)
      const status = item.hasDamage ? 'Com avarias' : 'Sem avarias'
      return {
        id: item.id, date: recorded.isoDate, person: item.driver, client: item.client || '', status,
        values: {
          veiculo: item.vehicle, condutor: item.driver, dataAtual: opened.date, horaAtual: opened.time,
          dataInformada: declaredDate(item.declaredDate), horaInformada: item.declaredTime || missing,
          latitude: coordinate(item.latitude), longitude: coordinate(item.longitude), horaRegistrada: recorded.full,
          km: item.mileage, cliente: item.client || 'Sem cliente', destino: item.destination,
          motivo: item.reason || missing, troca: yesNo(item.changeDriver), avarias: yesNo(item.hasDamage),
          observacao: item.observation || 'Sem observações',
        },
        details: [
          { label: 'Momento real do salvamento', value: recorded.full },
          { label: 'Precisão do GPS', value: typeof item.accuracy === 'number' ? `${Math.round(item.accuracy)} metros` : missing },
          { label: 'Avarias registradas', value: item.damages.length ? item.damages.map((damage, index) => `${index + 1}. ${damage.location}: ${damage.description}`).join('\n') : 'Nenhuma avaria registrada' },
        ],
      }
    }),
  },
  {
    id: 'registro-dia', label: 'Registro do dia', icon: MapPin,
    columns: [
      ['tipo', 'Tipo'], ['solicitante', 'Solicitante'], ['dataAtual', 'Data atual'], ['horaAtual', 'Horário atual'],
      ['dataInformada', 'Data informada'], ['horaInformada', 'Horário informado'], ['cliente', 'Cliente'],
      ['latitude', 'Latitude'], ['longitude', 'Longitude'], ['observacao', 'Observações'],
    ].map(([key, label]) => ({ key, label })),
    rows: data => data.trajectories.filter(item => item.type !== 'Esqueci meu ponto').map(item => {
      const opened = dateParts(item.formOpenedAt)
      const recorded = dateParts(item.recordedAt)
      return {
        id: item.id, date: recorded.isoDate, person: item.author, client: item.client || '', status: item.pendingSync ? 'Aguardando sincronização' : 'Registrado',
        values: {
          tipo: item.type, solicitante: item.author, dataAtual: opened.date, horaAtual: opened.time,
          dataInformada: declaredDate(item.declaredDate), horaInformada: item.declaredTime,
          cliente: item.client || 'Sem cliente', latitude: coordinate(item.latitude), longitude: coordinate(item.longitude),
          observacao: item.observation || 'Sem observações',
        },
        details: [
          { label: 'Horário real do salvamento', value: recorded.full },
          { label: 'Equipe envolvida', value: item.team.length ? item.team.join(', ') : 'Sem equipe informada' },
          { label: 'Precisão do GPS', value: typeof item.accuracy === 'number' ? `${Math.round(item.accuracy)} metros` : missing },
          { label: 'Sincronização', value: item.pendingSync ? 'Aguardando internet' : 'Registrado' },
        ],
      }
    }),
  },
  {
    id: 'ponto', label: 'Esqueci meu ponto', icon: ClipboardCheck,
    columns: [
      ['solicitante', 'Solicitante'], ['dataAtual', 'Data atual'], ['horaAtual', 'Horário atual'],
      ['dataInformada', 'Data informada'], ['horaInformada', 'Horário informado'], ['tipoPonto', 'Tipo de ponto'], ['justificativa', 'Justificativa'],
    ].map(([key, label]) => ({ key, label })),
    rows: data => data.trajectories.filter(item => item.type === 'Esqueci meu ponto').map(item => {
      const opened = dateParts(item.formOpenedAt)
      const recorded = dateParts(item.recordedAt)
      return {
        id: item.id, date: recorded.isoDate, person: item.author, client: '', status: item.pendingSync ? 'Aguardando sincronização' : 'Registrado',
        values: {
          solicitante: item.author, dataAtual: opened.date, horaAtual: opened.time,
          dataInformada: declaredDate(item.declaredDate), horaInformada: item.declaredTime,
          tipoPonto: item.client || missing, justificativa: item.observation || missing,
        },
        details: [
          { label: 'Horário real do salvamento', value: recorded.full }, { label: 'Latitude', value: coordinate(item.latitude) },
          { label: 'Longitude', value: coordinate(item.longitude) },
          { label: 'Precisão do GPS', value: typeof item.accuracy === 'number' ? `${Math.round(item.accuracy)} metros` : missing },
        ],
      }
    }),
  },
  {
    id: 'auditoria', label: 'Auditorias', icon: ShieldCheck,
    columns: [
      ['solicitante', 'Solicitante'], ['auditoria', 'Auditoria'], ['agendada', 'Data agendada'],
      ['realizada', 'Data realizada'], ['qualidade', 'Qualidade'], ['quantidade', 'Quantidade'], ['status', 'Status'],
    ].map(([key, label]) => ({ key, label })),
    rows: data => data.audits.map(item => {
      const completed = dateParts(item.completedAt)
      const approved = item.results.filter(result => result.approved).length
      const total = item.results.length
      const percent = total ? Math.round((approved / total) * 100) : 0
      const status = auditSummaryStatus(item.category, item.results)
      return {
        id: item.id, date: completed.isoDate, person: item.auditorName, client: '', status,
        values: {
          solicitante: item.auditorName, auditoria: item.category, agendada: declaredDate(item.scheduledDate),
          realizada: completed.full, qualidade: `${approved} de ${total} — ${percent}%`, quantidade: total, status,
        },
        details: [
          { label: 'Pessoa auditada', value: item.auditedName }, { label: 'Início', value: dateParts(item.startedAt).full },
          { label: 'Próxima auditoria', value: declaredDate(item.nextAuditDate) }, { label: 'PDF gerado', value: item.pdfFileName },
          { label: 'Resultado dos equipamentos', value: item.results.map((result, index) => `${index + 1}. ${result.equipment} (${result.code || 'sem código'}): ${auditItemStatus(item.category, result.approved)}\nIdentificador atual: ${result.currentIdentifier || result.code || 'Não informado'}\nNovo identificador: ${result.newIdentifier || 'Não informado'}\nObservação: ${result.observation || 'Sem observações'}${result.restrictionReason ? `\nRestrição: ${result.restrictionReason}` : ''}\n${result.answers.map(answer => `${answer.question}: ${auditAnswerLabel(answer.answer)}`).join('\n')}`).join('\n\n') || 'Nenhum equipamento' },
        ],
      }
    }),
  },
  {
    id: 'solicitacoes', label: 'Solicitações ao estoque', icon: PackageCheck,
    columns: [
      ['solicitante', 'Solicitante'], ['codigo', 'Código'], ['quantidade', 'Quantidade'], ['equipamentos', 'Equipamentos'],
      ['data', 'Data'], ['hora', 'Horário'], ['status', 'Status'],
    ].map(([key, label]) => ({ key, label })),
    rows: data => data.stockRequests.map(item => {
      const created = dateParts(item.createdAt)
      const equipment = item.requestedItems.map(entry => `${entry.equipment} (${formatQuantity(entry.quantity)})`).join(', ') || missing
      return {
        id: item.id, date: created.isoDate, person: item.requester, client: item.client || '', status: item.status,
        values: { solicitante: item.requester, codigo: item.code, quantidade: item.items, equipamentos: equipment, data: created.date, hora: created.time, status: item.status },
        details: [
          { label: 'Técnico responsável', value: item.technician }, { label: 'Cliente', value: item.client || 'Sem cliente' },
          { label: 'Retirada prevista', value: declaredDate(item.expectedDate) }, { label: 'Observação geral', value: item.generalNotes || 'Sem observações' },
          { label: 'Detalhamento dos itens', value: item.requestedItems.map((entry, index) => `${index + 1}. ${entry.equipment} · ${formatQuantity(entry.quantity)} · ${entry.status}${entry.description ? ` · ${entry.description}` : ''}${entry.substitute ? ` · substituído por ${entry.substitute.equipment}` : ''}`).join('\n') || 'Nenhum item' },
        ],
      }
    }),
  },
  {
    id: 'ferramentas', label: 'Ferramentas', icon: Wrench,
    columns: [['pessoa', 'Pessoa'], ['equipamento', 'Equipamento'], ['modelo', 'Modelo'], ['quantidade', 'Quantidade'], ['recebimento', 'Data de recebimento'], ['status', 'Status']].map(([key, label]) => ({ key, label })),
    rows: data => assignmentRows(data, item => item.category.includes('Ferramenta')),
  },
  {
    id: 'epis', label: 'EPIs', icon: ShieldCheck,
    columns: [['pessoa', 'Pessoa'], ['equipamento', 'Equipamento'], ['modelo', 'Modelo'], ['quantidade', 'Quantidade'], ['recebimento', 'Data de recebimento'], ['status', 'Status']].map(([key, label]) => ({ key, label })),
    rows: data => assignmentRows(data, item => item.category === 'EPI'),
  },
  {
    id: 'insumos', label: 'Insumos', icon: Boxes,
    columns: [['pessoa', 'Pessoa'], ['equipamento', 'Equipamento'], ['modelo', 'Modelo'], ['quantidade', 'Quantidade'], ['recebimento', 'Data de recebimento'], ['status', 'Status']].map(([key, label]) => ({ key, label })),
    rows: data => assignmentRows(data, item => item.category === 'Insumo'),
  },
  {
    id: 'baixas', label: 'Baixa de Materiais', icon: ClipboardCheck,
    columns: [
      ['pessoa', 'Pessoa'], ['equipamento', 'Equipamento'], ['categoria', 'Categoria'], ['codigo', 'Código'],
      ['quantidade', 'Quantidade'], ['data', 'Data informada'], ['disposicao', 'Destino da baixa'], ['status', 'Status'],
    ].map(([key, label]) => ({ key, label })),
    rows: data => data.materialUsages.map(item => {
      const recorded = dateParts(item.usedAt)
      return {
        id: item.id, date: recorded.isoDate, person: item.personName, client: '', status: item.workflowStatus,
        values: {
          pessoa: item.personName, equipamento: item.equipment, categoria: item.category, codigo: item.code,
          quantidade: formatQuantity(item.quantity), data: declaredDate(item.declaredDate), disposicao: item.disposition, status: item.workflowStatus,
        },
        details: [
          { label: 'Marca / modelo', value: [item.brand, item.model].filter(Boolean).join(' / ') || missing },
          { label: 'Registrado em', value: recorded.full }, { label: 'Descrição', value: item.description },
          { label: 'Processado por', value: item.processedBy || missing }, { label: 'Processado em', value: dateParts(item.processedAt).full },
          ...(item.photo ? [{ label: 'Foto da baixa', image: item.photo }] : []),
        ],
      }
    }),
  },
  {
    id: 'rma', label: 'RMA', icon: Wrench,
    columns: [
      ['ticket', 'Ticket Movidesk'], ['codigo', 'Código GIO'], ['cliente', 'Cliente'], ['tecnico', 'Técnico'],
      ['equipamento', 'Equipamento'], ['retirada', 'Data da retirada'], ['registro', 'Data do registro'], ['status', 'Status'],
    ].map(([key, label]) => ({ key, label })),
    rows: data => data.rmaRequests.map(item => {
      const created = dateParts(item.createdAt)
      return {
        id: item.id, date: created.isoDate, person: item.technicianName, client: item.client, status: item.status,
        values: {
          ticket: item.movideskTicketId || 'Aguardando', codigo: item.localCode, cliente: item.client,
          tecnico: item.technicianName, equipamento: item.equipment, retirada: declaredDate(item.withdrawalDate), registro: created.full, status: item.status,
        },
        details: [
          { label: 'Serviço', value: item.service }, { label: 'Categoria', value: item.category }, { label: 'Urgência', value: item.urgency },
          { label: 'Descrição do problema', value: item.details }, { label: 'Recebido por', value: item.receivedBy || missing },
          { label: 'Recebido em', value: dateParts(item.receivedAt).full }, { label: 'Erro de integração', value: item.integrationError || 'Nenhum' },
          ...(item.photo ? [{ label: 'Foto do equipamento', image: item.photo }] : []),
        ],
      }
    }),
  },
  {
    id: 'levantamentos', label: 'Levantamentos', icon: FileBarChart,
    columns: [
      ['ticket', 'Ticket Movidesk'], ['codigo', 'Código GIO'], ['cliente', 'Cliente'], ['solicitante', 'Solicitante'],
      ['area', 'Área'], ['inicio', 'Prazo inicial'], ['fim', 'Prazo final'], ['registro', 'Data do registro'], ['status', 'Status'],
    ].map(([key, label]) => ({ key, label })),
    rows: data => data.surveyRequests.map(item => {
      const created = dateParts(item.createdAt)
      return {
        id: item.id, date: created.isoDate, person: item.requestedByName, client: item.client, status: item.status,
        values: {
          ticket: item.movideskTicketId || 'Aguardando', codigo: item.localCode, cliente: item.client,
          solicitante: item.requestedByName, area: item.area, inicio: declaredDate(item.startDate), fim: declaredDate(item.endDate), registro: created.full, status: item.status,
        },
        details: [
          { label: 'Detalhes da atividade', value: item.details }, { label: 'Última consulta do status', value: dateParts(item.lastStatusCheckAt).full },
          { label: 'Erro de integração', value: item.integrationError || 'Nenhum' },
          ...(item.photo ? [{ label: 'Foto do levantamento', image: item.photo }] : []),
        ],
      }
    }),
  },
]

function filterRows(rows: ReportRow[], filters: Filters) {
  const query = filters.query.trim().toLocaleLowerCase('pt-BR')
  return rows.filter(row => {
    if (filters.startDate && (!row.date || row.date < filters.startDate)) return false
    if (filters.endDate && (!row.date || row.date > filters.endDate)) return false
    if (filters.person && row.person !== filters.person) return false
    if (filters.client && row.client !== filters.client) return false
    if (filters.status && row.status !== filters.status) return false
    if (query) {
      const content = [...Object.values(row.values), ...row.details.map(detail => detail.value || detail.label)].join(' ').toLocaleLowerCase('pt-BR')
      if (!content.includes(query)) return false
    }
    return true
  })
}

function statusTone(value: CellValue) {
  const normalized = String(value).toLocaleLowerCase('pt-BR')
  if (normalized === 'não liberada' || normalized === 'não aprovado') return 'danger'
  if (normalized.includes('resolvid') || normalized.includes('aprovad') || normalized.includes('recebido') || normalized === 'registrado' || normalized === 'liberada') return 'success'
  if (normalized.includes('cancel') || normalized.includes('avaria') || normalized.includes('ressalva') || normalized.includes('danific')) return 'danger'
  return 'warning'
}

export function ReportsPage({ data, reportId }: { data: AppData; reportId: ReportId }) {
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [details, setDetails] = useState<{ report: ReportDefinition; row: ReportRow } | null>(null)
  const [notice, setNotice] = useState('')
  const active = reports.find(report => report.id === reportId)!
  const sourceRows = useMemo(() => active.rows(data), [active, data])
  const filteredRows = useMemo(() => filterRows(sourceRows, filters), [sourceRows, filters])
  const options = {
    people: unique(sourceRows.map(row => row.person)), clients: unique(sourceRows.map(row => row.client)), statuses: unique(sourceRows.map(row => row.status)),
  }

  const downloadCurrent = () => {
    downloadExcel([{ report: active, rows: filteredRows }], `relatorio-${active.id}-${new Date().toISOString().slice(0, 10)}.xls`)
    setNotice(`Relatório de ${active.label} exportado com os filtros atuais.`)
  }
  const downloadAll = () => {
    const sheets = reports.map(report => ({ report, rows: filterRows(report.rows(data), filters) }))
    downloadExcel(sheets, `relatorios-gio-${new Date().toISOString().slice(0, 10)}.xls`)
    setNotice('Arquivo completo exportado com uma planilha para cada relatório.')
  }

  return <>
    <section className="page-intro"><div><p className="eyebrow">Informação para decisão</p><h2>Relatórios</h2><p>Consulte cada informação na própria interface, aplique filtros e exporte para o Excel.</p></div><div className="report-page-actions"><button className="secondary-button" onClick={downloadCurrent}><Download size={17} /> Exportar aba atual</button><button className="primary-button" onClick={downloadAll}><FileSpreadsheet size={18} /> Exportar todos</button></div></section>
    {notice && <div className="report-notice"><FileSpreadsheet size={18} />{notice}</div>}
    <section className="surface report-filter-card">
      <div className="report-filter-title"><Filter size={19} /><div><b>Filtros do relatório</b><small>{filteredRows.length} de {sourceRows.length} registros apresentados</small></div></div>
      <div className="report-filter-grid">
        <label>Data inicial<input type="date" value={filters.startDate} onChange={event => setFilters({ ...filters, startDate: event.target.value })} /></label>
        <label>Data final<input type="date" min={filters.startDate || undefined} value={filters.endDate} onChange={event => setFilters({ ...filters, endDate: event.target.value })} /></label>
        <label>Pessoa<select value={filters.person} onChange={event => setFilters({ ...filters, person: event.target.value })}><option value="">Todas</option>{options.people.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Cliente<select value={filters.client} onChange={event => setFilters({ ...filters, client: event.target.value })}><option value="">Todos</option>{options.clients.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Status<select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">Todos</option>{options.statuses.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="report-search">Pesquisar<div><Search size={16} /><input value={filters.query} onChange={event => setFilters({ ...filters, query: event.target.value })} placeholder="Buscar neste relatório" /></div></label>
        <button className="secondary-button report-clear" onClick={() => setFilters(emptyFilters)}><RotateCcw size={16} /> Limpar filtros</button>
      </div>
    </section>
    <section className="surface table-surface report-data-table">
      <div className="table-toolbar"><div><p className="eyebrow">{active.label}</p><h3>Registros do relatório</h3></div><span className="report-count">{filteredRows.length} registros</span></div>
      <div className="responsive-table"><table><thead><tr>{active.columns.map(column => <th key={column.key}>{column.label}</th>)}<th>Detalhes</th></tr></thead><tbody>{filteredRows.length ? [...filteredRows].reverse().map(row => <tr key={row.id}>{active.columns.map(column => <td key={column.key}>{column.key === 'status' ? <span className={`status ${statusTone(row.values[column.key])}`}>{row.values[column.key]}</span> : row.values[column.key]}</td>)}<td><button className="secondary-button compact" onClick={() => setDetails({ report: active, row })}>Ver detalhes</button></td></tr>) : <tr><td colSpan={active.columns.length + 1} className="table-empty">Nenhum registro encontrado com os filtros informados.</td></tr>}</tbody></table></div>
    </section>
    {details && <ReportDetails report={details.report} row={details.row} onClose={() => setDetails(null)} />}
  </>
}

function ReportDetails({ report, row, onClose }: { report: ReportDefinition; row: ReportRow; onClose: () => void }) {
  return <div className="modal-layer report-detail-layer" role="dialog" aria-modal="true" aria-label={`Detalhes de ${report.label}`}>
    <button className="modal-backdrop" onClick={onClose} aria-label="Fechar detalhes" />
    <section className="quick-modal report-detail-modal">
      <div className="modal-heading"><div><p className="eyebrow">Relatório de {report.label}</p><h2>Detalhes do registro</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={21} /></button></div>
      <div className="report-detail-grid">{report.columns.map(column => <div key={column.key}><span>{column.label}</span><b>{row.values[column.key]}</b></div>)}</div>
      <div className="report-extra-details">{row.details.map((detail, index) => <article key={`${detail.label}-${index}`}><span>{detail.label}</span>{detail.image ? <img src={detail.image} alt={detail.label} /> : <p>{detail.value || missing}</p>}</article>)}</div>
      <div className="modal-actions"><button className="primary-button" onClick={onClose}>Fechar</button></div>
    </section>
  </div>
}

function downloadExcel(sheets: { report: ReportDefinition; rows: ReportRow[] }[], fileName: string) {
  const workbook = buildExcelWorkbook(sheets)
  const url = URL.createObjectURL(new Blob(['\ufeff', workbook], { type: 'application/vnd.ms-excel;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}

function buildExcelWorkbook(sheets: { report: ReportDefinition; rows: ReportRow[] }[]) {
  const worksheets = sheets.map(({ report, rows }) => {
    const columns = report.columns
    const header = `<Row ss:StyleID="Header">${columns.map(column => excelCell(column.label)).join('')}</Row>`
    const body = rows.map(row => `<Row>${columns.map(column => excelCell(row.values[column.key])).join('')}</Row>`).join('')
    const widths = columns.map(column => `<Column ss:AutoFitWidth="0" ss:Width="${Math.min(220, Math.max(75, column.label.length * 7 + 25))}"/>`).join('')
    return `<Worksheet ss:Name="${xmlEscape(report.label.slice(0, 31))}"><Table>${widths}${header}${body}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions><AutoFilter x:Range="R1C1:R${Math.max(1, rows.length + 1)}C${columns.length}" xmlns="urn:schemas-microsoft-com:office:excel"/></Worksheet>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Author>GIO - Gestão Integrada de Operações</Author><Created>${new Date().toISOString()}</Created></DocumentProperties><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10"/><Borders/><Interior/><NumberFormat/><Protection/></Style><Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#F58200" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D56E00"/></Borders></Style></Styles>${worksheets}</Workbook>`
}

function excelCell(value: CellValue) {
  const type = typeof value === 'number' && Number.isFinite(value) ? 'Number' : 'String'
  return `<Cell><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`
}

function xmlEscape(value: unknown) {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
  return String(value ?? '').replace(/[&<>"']/g, character => entities[character] || character)
}
