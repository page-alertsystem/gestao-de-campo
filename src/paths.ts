export function publicAsset(fileName: string) {
  return `${import.meta.env.BASE_URL}${fileName.replace(/^\/+/, '')}`
}

export const brandAssets = {
  color: publicAsset('brand/grupo_alert_colorido.svg'),
  onDark: publicAsset('brand/grupo_alert_branco_para_fundo_cinza.svg'),
  onOrange: publicAsset('brand/grupo_alert_branco_para_fundo_laranja.svg'),
  pdf: publicAsset('brand/grupo_alert_colorido.png'),
} as const
