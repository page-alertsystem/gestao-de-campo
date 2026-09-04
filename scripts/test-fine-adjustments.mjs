// Isolated browser regression test. No real users, server data or Movidesk calls.
// Run with GIO_TEST_BROWSER_MODULE pointing at playwright's index.mjs if needed.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const browserModule = process.env.GIO_TEST_BROWSER_MODULE || 'playwright'
const { chromium } = await import(browserModule.startsWith('C:') ? pathToFileURL(browserModule).href : browserModule)
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true })
const origin = 'http://127.0.0.1:4193'
const server = await createServer({ server: { host: '127.0.0.1', port: 4193, strictPort: true, watch: null } })
await server.listen()
const output = path.resolve('tmp/pdfs/fine-adjustments')
await mkdir(output, { recursive: true })
const errors = []
const page = await context.newPage()
page.on('pageerror', error => errors.push(error.message))
await context.route('**/*', route => {
  const url = new URL(route.request().url())
  if (url.origin !== origin && url.protocol !== 'blob:') return route.abort()
  if (url.pathname === '/server-config.json') return route.fulfill({ json: {} })
  if (url.pathname === '/__qa') return route.fulfill({ contentType: 'text/html', body: '<html><body>QA</body></html>' })
  return route.continue()
})
const now = new Date().toISOString(), today = now.slice(0, 10)
const person = { id: 'qa-person', name: 'Pessoa de Teste', email: 'qa@example.invalid', groups: ['Administrador'], active: true, canLogin: true, mustChangePassword: false }
const other = { ...person, id: 'qa-other', name: 'Outra Pessoa' }
const inventory = ['Ferramenta pessoal', 'Ferramenta rotativa', 'Escada', 'EPI', 'Insumo'].map((category, i) => ({ id: `qa-item-${i}`, equipment: ['Alicate universal', 'Furadeira rotativa', 'Escada extensível', 'Luva de proteção', 'Cabo de rede'][i], category, brand: 'Marca teste', model: 'Modelo teste', unit: 'Unidade', code: `QA-${i}`, quantity: 20, minimum: 0, notes: 'Observação do cadastro.' }))
const assignments = inventory.map((item, i) => ({ id: `qa-assignment-${i}`, personId: person.id, inventoryItemId: item.id, equipment: item.equipment, brand: item.brand, model: item.model, category: item.category, unit: item.unit, code: item.code, quantity: 2.5, assignedAt: now, assignedBy: 'Estoque de teste', notes: 'Conferir na retirada.', status: 'Aprovado e retirado', approvedAt: now }))
const request = { id: 'qa-request', code: 'ALT26090099', createdAt: now, requester: person.name, technician: person.name, client: 'Cliente de teste', expectedDate: today, generalNotes: 'Retirar no período da manhã.', status: 'Pedido recebido', items: 3, author: person.name,
  requestedItems: [
    { id: 'rq1', equipment: 'Alicate universal', brand: 'Marca teste', model: 'Modelo teste', quantity: 1.5, status: 'Solicitado' },
    { id: 'rq2', equipment: 'Cabo antigo', brand: '', model: '', quantity: 1, status: 'Substituído', description: 'Equivalente disponível.', substitute: { equipment: 'Cabo de rede', brand: 'Marca teste', model: 'Modelo teste', quantity: 2 } },
    { id: 'rq3', equipment: 'Item indisponível', brand: '', model: '', quantity: 1, status: 'Cancelado', description: 'Sem estoque.' },
  ] }
