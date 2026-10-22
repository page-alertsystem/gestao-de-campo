import type { jsPDF } from 'jspdf'

/**
 * Desenha o cabeçalho de marca dos PDFs (SIGA + Grupo Alert, ver brandAssets.pdf)
 * dentro de uma caixa, sem distorcer: a imagem é reduzida até caber em largura e altura.
 */
export function fitLogo(pdf: jsPDF, logo: string, x: number, y: number, maxWidth: number, maxHeight: number, align: 'left' | 'center' | 'right' = 'left') {
  const properties = pdf.getImageProperties(logo)
  const scale = Math.min(maxWidth / properties.width, maxHeight / properties.height)
  const width = properties.width * scale
  const height = properties.height * scale
  const left = align === 'center' ? x + (maxWidth - width) / 2 : align === 'right' ? x + maxWidth - width : x
  pdf.addImage(logo, logo.startsWith('data:image/png') ? 'PNG' : 'JPEG', left, y, width, height)
  return { width, height }
}
