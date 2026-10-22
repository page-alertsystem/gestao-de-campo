import { jsPDF } from 'jspdf'
import { fitLogo } from './pdfBrand'
import { brandAssets } from './paths'
import type { SystemPreventiveCapacity, SystemPreventiveRecord } from './store'

export type SystemPreventiveApiPayload = {
  preventive: Omit<SystemPreventiveRecord, 'checklist' | 'photos' | 'capacity'>
  capacity: SystemPreventiveCapacity | null
  checklist: SystemPreventiveRecord['checklist']
  photos: SystemPreventiveRecord['photos']
}

export function systemPreventiveToApiPayload(record: SystemPreventiveRecord): SystemPreventiveApiPayload {
  const { checklist, photos, capacity, ...preventive } = record
  return { preventive, capacity: capacity ?? null, checklist, photos }
}

export function systemPreventiveFileName(record: SystemPreventiveRecord) {
  const asset = record.assetName.replace(/[^a-zA-ZÀ-ÿ0-9]+/g, ' ').trim().replace(/\s+/g, '-') || 'equipamento'
  return `Preventiva Sistemica - ${record.code} - ${asset}.pdf`
}

export function capacityMetrics(capacity: SystemPreventiveCapacity) {
  const dailyTb = capacity.totalCameras * capacity.averageBitrateMbps * 86400 / 8 / 1e6
  const requiredTb = dailyTb * Math.max(1, capacity.retentionDays)
  const availableTb = capacity.storageTotalTb > 0 ? capacity.storageTotalTb : capacity.storageUsedTb + capacity.storageFreeTb
  const estimatedDays = dailyTb > 0 && availableTb > 0 ? availableTb / dailyTb : 0
  return {
    dailyTb,
    requiredTb,
    availableTb,
    estimatedDays,
    starterUsePercent: capacity.starterTier > 0 ? capacity.totalCameras / capacity.starterTier * 100 : 0,
    absoluteUsePercent: capacity.totalCameras / 300 * 100,
  }
}

export async function downloadSystemPreventivePdf(record: SystemPreventiveRecord) {
  const pdf = await createSystemPreventivePdf(record)
  pdf.save(systemPreventiveFileName(record))
}