const data = { account: { ...person, passwordHash: '' }, people: [person, other], clients: [], vehicles: [], inventory, stockAssignments: [...assignments, { ...assignments[0], id: 'qa-pending', status: 'Pendente' }], materialUsages: [], stockRequests: [request], audits: [
  { id: 'audit-old', personId: person.id, category: 'Ferramentas', auditorName: person.name, auditedName: person.name, startedAt: '2026-01-01T12:00:00Z', completedAt: '2026-01-01T12:05:00Z', nextAuditDate: '2026-02-01', pdfFileName: 'anterior.pdf', results: [{ inventoryItemId: inventory[0].id, equipment: inventory[0].equipment, code: inventory[0].code, currentIdentifier: 'ID antigo', newIdentifier: 'ID vigente', observation: 'Precisa de revisão.', answers: [], photo: '', approved: false }] },
  { id: 'audit-other', personId: other.id, category: 'Ferramentas', auditorName: other.name, auditedName: other.name, startedAt: now, completedAt: now, nextAuditDate: today, pdfFileName: 'outro.pdf', results: [{ inventoryItemId: inventory[0].id, equipment: inventory[0].equipment, code: inventory[0].code, answers: [], photo: '', approved: true }] },
], trajectories: [{ id: 'qa-day', type: 'Encontro', author: person.name, declaredDate: today, declaredTime: '10:00', recordedAt: now, client: 'Cliente teste', observation: '', team: [], pendingSync: false }, { id: 'qa-other-day', type: 'REGISTRO PRIVADO DE OUTRA PESSOA', author: other.name, declaredDate: today, declaredTime: '10:00', recordedAt: now, client: '', observation: '', team: [], pendingSync: false }], kmRecords: [], rmaRequests: [], surveyRequests: [], notifications: [], permissions: [] }

const state = () => page.evaluate(() => new Promise((resolve, reject) => { const open = indexedDB.open('gio-local-v1', 1); open.onsuccess = () => { const db = open.result; const get = db.transaction('application').objectStore('application').get('state'); get.onsuccess = () => { resolve(get.result); db.close() }; get.onerror = reject }; open.onerror = reject }))
const nav = async (group, child) => { const menu = page.locator('.main-nav'); if (!child || !(await menu.getByRole('button', { name: child, exact: true }).isVisible())) await menu.getByRole('button', { name: group, exact: true }).click(); if (child) await menu.getByRole('button', { name: child, exact: true }).click() }

