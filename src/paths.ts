export function publicAsset(fileName: string) {
  return `${import.meta.env.BASE_URL}${fileName.replace(/^\/+/, '')}`
}