export async function createSystemPreventivePdf(record: SystemPreventiveRecord) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let logo = ''
  try { logo = await fetch(brandAssets.pdf).then(response => response.blob()).then(blobToDataUrl) } catch { /* O cabeçalho textual mantém o documento identificável. */ }
  let y = addHeader(pdf, logo)

  const newPage = () => {
    pdf.addPage()
    y = addHeader(pdf, logo)
  }
  const ensureSpace = (height: number) => { if (y + height > 275) newPage() }
  const section = (title: string) => {
    ensureSpace(14)
    pdf.setFillColor(239, 244, 241)
    pdf.roundedRect(14, y, 182, 9, 2, 2, 'F')
    pdf.setTextColor(29, 73, 49)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text(title, 18, y + 6)
    y += 13
  }
  const field = (label: string, value: unknown, width = 178) => {
    const text = display(value)
    const lines = pdf.splitTextToSize(text, width)
    const height = 7 + lines.length * 4.2
    ensureSpace(height)
    pdf.setTextColor(104, 113, 108)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.text(label.toUpperCase(), 16, y)
    pdf.setTextColor(34, 42, 37)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text(lines, 16, y + 4.8)
    y += height
  }
  const fieldPair = (leftLabel: string, leftValue: unknown, rightLabel: string, rightValue: unknown) => {
    const left = pdf.splitTextToSize(display(leftValue), 80)
    const right = pdf.splitTextToSize(display(rightValue), 80)
    const height = 8 + Math.max(left.length, right.length) * 4.2
    ensureSpace(height)
    ;[[leftLabel, left, 16], [rightLabel, right, 107]].forEach(([label, lines, x]) => {
      pdf.setTextColor(104, 113, 108); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.text(String(label).toUpperCase(), Number(x), y)
      pdf.setTextColor(34, 42, 37); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text(lines as string[], Number(x), y + 4.8)
    })
    y += height
  }

  section('IDENTIFICAÇÃO DO RELATÓRIO')
  fieldPair('Código SIGA', record.code, 'Tipo de equipamento', record.assetType)
  fieldPair('Cliente', record.client, 'Data da preventiva', formatDate(record.serviceDate))
  fieldPair('Equipamento / hostname', record.assetName, 'Modelo', record.model)
  fieldPair('Serial / Service Tag', record.serialNumber, 'Endereço IP', record.ipAddress)
  fieldPair('Função', record.assetFunction, 'Responsável pelo registro', record.createdByName)
  field('Registrado no SIGA', formatDateTime(record.createdAt))

  section('UTILIZAÇÃO E SISTEMA')
  fieldPair('Uso de CPU', percent(record.cpuUsagePercent), 'Uso de memória RAM', percent(record.memoryUsagePercent))
  fieldPair('Uso de disco', percent(record.diskUsagePercent), 'Usuário da workstation', record.workstationUser)
  fieldPair('Sistema operacional', record.operatingSystem, 'Build', record.operatingSystemBuild)
  field('Observação da utilização', record.usageObservation)

  if (record.assetType === 'Servidor') {
    section('DIGIFORT / CFTV')
    fieldPair('Versão Digifort', record.digifortVersion, 'Data de verificação', formatDate(record.digifortVerificationDate))
    fieldPair('Câmeras offline', record.offlineCameras, 'Total de câmeras', record.capacity?.totalCameras)
    field('Observações Digifort', record.digifortObservation)
    if (record.capacity) {
      const metrics = capacityMetrics(record.capacity)
      section('CAPACITY PLANNING')
      fieldPair('Faixa Starter Kit', `Até ${record.capacity.starterTier} câmeras`, 'Total de câmeras', record.capacity.totalCameras)
      fieldPair('Câmeras online', record.capacity.onlineCameras, 'Outros dispositivos', record.capacity.otherDevices)
      fieldPair('Retenção desejada', `${record.capacity.retentionDays} dias`, 'Bitrate médio', `${decimal(record.capacity.averageBitrateMbps)} Mbps/câmera`)
      fieldPair('Resolução / FPS', `${display(record.capacity.resolution)} / ${record.capacity.fps} FPS`, 'Codec', record.capacity.codec)
      fieldPair('Storage total', `${decimal(record.capacity.storageTotalTb)} TB`, 'Storage usado / livre', `${decimal(record.capacity.storageUsedTb)} TB / ${decimal(record.capacity.storageFreeTb)} TB`)
      fieldPair('Consumo diário estimado', `${decimal(metrics.dailyTb)} TB`, 'Necessário para retenção', `${decimal(metrics.requiredTb)} TB`)
      fieldPair('Retenção estimada', `${decimal(metrics.estimatedDays)} dias`, 'Discos / RAID', `${record.capacity.diskCount || '-'} / ${display(record.capacity.raidVolume)}`)
      field('Conclusão automática', capacityConclusion(record.capacity))
    }
  }

  if (record.assetType === 'Workstation') {
    section('PERFIL OPERACIONAL')
    fieldPair('Câmeras monitoradas', record.monitoredCameras, 'Perfil de operação', record.operationalProfile)
  }

  if (record.assetType === 'Storage') {
    section('CAPACIDADE DO STORAGE')
    fieldPair('Capacidade total', record.storageCapacityTb === null ? '' : `${decimal(record.storageCapacityTb)} TB`, 'Espaço usado', record.storageUsedTb === null ? '' : `${decimal(record.storageUsedTb)} TB`)
  }

  section('CHECKLIST TÉCNICO')
  record.checklist.forEach(answer => {
    const observation = answer.observation.trim()
    const itemLines = pdf.splitTextToSize(answer.item, 128)
    const observationLines = observation ? pdf.splitTextToSize(`Observação: ${observation}`, 166) : []
    const height = Math.max(11, itemLines.length * 4.1 + observationLines.length * 3.8 + 5)
    ensureSpace(height)
    const tone = answer.status === 'Conforme' ? [39, 119, 70] : answer.status === 'Não conforme' ? [174, 53, 45] : [92, 101, 96]
    pdf.setTextColor(38, 45, 41); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.text(itemLines, 16, y + 4)
    pdf.setTextColor(tone[0], tone[1], tone[2]); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.text(answer.status.toUpperCase(), 194, y + 4, { align: 'right' })
    if (observationLines.length) { pdf.setTextColor(103, 111, 106); pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7.5); pdf.text(observationLines, 16, y + itemLines.length * 4.1 + 4) }
    pdf.setDrawColor(224, 229, 226); pdf.line(16, y + height - 1, 194, y + height - 1)
    y += height
  })

  section('OBSERVAÇÕES GERAIS')
  field('Registro técnico', record.generalObservation || 'Sem observações adicionais.')

  for (const [index, photo] of record.photos.entries()) {
    newPage()
    pdf.setTextColor(29, 73, 49); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11)
    pdf.text(`EVIDÊNCIA FOTOGRÁFICA ${index + 1} DE ${record.photos.length}`, 15, y)
    y += 8
    pdf.setTextColor(93, 103, 97); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8)
    pdf.text(photo.name || `Foto ${index + 1}`, 15, y)
    y += 6
    try { addContainedImage(pdf, photo.data, 15, y, 180, 218) } catch { pdf.text('Não foi possível incluir esta imagem no documento.', 15, y + 10) }
  }

  const pages = pdf.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page)
    pdf.setDrawColor(231, 116, 31); pdf.line(15, 286, 195, 286)
    pdf.setTextColor(112, 119, 115); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7)
    pdf.text(`SIGA · ${record.code} · ${record.client}`, 15, 291)
    pdf.text(`Página ${page} de ${pages}`, 195, 291, { align: 'right' })
  }
  return pdf
}