try {
  await page.goto(`${origin}/__qa`)
  await page.evaluate(async seed => {
    sessionStorage.setItem('gio-admin-session', '1')
    await new Promise((resolve, reject) => { const open = indexedDB.open('gio-local-v1', 1); open.onupgradeneeded = () => open.result.createObjectStore('application'); open.onsuccess = () => { const db = open.result; const tx = db.transaction('application', 'readwrite'); tx.objectStore('application').put(seed, 'state'); tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = reject }; open.onerror = reject })
  }, data)
  await page.goto(origin)
  await page.getByRole('heading', { name: 'Bom dia, Pessoa' }).waitFor()
  assert.equal(await page.locator('.home-quick-links button').count(), 4)
  assert.ok((await page.locator('.home-quick-links').innerText()).includes('1 aguardando sua confirmação'))
  assert.ok(!(await page.locator('#home-latest-records').innerText()).includes('REGISTRO PRIVADO'))
  await page.screenshot({ path: path.join(output, 'home.png'), fullPage: true })
  await nav('Pessoal', 'Ferramentas')
  assert.equal(await page.getByRole('button', { name: 'Imprimir este bloco' }).count(), 3)
  assert.ok((await page.locator('tbody').first().innerText()).includes('Não aprovado'))
  assert.ok((await page.locator('tbody').first().innerText()).includes('ID vigente'))
  await page.getByRole('button', { name: 'Imprimir este bloco' }).first().click()
  await page.getByRole('dialog').waitFor()
  assert.equal(await page.getByRole('button', { name: /Térmica — 80/ }).count(), 1)
  const popupEvent = page.waitForEvent('popup')
  await page.getByRole('button', { name: /Térmica — 80/ }).click()
  const popup = await popupEvent
  await page.getByRole('link', { name: 'Abrir PDF para imprimir' }).waitFor()
  assert.ok((await page.getByRole('link', { name: 'Baixar PDF' }).getAttribute('href')).startsWith('blob:'))
  await popup.close()
  await page.getByRole('button', { name: 'Fechar', exact: true }).click()
  await page.screenshot({ path: path.join(output, 'tools.png'), fullPage: true })

  // Generate PDFs through the exact browser module used by the application.
  const logo = `data:image/png;base64,${(await readFile('public/alert-logo.png')).toString('base64')}`
  const pdfs = await page.evaluate(async ({ seed, logo }) => {
    const { buildListPdf, inventoryPrintDocument, orderPrintDocument } = await import('/src/inventoryPrint.ts')
    const { personalInventory } = await import('/src/personalInventory.ts')
    const items = personalInventory(seed, seed.account.id)
    const doc = inventoryPrintDocument(seed, 'Ferramentas atribuídas a você', items.filter(item => item.category === 'Ferramenta pessoal'))
    const all = inventoryPrintDocument(seed, 'Estoque pessoal', items)
    return {
      'thermal-short': buildListPdf(doc, 'thermal', logo).output('datauristring').split(',')[1],
      'inventory-a4': buildListPdf(all, 'a4', logo).output('datauristring').split(',')[1],
      'order-a4': buildListPdf(orderPrintDocument(seed.stockRequests[0]), 'a4', logo).output('datauristring').split(',')[1],
      'thermal-long': buildListPdf({ ...doc, thermalBlocks: Array.from({ length: 50 }, (_, i) => ({ title: `${i + 1}. Furadeira rotativa com identificação detalhada e nome longo para quebra de linha`, fields: [['Status', 'Não aprovado']] })) }, 'thermal', logo).output('datauristring').split(',')[1],
    }
  }, { seed: data, logo })
  for (const [name, content] of Object.entries(pdfs)) await writeFile(path.join(output, `${name}.pdf`), Buffer.from(content, 'base64'))

  // Audit fields persist through moving to the next item and back, and into PDF.
  await nav('Gestão', 'Auditoria')
  await page.getByRole('row').filter({ hasText: person.name }).getByRole('button', { name: 'Entrar' }).click()
  await page.getByRole('button', { name: 'Iniciar auditoria' }).click()
  assert.equal(await page.getByLabel('Identificador atual', { exact: true }).inputValue(), 'ID vigente')
  await page.getByLabel('Novo identificador (opcional)').fill('Novo ID - TESTE')
  await page.getByLabel('Observação do equipamento (opcional)').fill('Observação registrada para o alicate de teste.')
  for (const question of await page.locator('.audit-question').all()) await question.getByRole('button', { name: 'Sim', exact: true }).click()
  await page.locator('input[type=file]').setInputFiles('public/alert-logo.png')
  await page.getByRole('button', { name: 'Próximo equipamento' }).click()
  assert.equal(await page.getByLabel('Novo identificador (opcional)').inputValue(), '')
  await page.getByRole('button', { name: 'Anterior' }).click()
  assert.equal(await page.getByLabel('Novo identificador (opcional)').inputValue(), 'Novo ID - TESTE')
  await page.screenshot({ path: path.join(output, 'audit-fields.png'), fullPage: true })
  await page.getByRole('button', { name: 'Próximo equipamento' }).click()
  for (const question of await page.locator('.audit-question').all()) await question.getByRole('button', { name: 'Não', exact: true }).click()
  await page.locator('input[type=file]').setInputFiles('public/alert-logo.png')
  await page.getByRole('button', { name: 'Continuar para assinatura' }).click()
  await page.locator('.signature-select').click()
  const canvas = await page.locator('canvas').boundingBox()
  await page.mouse.move(canvas.x + 30, canvas.y + 70); await page.mouse.down(); await page.mouse.move(canvas.x + 180, canvas.y + 80, { steps: 12 }); await page.mouse.up()
  await page.getByRole('button', { name: 'Registrar assinatura' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Finalizar e salvar PDF' }).click()
  await (await download).saveAs(path.join(output, 'audit-completed.pdf'))
  await page.getByText(/Auditoria concluída e PDF salvo/).waitFor()
  const completed = (await state()).audits.at(-1)
  assert.equal(completed.results[0].newIdentifier, 'Novo ID - TESTE')
  assert.equal(completed.results[0].observation, 'Observação registrada para o alicate de teste.')
  assert.equal(completed.results[1].observation, '')

  await nav('Estoque', 'Pedidos')
  await page.getByRole('button', { name: 'Acessar pedido' }).click()
  await page.getByRole('button', { name: 'Imprimir pedido' }).click()
  assert.equal(await page.getByRole('button', { name: /A4 — completo/ }).count(), 1)
  await page.getByRole('button', { name: 'Fechar', exact: true }).click()
  await page.getByRole('button', { name: 'Iniciar separação' }).click()
  await page.getByRole('button', { name: 'Marcar como pedido separado' }).click()
  await page.locator('.main-nav').getByRole('button', { name: 'Gerenciamento', exact: true }).click()
  await page.getByRole('button', { name: 'Aprovar', exact: true }).click()
  await page.getByLabel('Pessoa que receberá os equipamentos').selectOption(person.id)
  for (const input of await page.locator('.equipment-approval-modal input[type=file]').all()) await input.setInputFiles('public/alert-logo.png')
  await page.locator('.equipment-approval-modal').getByRole('button', { name: 'Enviar para aprovação', exact: true }).click()
  await page.getByText(/Equipamentos do pedido .* enviados para aprovação/).waitFor()
  const after = await state()
  const created = after.stockAssignments.filter(entry => entry.sourceRequestCode === request.code)
  assert.equal(created.length, 2)
  assert.ok(created.every(entry => entry.category === 'Insumo' && entry.status === 'Pendente'))
  assert.equal(after.inventory.find(item => item.id === inventory[0].id).quantity, 20, 'Existing tool balance must not change')
  assert.equal(after.inventory.find(item => item.id === inventory[4].id).quantity, 18, 'Substitute must debit existing supply')
  assert.equal(after.inventory.find(item => item.id === created[0].inventoryItemId).category, 'Insumo')
  assert.equal(after.inventory.find(item => item.id === created[0].inventoryItemId).quantity, -1.5)
  await nav('Pessoal', 'Aprovações')
  await page.locator('.approval-card').filter({ hasText: request.code }).getByRole('button', { name: 'Aprovar e confirmar retirada' }).first().click()
  await page.locator('.main-nav').getByRole('button', { name: 'Insumos', exact: true }).click()
  await page.getByRole('cell', { name: 'Alicate universal', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Imprimir este bloco' }).count(), 1)
  await page.locator('.main-nav').getByRole('button', { name: 'EPIs', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Imprimir este bloco' }).count(), 1)
  await nav('Gestão', 'Levantamento')
  await page.getByLabel('Prazo inicial', { exact: true }).waitFor()
  await page.getByLabel('Prazo final', { exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(output, 'survey-mobile.png'), fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => { const open = indexedDB.open('gio-local-v1', 1); open.onsuccess = () => { const db = open.result; const tx = db.transaction('application', 'readwrite'); const store = tx.objectStore('application'); const get = store.get('state'); get.onsuccess = () => { const state = get.result; state.people[0].groups = ['Técnico']; store.put(state, 'state') }; tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = reject } })
  })
  await page.reload()
  await page.getByRole('heading', { name: 'Bom dia, Pessoa' }).waitFor()
  await nav('Gestão', 'Auditoria')
  assert.ok((await page.locator('.audit-category-grid').innerText()).includes('Escadas'))
  assert.ok(!(await page.locator('.audit-category-grid').innerText()).includes('Ferramentas'))
  await nav('Pessoal', 'Ferramentas')
  assert.ok((await page.locator('tbody').first().innerText()).includes('Novo ID - TESTE'))
  assert.ok((await page.locator('tbody').first().innerText()).includes('Aprovado'))

  // Ladder-specific checklist and fail-on-any-nonconformity regression.
  const logic = await page.evaluate(async () => {
    const { ladderQuestions, ladderIsApproved, auditAnswerLabel } = await import('/src/auditChecklist.ts')
    const conforming = Object.fromEntries(ladderQuestions.map((_, i) => [i, 'Conforme']))
    return { count: ladderQuestions.length, conforming: ladderIsApproved(conforming, false), incomplete: ladderIsApproved({}, false), restricted: ladderIsApproved(conforming, true), notApplicable: ladderIsApproved({ ...conforming, 11: 'Não aplicável' }, false), negatives: ladderQuestions.map((_, i) => ladderIsApproved({ ...conforming, [i]: 'Não conforme' }, false)), legacy: [auditAnswerLabel(true), auditAnswerLabel(false)] }
  })
  assert.equal(logic.count, 12); assert.equal(logic.conforming, true); assert.equal(logic.notApplicable, true)
  assert.equal(logic.incomplete, false); assert.equal(logic.restricted, false)
  assert.ok(logic.negatives.every(result => result === false)); assert.deepEqual(logic.legacy, ['Sim', 'Não'])
  const enterLadder = async () => {
    await nav('Gestão', 'Auditoria')
    await page.getByRole('row').filter({ hasText: person.name }).getByRole('button', { name: 'Entrar' }).click()
    await page.getByRole('button', { name: 'Iniciar auditoria' }).click()
    assert.equal(await page.locator('.ladder-question').count(), 12)
    assert.equal(await page.locator('.audit-checklist').getByRole('button', { name: 'Sim', exact: true }).count(), 0)
  }
  const finishLadder = async name => {
    await page.locator('input[type=file]').setInputFiles('public/alert-logo.png')
    await page.getByRole('button', { name: 'Continuar para assinatura' }).click()
    await page.locator('.signature-select').click()
    const box = await page.locator('canvas').boundingBox()
    await page.mouse.move(box.x + 30, box.y + 70); await page.mouse.down(); await page.mouse.move(box.x + 150, box.y + 90, { steps: 12 }); await page.mouse.up()
    await page.getByRole('button', { name: 'Registrar assinatura' }).click()
    const savedPdf = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Finalizar e salvar PDF' }).click()
    await (await savedPdf).saveAs(path.join(output, name))
    await page.getByRole('button', { name: 'Iniciar auditoria' }).waitFor()
  }
  await enterLadder()
  for (const [i, question] of (await page.locator('.ladder-question').all()).entries()) await question.getByRole('button', { name: i >= 8 ? 'Não aplicável' : 'Conforme', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.ladder-question').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(output, 'ladder-checklist-mobile.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 1440, height: 1050 })
  await finishLadder('ladder-conforming.pdf')
  assert.equal((await state()).audits.at(-1).results[0].approved, true)
  // A new nonconformity must override even an already-approved signed audit.
  await page.getByRole('button', { name: 'Iniciar auditoria' }).click()
  await page.locator('.ladder-question').nth(5).getByRole('button', { name: 'Não conforme', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Escada não liberada' }).waitFor()
  assert.equal((await state()).inventory.find(item => item.category === 'Escada').ladderRestriction.status, 'Não liberada')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(output, 'ladder-block-mobile.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Fechar auditoria', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.reload()
  await page.getByRole('heading', { name: 'Bom dia, Pessoa' }).waitFor()
  await nav('Pessoal', 'Ferramentas')
  const ladderTable = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Escadas atribuídas a você', exact: true }) })
  assert.ok((await ladderTable.innerText()).includes('Não liberada'))
  // Finish a complete record, with both a failure and N/A, while still blocked.
  await enterLadder()
  for (const [i, question] of (await page.locator('.ladder-question').all()).entries()) {
    await question.getByRole('button', { name: i === 5 ? 'Não conforme' : i >= 8 ? 'Não aplicável' : 'Conforme', exact: true }).click()
    if (i === 5) await page.getByRole('button', { name: 'Entendi, continuar registro' }).click()
  }
  await page.getByLabel('Observação do equipamento (opcional)').fill('Escada de teste: substituição solicitada ao gestor.')
  await finishLadder('ladder-blocked.pdf')
  const ladderAudit = (await state()).audits.at(-1)
  assert.equal(ladderAudit.results[0].approved, false)
  assert.equal(ladderAudit.results[0].answers[5].answer, 'Não conforme')
  assert.equal(ladderAudit.results[0].answers[11].answer, 'Não aplicável')
  assert.ok(ladderAudit.results[0].restrictionReason.includes('substituição'))
  const ladderPrints = await page.evaluate(async ({ seed, logo }) => {
    const { buildListPdf, inventoryPrintDocument } = await import('/src/inventoryPrint.ts')
    const { personalInventory } = await import('/src/personalInventory.ts')
    const document = inventoryPrintDocument(seed, 'Escadas atribuídas a você', personalInventory(seed, seed.account.id).filter(item => item.category === 'Escada'))
    return ['a4', 'thermal'].map(format => buildListPdf(document, format, logo).output('datauristring').split(',')[1])
  }, { seed: await state(), logo })
  await writeFile(path.join(output, 'ladder-inventory-a4.pdf'), Buffer.from(ladderPrints[0], 'base64'))
  await writeFile(path.join(output, 'ladder-inventory-thermal.pdf'), Buffer.from(ladderPrints[1], 'base64'))
  assert.deepEqual(errors, [])
  console.log('PASS: home, personal inventory, orders, audit signatures, ladder 12 questions/three answers, fail on any NC, immediate restriction surviving cancel/reload, N/A and signed PDFs; no JS errors.')
} finally {
  await browser.close()
  await server.close()
}
