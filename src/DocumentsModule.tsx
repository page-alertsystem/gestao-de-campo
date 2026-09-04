import { CalendarDays, Download, FileArchive, FileCheck2, FolderOpen, UserRound } from 'lucide-react'
import type { AppData } from './store'
import { downloadServerDocument } from './serverApi'
import { auditSummaryStatus } from './auditChecklist'

export type DocumentSection = 'audits' | 'vehicle-change'

type DocumentRow = {
  id: string
  createdAt: string
  person: string
  type: string
  identification: string
  details: string
  fileName: string
  pdfData?: string
  pdfStorageKey?: string
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Não registrado' : date.toLocaleString('pt-BR')
}

function documentSize(pdfData?: string, pdfStorageKey?: string) {
  if (pdfStorageKey) return 'Armazenado no servidor'
  if (!pdfData) return 'Arquivo anterior não armazenado'
  const encoded = pdfData.split(',')[1] || ''
  const bytes = Math.max(0, Math.floor(encoded.length * 0.75))
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('pt-BR')} KB`
}

async function downloadPdf(row: DocumentRow) {
  if (row.pdfStorageKey) return downloadServerDocument(row.pdfStorageKey, row.fileName)
  if (!row.pdfData) return
  const link = document.createElement('a')
  link.href = row.pdfData
  link.download = row.fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function DocumentsPage({ data, section }: { data: AppData; section: DocumentSection }) {
  const isAudits = section === 'audits'
  const rows: DocumentRow[] = isAudits
    ? data.audits.map(audit => {
      const approved = audit.results.filter(result => result.approved).length
      return {
        id: audit.id,
        createdAt: audit.completedAt,
        person: audit.auditedName,
        type: `Auditoria de ${audit.category}`,
        identification: `Auditor: ${audit.auditorName}`,
        details: `${auditSummaryStatus(audit.category, audit.results)} · ${approved} de ${audit.results.length} equipamentos aprovados · Próxima: ${new Date(`${audit.nextAuditDate}T12:00:00`).toLocaleDateString('pt-BR')}`,
        fileName: audit.pdfFileName,
        pdfData: audit.pdfData,
        pdfStorageKey: audit.pdfStorageKey,
      }
    })
    : data.kmRecords.filter(record => record.changeDriver).map(record => ({
      id: record.id,
      createdAt: record.createdAt,
      person: record.driver,
      type: 'Troca de condutor',
      identification: `${record.vehicle} · ${record.mileage.toLocaleString('pt-BR')} km`,
      details: `${record.destination}${record.hasDamage ? ' · Com avarias' : ' · Sem avarias'}`,
      fileName: record.pdfFileName || `Relatório de troca de condutor - ${record.vehicle}.pdf`,
      pdfData: record.pdfData,
      pdfStorageKey: record.pdfStorageKey,
    }))
  const orderedRows = [...rows].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
  const available = orderedRows.filter(row => row.pdfData || row.pdfStorageKey).length

  return <>
    <section className="page-intro"><div><p className="eyebrow">Central de arquivos</p><h2>{isAudits ? 'Documentos de auditoria' : 'Documentos de troca de veículo'}</h2><p>{isAudits ? 'Consulte os relatórios assinados gerados ao final das auditorias.' : 'Consulte os relatórios gerados quando houver troca de condutor do veículo.'}</p></div></section>
    <section className="document-summary-grid">
      <article className="metric-card"><span><FolderOpen size={21} /></span><div><b>{orderedRows.length}</b><small>Documentos registrados</small></div></article>
      <article className="metric-card"><span><FileCheck2 size={21} /></span><div><b>{available}</b><small>Arquivos disponíveis</small></div></article>
      <article className="metric-card"><span><CalendarDays size={21} /></span><div><b>{orderedRows[0] ? new Date(orderedRows[0].createdAt).toLocaleDateString('pt-BR') : '—'}</b><small>Documento mais recente</small></div></article>
    </section>
    <section className="surface table-surface documents-table">
      <div className="table-toolbar"><div><p className="eyebrow">{isAudits ? 'Auditorias' : 'Troca de veículo'}</p><h3>PDFs gerados pelo sistema</h3></div><span className="report-count">{orderedRows.length} documentos</span></div>
      <div className="responsive-table"><table><thead><tr><th>Data</th><th>Pessoa</th><th>Documento</th><th>Identificação</th><th>Outros dados</th><th>Arquivo</th><th>Ação</th></tr></thead><tbody>
        {orderedRows.length ? orderedRows.map(row => <tr key={row.id}>
          <td><span className="document-date"><CalendarDays size={14} />{formatDate(row.createdAt)}</span></td>
          <td><span className="document-person"><UserRound size={14} />{row.person}</span></td>
          <td>{row.type}</td><td>{row.identification}</td><td>{row.details}</td>
          <td><span className="document-file"><FileArchive size={15} /><span><b>{row.fileName}</b><small>{documentSize(row.pdfData, row.pdfStorageKey)}</small></span></span></td>
          <td><button className="secondary-button compact" disabled={!row.pdfData && !row.pdfStorageKey} onClick={() => void downloadPdf(row)}><Download size={15} />{row.pdfData || row.pdfStorageKey ? 'Baixar PDF' : 'Indisponível'}</button></td>
        </tr>) : <tr><td colSpan={7} className="table-empty">Nenhum PDF desta categoria foi gerado até o momento.</td></tr>}
      </tbody></table></div>
    </section>
  </>
}
