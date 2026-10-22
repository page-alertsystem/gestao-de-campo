// Endereços do SIGA (antigo GIO), centralizados num único lugar.
// Para trocar os links no futuro, edite public/server-config.json (não precisa recompilar):
// {
//   "apiBaseUrl":    endereço do servidor (API)
//   "desktopUrl":    site completo (computador)
//   "mobileUrl":     SIGA Mobile (celular)
//   "androidApkUrl": download do aplicativo Android
// }
export type RuntimeConfiguration = { apiBaseUrl?: string; desktopUrl?: string; mobileUrl?: string; androidApkUrl?: string }

let configurationPromise: Promise<RuntimeConfiguration> | null = null

export function runtimeConfiguration() {
  configurationPromise ??= fetch(`${import.meta.env.BASE_URL}server-config.json`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() as Promise<RuntimeConfiguration> : {})
    .catch(() => ({}))
  return configurationPromise
}

const trim = (value?: string) => String(value || '').trim()

export async function appLinks() {
  const configuration = await runtimeConfiguration()
  const base = new URL(import.meta.env.BASE_URL, window.location.origin).href
  const desktop = trim(configuration.desktopUrl) || base
  const mobile = trim(configuration.mobileUrl) || `${base}mobile/`
  const androidApk = trim(configuration.androidApkUrl) || `${mobile.replace(/\/?$/, '/')}siga-mobile.apk`
  return { desktop, mobile, androidApk }
}

/** Verdadeiro quando a página roda dentro do aplicativo Android do SIGA (identificador técnico mantido: GIOMobileApp). */
export const insideAndroidApp = () => /GIOMobileApp/i.test(navigator.userAgent)

/** Verdadeiro em celulares (tela pequena com toque). */
export const isPhone = () => window.matchMedia('(max-width: 820px)').matches && 'ontouchstart' in window
