import { jsPDF } from 'jspdf'
import { formatQuantity, type AppData, type InventoryItem, type StockRequest } from './store'
import { itemAuditStatus, itemIdentifier, latestItemAudit } from './personalInventory'

export type PrintFormat = 'a4' | 'thermal'
export type PrintBlock = { title: string; fields: [string, string][] }
export type PrintDocument = { title: string; subtitle: string; fileName: string; blocks: PrintBlock[]; thermalBlocks?: PrintBlock[] }
const dateTime = (value?: string) => value ? new Date(value).toLocaleString('pt-BR') : 'Não informado'
const dateOnly = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informada'

export function inventoryPrintDocument(data: AppData, title: string, items: InventoryItem[]): PrintDocument {
  return {
    title, subtitle: `Pessoa: ${data.account.name}`, fileName: `${title} - ${data.account.name}`,
    blocks: items.map(item => {
      const audit = latestItemAudit(data, data.account.id, item.id)
      const assignments = data.stockAssignments.filter(entry => entry.personId === data.account.id && entry.inventoryItemId === item.id && entry.status === 'Aprovado e retirado')
      const fields: [string, string][] = [
        ['Código do cadastro', item.code || 'Não informado'], ['Identificador', itemIdentifier(data, data.account.id, item) || 'Não informado'],
        ['Categoria', item.category], ['Marca', item.brand || 'Não informada'], ['Modelo', item.model || 'Não informado'],
        ['Quantidade disponível', `${formatQuantity(item.quantity)} ${item.unit}`], ['Status', itemAuditStatus(data, data.account.id, item)],
        ['Observação do cadastro', item.notes || 'Sem observações'],
      ]
      if (audit) fields.push(['Última auditoria', dateTime(audit.record.completedAt)], ['Auditor', audit.record.auditorName],
        ['Identificador atual na auditoria', audit.result.currentIdentifier || audit.result.code || 'Não informado'],
        ['Novo identificador na auditoria', audit.result.newIdentifier || 'Não informado'], ['Observação da auditoria', audit.result.observation || 'Sem observações'])
      assignments.forEach((entry, index) => fields.push([`Recebimento ${index + 1}`, `${dateTime(entry.approvedAt)} | ${formatQuantity(entry.quantity)} ${entry.unit} | Atribuído por: ${entry.assignedBy}${entry.sourceRequestCode ? ` | Pedido: ${entry.sourceRequestCode}` : ''}${entry.notes ? ` | Observação: ${entry.notes}` : ''}`]))
      return { title: item.equipment, fields }
    }),
    thermalBlocks: items.map(item => ({ title: item.equipment, fields: [['Status', itemAuditStatus(data, data.account.id, item)]] })),
  }
}

export function orderPrintDocument(request: StockRequest): PrintDocument {
  return {
    title: `Pedido ${request.code}`, subtitle: 'GIO - Separação e retirada de materiais', fileName: `Pedido ${request.code}`,
    blocks: [
      { title: 'Dados da retirada', fields: [['Quem vai retirar', request.assignedPersonName || request.technician], ['Data da retirada prevista', dateOnly(request.expectedDate)], ['Solicitante', request.requester], ['Cliente', request.client || 'Sem cliente'], ['Situação do pedido', request.status], ['Observação', request.generalNotes || 'Sem observações']] },
      ...request.requestedItems.map((item, index): PrintBlock => {
        const source = item.status === 'Substituído' && item.substitute ? item.substitute : item
        const fields: [string, string][] = [['Quantidade', formatQuantity(source.quantity)], ['Marca', source.brand || 'Não informada'], ['Modelo', source.model || 'Não informado'], ['Situação', item.status]]
        if (item.status === 'Substituído') fields.push(['Solicitado originalmente', `${item.equipment} | ${formatQuantity(item.quantity)} | ${[item.brand, item.model].filter(Boolean).join(' ') || 'Sem marca/modelo'}`])
        if (item.description) fields.push(['Descrição / justificativa', item.description])
        return { title: `${index + 1}. ${source.equipment}`, fields }
      }),
    ],
  }
}

