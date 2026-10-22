// Cache de arquivos do site para abrir mais rápido e sem internet.
// Nunca guarda respostas da API (dados e PDFs ficam só no servidor).
const CACHE = 'siga-v3'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
  await self.clients.claim()
})()))
self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.includes('/api/') || request.headers.has('Authorization') || url.pathname.endsWith('.apk')) return
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})
