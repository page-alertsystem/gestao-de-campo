import { useEffect, useState } from 'react'
import { Download, Printer, X } from 'lucide-react'
import { publicAsset } from './paths'
import { buildListPdf, type PrintDocument, type PrintFormat } from './inventoryPrint'

export function PrintDialog({ document, thermal = true, onClose }: { document: PrintDocument; thermal?: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ url: string; name: string } | null>(null)
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url) }, [result])
  const generate = async (format: PrintFormat) => {
    if (busy) return
    const preview = window.open('', '_blank')
    if (preview) { preview.opener = null; preview.document.title = 'Preparando impressão'; preview.document.body.textContent = 'Preparando o documento do GIO…' }
    setBusy(true); setError('')
    try {
      const response = await fetch(publicAsset('alert-logo.png'))
      if (!response.ok) throw new Error('Logo não encontrado')
      const blob = await response.blob()
      const logo = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob) })
      const pdf = buildListPdf(document, format, logo)
      const url = URL.createObjectURL(pdf.output('blob'))
      setResult({ url, name: `${document.fileName} - ${format === 'thermal' ? 'Térmica' : 'A4'}.pdf` })
      if (preview) preview.location.href = url
    } catch {
      preview?.close(); setError('Não foi possível preparar a impressão. Confira a conexão e tente novamente.')
    } finally { setBusy(false) }
  }
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Imprimir documento">
    <button className="modal-backdrop" onClick={onClose} aria-label="Fechar impressão" />
    <section className="quick-modal print-list-dialog"><div className="modal-heading"><div><p className="eyebrow">Impressão</p><h2>{document.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div>
      <p>{thermal ? 'Escolha o formato. Na térmica serão impressos somente o logo, os nomes e os status.' : 'O pedido será preparado em A4, com os dados da retirada e todos os itens.'}</p>
      <div className="print-format-options"><button className="secondary-button" disabled={busy} onClick={() => void generate('a4')}><Printer size={20} /> A4 — completo</button>{thermal && <button className="secondary-button" disabled={busy} onClick={() => void generate('thermal')}><Printer size={20} /> Térmica — 80 mm</button>}</div>
      <p className="table-subtitle">Na janela do PDF, use Imprimir. Para papel térmico: orientação retrato e escala 100%.</p>
      {busy && <p role="status">Preparando documento…</p>}{error && <p role="alert">{error}</p>}
      {result && <div className="print-format-options"><a className="primary-button" href={result.url} target="_blank" rel="noopener noreferrer"><Printer size={17} /> Abrir PDF para imprimir</a><a className="secondary-button" href={result.url} download={result.name}><Download size={17} /> Baixar PDF</a></div>}
    </section>
  </div>
}