// All wrapping uses the same font and size as rendering. Thermal pages stay
// portrait, with equal safe margins, even for a single short item.
export function buildListPdf(document: PrintDocument, format: PrintFormat, logo: string, printedAt = new Date()) {
  if (format === 'thermal') return buildThermalListPdf(document, logo)
  const width = 210
  const margin = 15
  const contentWidth = width - margin * 2
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const blocks = document.blocks
  const fontSize = 10
  const lineHeight = 5
  let y = 0
  let pageNumber = 0
  const wrap = (text: string, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(fontSize)
    return pdf.splitTextToSize(text || 'Não informado', contentWidth) as string[]
  }
  const header = () => {
    pageNumber += 1
    y = 12
    if (logo) {
      const properties = pdf.getImageProperties(logo)
      const scale = Math.min(38 / properties.width, 19 / properties.height)
      const logoWidth = properties.width * scale, logoHeight = properties.height * scale
      pdf.addImage(logo, 'PNG', margin, y, logoWidth, logoHeight)
      y += logoHeight + 7
    }
      pdf.setFontSize(15); pdf.setFont('helvetica', 'bold')
      const title = pdf.splitTextToSize(document.title, contentWidth) as string[]
      pdf.text(title, margin, y); y += title.length * 6 + 2
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal')
      const subtitle = pdf.splitTextToSize(document.subtitle, contentWidth) as string[]
      pdf.text(subtitle, margin, y); y += subtitle.length * 4 + 3
      pdf.setDrawColor(190); pdf.line(margin, y, width - margin, y); y += 8
      pdf.setFontSize(8); pdf.text(`Emitido em ${printedAt.toLocaleString('pt-BR')} | Página ${pageNumber}`, margin, 287)
  }
  const newPage = () => { pdf.addPage('a4', 'portrait'); header() }
  const bottom = 278
  const lines = (text: string, bold = false) => {
    wrap(text, bold).forEach(line => {
      if (y + lineHeight > bottom) newPage()
      pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(fontSize); pdf.setTextColor(30)
      pdf.text(line, margin, y, { baseline: 'top' })
      y += lineHeight
    })
  }
  header()
  blocks.forEach(block => {
    const minimum = Math.min(5, wrap(block.title, true).length + 2) * lineHeight
    if (y + minimum > bottom) newPage()
    lines(block.title, true); y += 2
    block.fields.forEach(([label, value]) => lines(`${label}: ${value}`))
    y += 7
  })
  return pdf
}

function buildThermalListPdf(document: PrintDocument, logo: string) {
  const measure = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 82] })
  const properties = logo ? measure.getImageProperties(logo) : null
  const scale = properties ? Math.min(28 / properties.width, 13 / properties.height) : 0
  const logoWidth = properties ? properties.width * scale : 0
  const logoHeight = properties ? properties.height * scale : 0
  const startY = 6 + (logo ? logoHeight + 4 : 0)
  type Line = { text: string; y: number; bold: boolean }
  const pages: Line[][] = [[]]
  let y = startY
  const wrap = (text: string, bold: boolean) => {
    measure.setFont('helvetica', bold ? 'bold' : 'normal'); measure.setFontSize(8)
    return measure.splitTextToSize(text, 66) as string[]
  }
  const nextPage = () => { pages.push([]); y = startY }
  const append = (text: string, bold: boolean) => {
    for (const line of wrap(text, bold)) {
      if (y + 3.7 > 233) nextPage()
      pages.at(-1)!.push({ text: line, y, bold }); y += 3.7
    }
  }
  for (const block of document.thermalBlocks ?? document.blocks) {
    if (y + Math.min(5, wrap(block.title, true).length + 2) * 3.7 > 233) nextPage()
    append(block.title, true); y += 1
    block.fields.forEach(([label, value]) => append(`${label}: ${value}`, false))
    y += 3
  }
  // Determine each page's size BEFORE drawing. Resizing a drawn MediaBox would
  // shift/crop the content because PDF coordinates start at the bottom edge.
  const heights = pages.map(lines => Math.max(82, (lines.at(-1)?.y ?? startY) + 3.7 + 7))
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, heights[0]] })
  pages.forEach((lines, index) => {
    if (index) pdf.addPage([80, heights[index]], 'portrait')
    if (logo) pdf.addImage(logo, 'PNG', (80 - logoWidth) / 2, 6, logoWidth, logoHeight)
    lines.forEach(line => {
      pdf.setFont('helvetica', line.bold ? 'bold' : 'normal'); pdf.setFontSize(8); pdf.setTextColor(30)
      pdf.text(line.text, 7, line.y, { baseline: 'top' })
    })
  })
  return pdf
}
