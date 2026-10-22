export function publicAsset(fileName: string) {
  return `${import.meta.env.BASE_URL}${fileName.replace(/^\/+/, '')}`
}

/** Marca do Grupo Alert (empresa). */
export const brandAssets = {
  color: publicAsset('brand/grupo_alert_colorido.svg'),
  onDark: publicAsset('brand/grupo_alert_branco_para_fundo_cinza.svg'),
  onOrange: publicAsset('brand/grupo_alert_branco_para_fundo_laranja.svg'),
  /** Cabeçalho dos PDFs: logo do SIGA + logo do Grupo Alert lado a lado (PNG transparente). */
  pdf: publicAsset('brand/siga-alert-pdf.png'),
} as const

/** Marca do SIGA — Sistema Integrado de Gestão Alert (mídia kit). */
export const sigaAssets = {
  /** Logo principal com assinatura (proporção 666:221). */
  color: publicAsset('brand/siga/siga-logo-cor.svg'),
  onDark: publicAsset('brand/siga/siga-logo-negativo.svg'),
  /** Logo reduzido, sem assinatura (proporção 474:148). */
  compact: publicAsset('brand/siga/siga-reduzido-cor.svg'),
  compactOnDark: publicAsset('brand/siga/siga-reduzido-negativo.svg'),
  symbol: publicAsset('brand/siga/siga-simbolo-cor.svg'),
  icon: publicAsset('brand/siga/siga-icone.svg'),
} as const