function addHeader(pdf: jsPDF, logo: string) {
  if (logo) fitLogo(pdf, logo, 15, 10, 66, 12)
  pdf.setTextColor(66, 66, 66); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13)
  pdf.text('RELATÓRIO DE PREVENTIVA SISTÊMICA', 195, 16, { align: 'right' })
  pdf.setTextColor(231, 116, 31); pdf.setFontSize(8); pdf.text('SISTEMA INTEGRADO DE GESTÃO ALERT', 195, 22, { align: 'right' })
  pdf.setDrawColor(231, 116, 31); pdf.setLineWidth(.6); pdf.line(15, 32, 195, 32)
  return 39
}

function addContainedImage(pdf: jsPDF, dataUrl: string, x: number, y: number, maxWidth: number, maxHeight: number) {
  const properties = pdf.getImageProperties(dataUrl)
  const ratio = Math.min(maxWidth / properties.width, maxHeight / properties.height)
  const width = properties.width * ratio
  const height = properties.height * ratio
  const format = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
  pdf.addImage(dataUrl, format, x + (maxWidth - width) / 2, y + (maxHeight - height) / 2, width, height)
}

function capacityConclusion(capacity: SystemPreventiveCapacity) {
  const metrics = capacityMetrics(capacity)
  if (capacity.totalCameras > 300) return 'O ambiente ultrapassa o limite absoluto de 300 câmeras.'
  if (capacity.totalCameras > capacity.starterTier) return 'O total de câmeras ultrapassa a faixa Starter Kit selecionada.'
  if (metrics.availableTb > 0 && metrics.requiredTb > metrics.availableTb) return `Storage insuficiente. Necessário adicionar aproximadamente ${decimal(metrics.requiredTb - metrics.availableTb)} TB.`
  if (!capacity.totalCameras || !capacity.averageBitrateMbps) return 'Dados insuficientes para concluir o dimensionamento.'
  return 'A quantidade de câmeras e a retenção estão dentro dos parâmetros informados.'
}

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Não informado'
  return String(value)
}

function percent(value: number | null) { return value === null ? 'Não informado' : `${decimal(value)}%` }
function decimal(value: number) { return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) }
function formatDate(value: string) { if (!value) return 'Não informado'; const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR') }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR') }

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
