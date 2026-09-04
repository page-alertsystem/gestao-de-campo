import { FormEvent, type ComponentType, type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Bell, Boxes, CalendarClock, CarFront, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, ClipboardList,
  Download, FileBarChart, FolderOpen, Home, LogOut, MapPin, Menu, PackageCheck, Plus, Route,
  Printer, Search, Settings, ShieldCheck, Signal, SignalZero, Users, Warehouse, Wrench, X,
} from 'lucide-react'
import { KmForm } from './KmForm'
import { StockRequestForm } from './StockRequestForm'
import { StockManagement } from './StockManagement'
import { StockOrdersPage, StockRequestsPage } from './StockOrders'
import { MaterialWriteOffModal, MaterialWriteOffsPage, StockApprovals } from './StockWorkflow'
import { AuditPage, AuditWizard, type AuditStart } from './AuditModule'
import { AdminCatalogs } from './AdminCatalogs'
import { DamagedEquipmentPage, RmaRequestPage } from './MaintenanceModule'
import { fetchSurveyStatus, nextSurveySyncTime, SurveyPage, surveyNeedsStatusSync } from './SurveyModule'
import { ReportsPage, type ReportId } from './ReportsModule'
import { DocumentsPage, type DocumentSection } from './DocumentsModule'
import { allowedPagesForProfiles, hasProfile, normalizeProfiles, profileDescriptions, profileNames, profileSummary, type Page } from './access'
import { accountFromPerson, formatQuantity, hashPassword, loadAppData, normalizeAppData, saveAppData, type AppData, type InventoryItem, type StockRequest } from './store'
import { clearServerSession, initializeCentralData, loginCentralServer, saveCentralData } from './serverApi'
import { publicAsset } from './paths'
import { itemAuditStatus, itemIdentifier, latestItemAudit, personalInventory, upcomingPersonalAudits } from './personalInventory'
import { inventoryPrintDocument, type PrintDocument } from './inventoryPrint'
import { PrintDialog } from './PrintDialog'
import { recordCompletedAudit } from './auditChecklist'

type ActionName = 'Início do deslocamento' | 'Encontro' | 'Desencontro' | 'Chegada em casa' | 'Esqueci meu ponto'
type QuickRecord = { action: ActionName; summary: string; date: string; time: string; formOpenedAt: string; client: string; team: string[]; observation: string; latitude?: number; longitude?: number; accuracy?: number }

const nav: { id: Page; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'operacao-dia', label: 'Operação', icon: Route },
  { id: 'gestao-auditoria', label: 'Gestão', icon: ClipboardCheck },
  { id: 'pessoal-ferramentas', label: 'Pessoal', icon: Users },
  { id: 'estoque-baixas', label: 'Estoque', icon: Boxes },
  { id: 'manutencao-rma', label: 'Manutenção', icon: Wrench },
  { id: 'documentos-auditorias', label: 'Documentos', icon: FolderOpen },
  { id: 'relatorios-km', label: 'Relatórios', icon: FileBarChart },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
]

const actions: { label: ActionName; detail: string; icon: ComponentType<{ size?: number }> }[] = [
  { label: 'Início do deslocamento', detail: 'Registre a saída para uma operação', icon: Route },
  { label: 'Encontro', detail: 'Informe quem encontrou no trajeto', icon: Users },
  { label: 'Desencontro', detail: 'Registre a separação da equipe', icon: Users },
  { label: 'Chegada em casa', detail: 'Finalize a movimentação do dia', icon: Home },
  { label: 'Esqueci meu ponto', detail: 'Avise o RH sobre um ponto não registrado', icon: CalendarClock },
]

const dayActions = actions.filter(item => item.label !== 'Esqueci meu ponto')
const operationPages: { id: Page; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'operacao-km', label: 'Relatório de KM', icon: CarFront },
  { id: 'operacao-dia', label: 'Registro do dia', icon: ClipboardCheck },
  { id: 'operacao-ponto', label: 'Esqueci meu ponto', icon: CalendarClock },
]
const personalPages: { id: Page; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'pessoal-ferramentas', label: 'Ferramentas', icon: Wrench },
  { id: 'pessoal-insumos', label: 'Insumos', icon: PackageCheck },
  { id: 'pessoal-epis', label: 'EPIs', icon: ShieldCheck },
  { id: 'pessoal-aprovacoes', label: 'Aprovações', icon: CheckCircle2 },
]
const stockPages: { id: Page; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'estoque-pedidos', label: 'Pedidos', icon: ClipboardList },
  { id: 'estoque-baixas', label: 'Baixa de Materiais', icon: ClipboardCheck },
  { id: 'estoque-gerenciamento', label: 'Gerenciamento', icon: Warehouse },
]
const managementPages: { id: Page; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'gestao-auditoria', label: 'Auditoria', icon: ShieldCheck },
  { id: 'gestao-solicitacoes', label: 'Solicitações ao estoque', icon: PackageCheck },
  { id: 'gestao-levantamento', label: 'Levantamento', icon: MapPin },
]
const maintenancePages: { id: Page; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'manutencao-rma', label: 'RMA', icon: Wrench },
  { id: 'manutencao-danificados', label: 'Equipamentos danificados', icon: PackageCheck },
]
const documentPages: { id: Page; section: DocumentSection; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'documentos-auditorias', section: 'audits', label: 'Auditorias', icon: ClipboardCheck },
  { id: 'documentos-troca-veiculo', section: 'vehicle-change', label: 'Troca de veículo', icon: CarFront },
]
const reportPages: { id: Page; reportId: ReportId; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'relatorios-km', reportId: 'km', label: 'KM', icon: CarFront },
  { id: 'relatorios-registro-dia', reportId: 'registro-dia', label: 'Registro do dia', icon: MapPin },
  { id: 'relatorios-ponto', reportId: 'ponto', label: 'Esqueci meu ponto', icon: ClipboardCheck },
  { id: 'relatorios-auditoria', reportId: 'auditoria', label: 'Auditorias', icon: ShieldCheck },
  { id: 'relatorios-solicitacoes', reportId: 'solicitacoes', label: 'Solicitações ao estoque', icon: PackageCheck },
  { id: 'relatorios-ferramentas', reportId: 'ferramentas', label: 'Ferramentas', icon: Wrench },
  { id: 'relatorios-epis', reportId: 'epis', label: 'EPIs', icon: ShieldCheck },
  { id: 'relatorios-insumos', reportId: 'insumos', label: 'Insumos', icon: Boxes },
  { id: 'relatorios-baixas', reportId: 'baixas', label: 'Baixa de Materiais', icon: ClipboardCheck },
  { id: 'relatorios-rma', reportId: 'rma', label: 'RMA', icon: Wrench },
  { id: 'relatorios-levantamentos', reportId: 'levantamentos', label: 'Levantamentos', icon: FileBarChart },
]
const isOperationPage = (page: Page) => page.startsWith('operacao-')
const isManagementPage = (page: Page) => page.startsWith('gestao-')
const isPersonalPage = (page: Page) => page.startsWith('pessoal-')
const isStockPage = (page: Page) => page.startsWith('estoque-')
const isMaintenancePage = (page: Page) => page.startsWith('manutencao-')
const isDocumentPage = (page: Page) => page.startsWith('documentos-')
const isReportPage = (page: Page) => page.startsWith('relatorios-')

const localDateInput = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const todayInput = () => localDateInput(new Date())
const nowInput = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [logged, setLogged] = useState(() => sessionStorage.getItem('gio-admin-session') === '1')
  const [page, setPage] = useState<Page>('inicio')
  const [online, setOnline] = useState(navigator.onLine)
  const [drawer, setDrawer] = useState(false)
  const [operationOpen, setOperationOpen] = useState(false)
  const [managementOpen, setManagementOpen] = useState(false)
  const [personalOpen, setPersonalOpen] = useState(false)
  const [stockOpen, setStockOpen] = useState(false)
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)
  const [documentsOpen, setDocumentsOpen] = useState(false)
  const [reportsOpen, setReportsOpen] = useState(false)
  const [activeAction, setActiveAction] = useState<ActionName | null>(null)
  const [kmOpen, setKmOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [activeAudit, setActiveAudit] = useState<AuditStart | null>(null)
  const [toast, setToast] = useState('')
  const [pendingSync, setPendingSync] = useState(0)
  const [surveySyncTick, setSurveySyncTick] = useState(0)

  useEffect(() => {
    loadAppData().then(async stored => {
      const central = await initializeCentralData(stored)
      const ready = normalizeAppData(central.data)
      if (central.active && !central.authenticated) {
        sessionStorage.removeItem('gio-admin-session')
        setLogged(false)
      }
      setData(ready)
      void saveAppData(ready)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const connected = () => setOnline(true)
    const disconnected = () => setOnline(false)
    window.addEventListener('online', connected)
    window.addEventListener('offline', disconnected)
    return () => {
      window.removeEventListener('online', connected)
      window.removeEventListener('offline', disconnected)
    }
  }, [])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3600)
  }

  const updateData = (next: AppData, message?: string) => {
    setData(next)
    void saveAppData(next)
    void saveCentralData(next).catch(error => showToast(error instanceof Error ? error.message : 'Não foi possível salvar no servidor deste notebook.'))
    if (message) showToast(message)
  }

  useEffect(() => {
    if (!data || !logged || !online) return
    let active = true
    const due = data.surveyRequests.filter(request => surveyNeedsStatusSync(request))
    if (due.length) {
      Promise.all(due.map(async request => {
        try { return { id: request.id, ...(await fetchSurveyStatus(request)) } } catch { return null }
      })).then(results => {
        if (!active) return
        const updates = new Map(results.filter((result): result is NonNullable<typeof result> => Boolean(result)).map(result => [result.id, result]))
        if (!updates.size) return
        setData(current => {
          if (!current) return current
          let resolvedNow = 0
          const surveyRequests = current.surveyRequests.map(request => {
            const update = updates.get(request.id)
            if (!update) return request
            if (update.resolved && !request.resolved) resolvedNow += 1
            return { ...request, status: update.status, resolved: update.resolved, lastStatusCheckAt: update.checkedAt }
          })
          const next = { ...current, surveyRequests }
          void saveAppData(next)
          void saveCentralData(next).catch(() => undefined)
          if (resolvedNow) showToast(`${resolvedNow} ${resolvedNow === 1 ? 'levantamento foi resolvido' : 'levantamentos foram resolvidos'} no Movidesk.`)
          return next
        })
      })
    }
    const delay = Math.max(1000, nextSurveySyncTime().getTime() - Date.now() + 1000)
    const timer = window.setTimeout(() => setSurveySyncTick(current => current + 1), delay)
    return () => { active = false; window.clearTimeout(timer) }
  }, [data?.surveyRequests, logged, online, surveySyncTick])

  const navigate = (next: Page) => {
    setPage(next)
    if (isOperationPage(next)) setOperationOpen(true)
    if (isManagementPage(next)) setManagementOpen(true)
    if (isPersonalPage(next)) setPersonalOpen(true)
    if (isStockPage(next)) setStockOpen(true)
    if (isMaintenancePage(next)) setMaintenanceOpen(true)
    if (isDocumentPage(next)) setDocumentsOpen(true)
    if (isReportPage(next)) setReportsOpen(true)
    setDrawer(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const signOut = () => {
    sessionStorage.removeItem('gio-admin-session')
    clearServerSession()
    setLogged(false)
  }

  const register = (record: QuickRecord) => {
    if (!online) setPendingSync(current => current + 1)
    setActiveAction(null)
    showToast(online ? 'Registro realizado com sucesso.' : 'Registro salvo neste celular e aguardando internet.')
    if (data) {
      const next: AppData = { ...data, trajectories: [...data.trajectories, { id: crypto.randomUUID(), type: record.action, declaredDate: record.date, declaredTime: record.time, recordedAt: new Date().toISOString(), formOpenedAt: record.formOpenedAt, client: record.client, team: record.team, observation: record.observation, latitude: record.latitude, longitude: record.longitude, accuracy: record.accuracy, author: data.account.name, pendingSync: !online }] }
      if (record.action === 'Esqueci meu ponto') next.notifications = [...next.notifications, { id: crypto.randomUUID(), title: 'Ponto esquecido registrado', detail: `${data.account.name} · ${record.summary}`, createdAt: new Date().toISOString(), read: false, critical: true }]
      updateData(next)
    }
  }

  if (loading) return <main className="loading-page"><img src={publicAsset('alert-logo.png')} alt="Alert" /><span>Preparando a GIO...</span></main>
  if (!data) return <main className="loading-page"><AlertTriangle /><b>Não foi possível abrir os dados locais.</b></main>
  if (!logged) return <Login onLogin={async (email, password) => {
    const central = await loginCentralServer(email, password)
    if (central.usedServer) {
      if (central.error || !central.data) return central.error || 'Não foi possível abrir os dados do servidor.'
      const ready = normalizeAppData(central.data)
      setData(ready)
      void saveAppData(ready)
      void saveCentralData(ready).catch(() => undefined)
      sessionStorage.setItem('gio-admin-session', '1')
      setLogged(true)
      return null
    }
    const normalizedEmail = email.trim().toLowerCase()
    const person = data.people.find(item => item.active && item.canLogin && item.email.trim().toLowerCase() === normalizedEmail)
    if (!person) return 'E-mail ou senha inválidos.'
    const account = accountFromPerson(person, data.account)
    if (!account.passwordHash || await hashPassword(password) !== account.passwordHash) return 'E-mail ou senha inválidos.'
    const ready = { ...data, account }
    setData(ready)
    void saveAppData(ready)
    sessionStorage.setItem('gio-admin-session', '1')
    setLogged(true)
    return null
  }} />
  if (data.account.mustChangePassword) return <PasswordChange onSave={async password => {
    const passwordHash = await hashPassword(password)
    const next = {
      ...data,
      account: { ...data.account, passwordHash, mustChangePassword: false },
      people: data.people.map(person => person.id === data.account.id ? { ...person, passwordHash, mustChangePassword: false } : person),
    }
    updateData(next)
  }} onSignOut={signOut} />

  const currentPerson = data.people.find(person => person.id === data.account.id)
  const currentProfiles = normalizeProfiles(currentPerson?.groups)
  const allowedPages = allowedPagesForProfiles(currentProfiles)
  const visiblePage: Page = allowedPages.has(page) ? page : 'inicio'
  const visibleOperationPages = operationPages.filter(item => allowedPages.has(item.id))
  const visibleManagementPages = managementPages.filter(item => allowedPages.has(item.id))
  const visiblePersonalPages = personalPages.filter(item => allowedPages.has(item.id))
  const visibleStockPages = stockPages.filter(item => allowedPages.has(item.id))
  const visibleMaintenancePages = maintenancePages.filter(item => allowedPages.has(item.id))
  const visibleDocumentPages = documentPages.filter(item => allowedPages.has(item.id))
  const visibleReportPages = reportPages.filter(item => allowedPages.has(item.id))
  const visibleNav = nav.filter(item => {
    if (item.label === 'Operação') return visibleOperationPages.length > 0
    if (item.label === 'Gestão') return visibleManagementPages.length > 0
    if (item.label === 'Pessoal') return visiblePersonalPages.length > 0
    if (item.label === 'Estoque') return visibleStockPages.length > 0
    if (item.label === 'Manutenção') return visibleMaintenancePages.length > 0
    if (item.label === 'Documentos') return visibleDocumentPages.length > 0
    if (item.label === 'Relatórios') return visibleReportPages.length > 0
    return allowedPages.has(item.id)
  })
  const canManageStock = hasProfile(currentProfiles, 'Estoque')
  const canAuditAll = hasProfile(currentProfiles, 'Auditoria')
  const activeReport = visibleReportPages.find(item => item.id === visiblePage)
  const activeDocument = visibleDocumentPages.find(item => item.id === visiblePage)
  const title = operationPages.find(item => item.id === visiblePage)?.label ?? managementPages.find(item => item.id === visiblePage)?.label ?? personalPages.find(item => item.id === visiblePage)?.label ?? stockPages.find(item => item.id === visiblePage)?.label ?? maintenancePages.find(item => item.id === visiblePage)?.label ?? activeDocument?.label ?? activeReport?.label ?? nav.find(item => item.id === visiblePage)?.label ?? 'Início'
  const initials = data.account.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()

  return <div className="app-shell">
    <aside className={drawer ? 'sidebar open' : 'sidebar'}>
      <div className="brand-block">
        <div className="brand-logo-card"><img src={publicAsset('alert-logo.png')} alt="Alert" /></div>
        <div><b>GIO</b><span>Gestão Integrada<br />de Operações</span></div>
      </div>
      <nav className="main-nav" aria-label="Navegação principal">
        {visibleNav.map(item => {
          const Icon = item.icon
          if (item.label === 'Operação') return <div className="nav-group" key={item.id}>
            <button className={isOperationPage(visiblePage) ? 'nav-item active' : 'nav-item'} onClick={() => setOperationOpen(current => !current)} aria-expanded={operationOpen}>
              <Icon size={20} /><span>{item.label}</span><ChevronDown className={operationOpen ? 'nav-chevron open' : 'nav-chevron'} size={17} />
            </button>
            {operationOpen && <div className="nav-submenu">{visibleOperationPages.map(subitem => {
              const SubIcon = subitem.icon
              return <button key={subitem.id} className={visiblePage === subitem.id ? 'nav-subitem active' : 'nav-subitem'} onClick={() => navigate(subitem.id)}><SubIcon size={16} /><span>{subitem.label}</span></button>
            })}</div>}
          </div>
          if (item.label === 'Gestão') return <div className="nav-group" key={item.id}>
            <button className={isManagementPage(visiblePage) ? 'nav-item active' : 'nav-item'} onClick={() => setManagementOpen(current => !current)} aria-expanded={managementOpen}>
              <Icon size={20} /><span>{item.label}</span><ChevronDown className={managementOpen ? 'nav-chevron open' : 'nav-chevron'} size={17} />
            </button>
            {managementOpen && <div className="nav-submenu">{visibleManagementPages.map(subitem => {
              const SubIcon = subitem.icon
              return <button key={subitem.id} className={visiblePage === subitem.id ? 'nav-subitem active' : 'nav-subitem'} onClick={() => navigate(subitem.id)}><SubIcon size={16} /><span>{subitem.label}</span></button>
            })}</div>}
          </div>
          if (item.label === 'Pessoal') return <div className="nav-group" key={item.id}>
            <button className={isPersonalPage(visiblePage) ? 'nav-item active' : 'nav-item'} onClick={() => setPersonalOpen(current => !current)} aria-expanded={personalOpen}>
              <Icon size={20} /><span>{item.label}</span><ChevronDown className={personalOpen ? 'nav-chevron open' : 'nav-chevron'} size={17} />
            </button>
            {personalOpen && <div className="nav-submenu">{visiblePersonalPages.map(subitem => {
              const SubIcon = subitem.icon
              return <button key={subitem.id} className={visiblePage === subitem.id ? 'nav-subitem active' : 'nav-subitem'} onClick={() => navigate(subitem.id)}><SubIcon size={16} /><span>{subitem.label}</span></button>
            })}</div>}
          </div>
          if (item.label === 'Estoque') return <div className="nav-group" key={item.id}>
            <button className={isStockPage(visiblePage) ? 'nav-item active' : 'nav-item'} onClick={() => setStockOpen(current => !current)} aria-expanded={stockOpen}>
              <Icon size={20} /><span>{item.label}</span><ChevronDown className={stockOpen ? 'nav-chevron open' : 'nav-chevron'} size={17} />
            </button>
            {stockOpen && <div className="nav-submenu">{visibleStockPages.map(subitem => {
              const SubIcon = subitem.icon
              return <button key={subitem.id} className={visiblePage === subitem.id ? 'nav-subitem active' : 'nav-subitem'} onClick={() => navigate(subitem.id)}><SubIcon size={16} /><span>{subitem.label}</span></button>
            })}</div>}
          </div>
          if (item.label === 'Manutenção') return <div className="nav-group" key={item.id}>
            <button className={isMaintenancePage(visiblePage) ? 'nav-item active' : 'nav-item'} onClick={() => setMaintenanceOpen(current => !current)} aria-expanded={maintenanceOpen}>
              <Icon size={20} /><span>{item.label}</span><ChevronDown className={maintenanceOpen ? 'nav-chevron open' : 'nav-chevron'} size={17} />
            </button>
            {maintenanceOpen && <div className="nav-submenu">{visibleMaintenancePages.map(subitem => {
              const SubIcon = subitem.icon
              return <button key={subitem.id} className={visiblePage === subitem.id ? 'nav-subitem active' : 'nav-subitem'} onClick={() => navigate(subitem.id)}><SubIcon size={16} /><span>{subitem.label}</span></button>
            })}</div>}
          </div>
          if (item.label === 'Relatórios') return <div className="nav-group" key={item.id}>
            <button className={isReportPage(visiblePage) ? 'nav-item active' : 'nav-item'} onClick={() => setReportsOpen(current => !current)} aria-expanded={reportsOpen}>
              <Icon size={20} /><span>{item.label}</span><ChevronDown className={reportsOpen ? 'nav-chevron open' : 'nav-chevron'} size={17} />
            </button>
            {reportsOpen && <div className="nav-submenu">{visibleReportPages.map(subitem => {
              const SubIcon = subitem.icon
              return <button key={subitem.id} className={visiblePage === subitem.id ? 'nav-subitem active' : 'nav-subitem'} onClick={() => navigate(subitem.id)}><SubIcon size={16} /><span>{subitem.label}</span></button>
            })}</div>}
          </div>
          if (item.label === 'Documentos') return <div className="nav-group" key={item.id}>
            <button className={isDocumentPage(visiblePage) ? 'nav-item active' : 'nav-item'} onClick={() => setDocumentsOpen(current => !current)} aria-expanded={documentsOpen}>
              <Icon size={20} /><span>{item.label}</span><ChevronDown className={documentsOpen ? 'nav-chevron open' : 'nav-chevron'} size={17} />
            </button>
            {documentsOpen && <div className="nav-submenu">{visibleDocumentPages.map(subitem => {
              const SubIcon = subitem.icon
              return <button key={subitem.id} className={visiblePage === subitem.id ? 'nav-subitem active' : 'nav-subitem'} onClick={() => navigate(subitem.id)}><SubIcon size={16} /><span>{subitem.label}</span></button>
            })}</div>}
          </div>
          return <button key={item.id} className={visiblePage === item.id ? 'nav-item active' : 'nav-item'} onClick={() => navigate(item.id)}><Icon size={20} /><span>{item.label}</span></button>
        })}
      </nav>
      <div className="sidebar-foot">
        <div className="profile-avatar">{initials}</div>
        <div className="profile-copy"><b>{data.account.name}</b><span>{profileSummary(currentProfiles)}</span></div>
        <button className="icon-button dark" onClick={signOut} aria-label="Sair"><LogOut size={18} /></button>
      </div>
    </aside>

    {drawer && <button className="drawer-backdrop" onClick={() => setDrawer(false)} aria-label="Fechar menu" />}

    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-button menu-button" onClick={() => setDrawer(true)} aria-label="Abrir menu"><Menu size={22} /></button>
          <div><span className="breadcrumb">GIO</span><h1>{title}</h1></div>
        </div>
        <div className="topbar-actions">
          <span className={online ? 'connection online' : 'connection offline'}>
            {online ? <Signal size={15} /> : <SignalZero size={15} />}
            {online ? 'Online' : 'Sem internet'}
          </span>
          <button className="notification-button" aria-label="Notificações"><Bell size={20} />{data.notifications.some(item => !item.read) && <span>{data.notifications.filter(item => !item.read).length}</span>}</button>
          <div className="top-avatar">{initials}</div>
        </div>
      </header>

      {!online && <div className="offline-banner"><SignalZero size={18} /><span>Você está sem internet. Continue trabalhando: os registros serão enviados automaticamente quando a conexão voltar.</span></div>}
      {pendingSync > 0 && <div className="sync-banner"><Signal size={18} /><span>{pendingSync} {pendingSync === 1 ? 'registro aguardando' : 'registros aguardando'} sincronização.</span></div>}

      <main className="page-content">
        {toast && <div className="toast" role="status"><CheckCircle2 size={19} />{toast}</div>}
        {visiblePage === 'inicio' && <Dashboard data={data} allowedPages={allowedPages} profiles={currentProfiles} onAction={setActiveAction} onNavigate={navigate} onKm={() => setKmOpen(true)} onRequest={() => setRequestOpen(true)} />}
        {isOperationPage(visiblePage) && <OperationPage section={visiblePage} data={data} onAction={setActiveAction} onKm={() => setKmOpen(true)} />}
        {visiblePage === 'gestao-auditoria' && <AuditPage data={data} allowedCategories={canAuditAll ? ['Ferramentas', 'EPIs', 'Escadas'] : ['Escadas']} onStart={setActiveAudit} />}
        {visiblePage === 'gestao-solicitacoes' && <StockRequestsPage data={data} onNewRequest={() => setRequestOpen(true)} />}
        {visiblePage === 'gestao-levantamento' && <SurveyPage data={data} onChange={updateData} />}
        {['pessoal-ferramentas', 'pessoal-insumos', 'pessoal-epis'].includes(visiblePage) && <StockPage section={visiblePage} data={data} onChange={updateData} />}
        {visiblePage === 'pessoal-aprovacoes' && <StockApprovals data={data} onChange={updateData} />}
        {visiblePage === 'estoque-baixas' && <MaterialWriteOffsPage data={data} onChange={updateData} />}
        {visiblePage === 'estoque-pedidos' && <StockOrdersPage data={data} onChange={updateData} />}
        {visiblePage === 'estoque-gerenciamento' && canManageStock && <StockManagement data={data} onChange={updateData} />}
        {visiblePage === 'manutencao-rma' && <RmaRequestPage data={data} onChange={updateData} />}
        {visiblePage === 'manutencao-danificados' && <DamagedEquipmentPage data={data} onChange={updateData} />}
        {activeDocument && <DocumentsPage data={data} section={activeDocument.section} />}
        {activeReport && <ReportsPage key={activeReport.reportId} data={data} reportId={activeReport.reportId} />}
        {visiblePage === 'configuracoes' && <SettingsPage data={data} onChange={updateData} />}
      </main>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        {visibleNav.map(item => {
          const Icon = item.icon
          const active = item.label === 'Operação' ? isOperationPage(visiblePage) : item.label === 'Gestão' ? isManagementPage(visiblePage) : item.label === 'Pessoal' ? isPersonalPage(visiblePage) : item.label === 'Estoque' ? isStockPage(visiblePage) : item.label === 'Manutenção' ? isMaintenancePage(visiblePage) : item.label === 'Documentos' ? isDocumentPage(visiblePage) : item.label === 'Relatórios' ? isReportPage(visiblePage) : visiblePage === item.id
          const target = item.label === 'Operação' ? visibleOperationPages[0]?.id : item.label === 'Gestão' ? visibleManagementPages[0]?.id : item.label === 'Pessoal' ? visiblePersonalPages[0]?.id : item.label === 'Estoque' ? visibleStockPages[0]?.id : item.label === 'Manutenção' ? visibleMaintenancePages[0]?.id : item.label === 'Documentos' ? visibleDocumentPages[0]?.id : item.label === 'Relatórios' ? visibleReportPages[0]?.id : item.id
          return <button key={item.id} className={active ? 'active' : ''} onClick={() => target && navigate(target)}><Icon size={20} /><span>{item.label === 'Configurações' ? 'Mais' : item.label}</span></button>
        })}
      </nav>
    </div>

    {activeAction && <QuickRegister action={activeAction} online={online} clients={data.clients.filter(item => item.active).map(item => item.name)} technicians={data.people.filter(item => item.active && item.id !== data.account.id).map(item => item.name)} onClose={() => setActiveAction(null)} onSave={register} />}
    {kmOpen && <KmForm vehicles={data.vehicles.filter(item => item.active)} clients={data.clients.filter(item => item.active).map(item => item.name)} driver={data.account.name} onClose={() => setKmOpen(false)} onComplete={record => { const next = { ...data, kmRecords: [...data.kmRecords, record], vehicles: data.vehicles.map(vehicle => vehicle.plate === record.vehicle ? { ...vehicle, mileage: record.mileage } : vehicle) }; updateData(next); setKmOpen(false); showToast('Relatório de KM registrado com sucesso.') }} />}
    {requestOpen && <StockRequestForm code={nextRequestCode(data)} requester={data.account.name} people={data.people} clients={data.clients} onClose={() => setRequestOpen(false)} onComplete={request => {
      const stockRequest: StockRequest = { id: crypto.randomUUID(), ...request, createdAt: new Date().toISOString(), status: 'Pedido recebido', author: data.account.name }
      const technicianExists = data.people.some(person => person.name.trim().toLowerCase() === request.technician.trim().toLowerCase())
      const people = technicianExists ? data.people : [...data.people, { id: crypto.randomUUID(), name: request.technician, email: '', groups: ['Técnico'], active: true, canLogin: false }]
      updateData({ ...data, people, stockRequests: [...data.stockRequests, stockRequest] }); setRequestOpen(false); showToast(`Solicitação ${request.code} criada com sucesso.`)
    }} />}
    {activeAudit && <AuditWizard data={data} start={activeAudit} onCancel={() => setActiveAudit(null)} onComplete={audit => { const nextDate = new Date(`${audit.nextAuditDate}T12:00:00`).toLocaleDateString('pt-BR'); updateData(recordCompletedAudit(data, audit), `Auditoria concluída e PDF salvo. Próxima auditoria: ${nextDate}.`); setActiveAudit(null) }} />}
  </div>
}

function Login({ onLogin }: { onLogin: (email: string, password: string) => Promise<string | null> }) {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    const message = await onLogin(email, password)
    setBusy(false)
    setError(message || '')
  }
  return <main className="login-page">
    <section className="login-message">
      <div className="login-brand"><span className="login-logo"><img src={publicAsset('alert-logo.png')} alt="Alert" /></span><b>GIO</b></div>
      <p className="eyebrow light">Gestão Integrada de Operações</p>
      <h1>Operação organizada.<br />Equipe conectada.</h1>
      <p>Uma única plataforma para acompanhar equipes, trajetos, veículos, estoque e auditorias.</p>
      <div className="login-points"><span><CheckCircle2 size={18} />Preparado para celular</span><span><CheckCircle2 size={18} />Funciona mesmo sem internet</span><span><CheckCircle2 size={18} />Acessos por departamento</span></div>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <div className="mobile-login-brand"><span className="login-logo"><img src={publicAsset('alert-logo.png')} alt="Alert" /></span><b>GIO</b></div>
        <p className="eyebrow">Acesso seguro</p>
        <h2>Bem-vindo à GIO</h2>
        <p className="form-intro">Entre com seu e-mail e senha para continuar.</p>
        <label>E-mail<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" required /></label>
        <label>Senha<div className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div></label>
        {error && <div className="login-error"><AlertTriangle size={17} />{error}</div>}
        <button className="primary-button full" type="submit" disabled={busy}>{busy ? 'Verificando...' : 'Entrar na plataforma'} {!busy && <ChevronRight size={18} />}</button>
        <button className="text-button" type="button" onClick={() => setError('Solicite uma nova senha provisória ao administrador da GIO.')}>Preciso de uma nova senha provisória</button>
        <div className="preview-note"><ShieldCheck size={18} /><span>Seu acesso e os menus disponíveis são definidos pelos perfis cadastrados pelo administrador.</span></div>
      </form>
    </section>
  </main>
}

function PasswordChange({ onSave, onSignOut }: { onSave: (password: string) => Promise<void>; onSignOut: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError('Use pelo menos 8 caracteres, com letra e número.')
    if (password !== confirmation) return setError('As senhas informadas são diferentes.')
    await onSave(password)
  }
  return <main className="password-change-page"><form className="login-card" onSubmit={submit}><img className="password-logo" src={publicAsset('alert-logo.png')} alt="Alert" /><p className="eyebrow">Primeiro acesso</p><h2>Crie sua nova senha</h2><p className="form-intro">A senha provisória só pode ser usada uma vez.</p><label>Nova senha<input type="password" value={password} onChange={event => setPassword(event.target.value)} required /></label><label>Confirmar nova senha<input type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label>{error && <div className="login-error"><AlertTriangle size={17} />{error}</div>}<button className="primary-button full">Salvar nova senha <ChevronRight size={18} /></button><button type="button" className="text-button" onClick={onSignOut}>Voltar ao login</button></form></main>
}

function Dashboard({ data, allowedPages, profiles, onAction, onNavigate, onKm, onRequest }: { data: AppData; allowedPages: Set<Page>; profiles: string[]; onAction: (action: ActionName) => void; onNavigate: (page: Page) => void; onKm: () => void; onRequest: () => void }) {
  const date = useMemo(() => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date()), [])
  const activities = [
    ...data.trajectories.filter(item => item.author === data.account.name && new Date(item.recordedAt).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')).map(item => ({ title: item.type, detail: `${item.client || 'Sem cliente'} · ${item.declaredTime}`, tone: item.type === 'Esqueci meu ponto' ? 'warning' : 'success', recordedAt: item.recordedAt })),
    ...data.kmRecords.filter(item => item.driver === data.account.name && new Date(item.createdAt).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')).map(item => ({ title: 'Relatório de KM', detail: `${item.vehicle} · ${item.mileage.toLocaleString('pt-BR')} km`, tone: 'success', recordedAt: item.createdAt })),
  ].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
  const nextAudit = upcomingPersonalAudits(data, data.account.id, todayInput())[0]
  const pendingApprovals = data.stockAssignments.filter(item => item.personId === data.account.id && item.status === 'Pendente').length
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return <>
    <section className="welcome-row">
      <div><p className="eyebrow">{date}</p><h2>Bom dia, {data.account.name.split(' ')[0]}</h2><p>Perfis ativos: {profileSummary(profiles)}.</p></div>
      <button className="secondary-button"><Download size={17} /> Instalar GIO no celular</button>
    </section>

    <section className="attention-grid home-quick-links">
      <button className="attention-card success" onClick={() => scrollTo('home-latest-records')}><span><ClipboardList size={21} /></span><div><b>Últimos registros</b><small>{activities.length} registros seus hoje</small></div><ChevronRight size={19} /></button>
      <button className="attention-card warning" onClick={() => onNavigate('gestao-auditoria')}><span><CalendarClock size={21} /></span><div><b>Auditoria próxima</b><small>{nextAudit ? `${nextAudit.category} · ${new Date(`${nextAudit.date}T12:00:00`).toLocaleDateString('pt-BR')}${nextAudit.date < todayInput() ? ' · Em atraso' : nextAudit.first ? ' · Primeira auditoria' : ''}` : 'Nenhuma auditoria pendente'}</small></div><ChevronRight size={19} /></button>
      <button className="attention-card neutral" onClick={() => scrollTo('home-quick-register')}><span><MapPin size={21} /></span><div><b>Registro rápido</b><small>Preencher um apontamento</small></div><ChevronRight size={19} /></button>
      <button className="attention-card warning" onClick={() => onNavigate('pessoal-aprovacoes')}><span><PackageCheck size={21} /></span><div><b>Aprovações pendentes</b><small>{pendingApprovals} aguardando sua confirmação</small></div><ChevronRight size={19} /></button>
    </section>

    <section className="form-shortcuts"><button onClick={onKm}><span><CarFront size={22} /></span><div><b>Relatório de KM</b><small>Registre antes de ligar o veículo</small></div><ChevronRight size={19} /></button>{allowedPages.has('gestao-solicitacoes') && <button onClick={onRequest}><span><PackageCheck size={22} /></span><div><b>Nova solicitação ao estoque</b><small>Solicite materiais e acompanhe a entrega</small></div><ChevronRight size={19} /></button>}</section>

    <section className="content-grid">
      <article className="surface quick-surface" id="home-quick-register">
        <div className="section-heading"><div><p className="eyebrow">Registro rápido</p><h3>O que está acontecendo agora?</h3></div><MapPin size={21} /></div>
        <div className="action-grid">{actions.map(item => {
          const Icon = item.icon
          return <button key={item.label} className={item.label === 'Esqueci meu ponto' ? 'action-card point' : 'action-card'} onClick={() => onAction(item.label)}><span><Icon size={21} /></span><div><b>{item.label}</b><small>{item.detail}</small></div><ChevronRight size={18} /></button>
        })}</div>
      </article>

      <aside className="surface activity-surface" id="home-latest-records">
        <div className="section-heading"><div><p className="eyebrow">Hoje</p><h3>Seus últimos registros</h3></div><button className="icon-button"><ChevronRight size={18} /></button></div>
        <div className="timeline">{activities.length ? activities.slice(0, 5).map((item, index) => <div className={`timeline-item ${item.tone}`} key={`${item.title}-${index}`}><span className="timeline-dot" /><div><b>{item.title}</b><small>{item.detail}</small></div></div>) : <p className="table-empty">Nenhum registro realizado hoje.</p>}</div>
        <p className="privacy-note"><ShieldCheck size={16} />As coordenadas e o horário real são protegidos e visíveis somente nos relatórios autorizados.</p>
      </aside>
    </section>
  </>
}

function OperationPage({ section, data, onAction, onKm }: { section: Page; data: AppData; onAction: (action: ActionName) => void; onKm: () => void }) {
  if (section === 'operacao-km') return <>
    <PageIntro eyebrow="Operação de campo" title="Relatório de KM" description="Registre o veículo, a quilometragem atual e o destino antes de iniciar o deslocamento." action={<button className="primary-button" onClick={onKm}><Plus size={18} /> Novo relatório de KM</button>} />
    <section className="surface table-surface"><div className="table-toolbar"><div><p className="eyebrow">Histórico</p><h3>Registros de quilometragem</h3></div></div><div className="responsive-table"><table><thead><tr><th>Data</th><th>Veículo</th><th>Condutor</th><th>Destino</th><th>Quilometragem</th></tr></thead><tbody>{data.kmRecords.length ? [...data.kmRecords].reverse().map(item => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString('pt-BR')}</td><td>{item.vehicle}</td><td>{item.driver}</td><td>{item.destination}</td><td>{item.mileage.toLocaleString('pt-BR')} km</td></tr>) : <tr><td colSpan={5} className="table-empty">Nenhum relatório de KM registrado.</td></tr>}</tbody></table></div></section>
  </>

  if (section === 'operacao-ponto') {
    const pointAction = actions.find(item => item.label === 'Esqueci meu ponto')!
    const PointIcon = pointAction.icon
    return <>
      <PageIntro eyebrow="Operação de campo" title="Esqueci meu ponto" description="Registre um ponto não realizado no outro aplicativo. O RH será avisado automaticamente." />
      <section className="action-grid operation-actions single-action"><button className="action-card point" onClick={() => onAction(pointAction.label)}><span><PointIcon size={21} /></span><div><b>Novo registro de ponto esquecido</b><small>Entrada, saída, início ou término do almoço</small></div><ChevronRight size={18} /></button></section>
      <section className="surface empty-state"><CalendarClock size={30} /><h3>Prazo de até 7 dias corridos</h3><p>A data e o horário informados ficam registrados junto do momento real e da localização do envio. A justificativa é obrigatória.</p></section>
    </>
  }

  return <>
    <PageIntro eyebrow="Operação de campo" title="Registro do dia" description="Registre os acontecimentos do deslocamento no mesmo dia. Registros enviados não podem ser desfeitos." />
    <section className="action-grid operation-actions">{dayActions.map(item => {
      const Icon = item.icon
      return <button key={item.label} className="action-card" onClick={() => onAction(item.label)}><span><Icon size={21} /></span><div><b>{item.label}</b><small>{item.detail}</small></div><ChevronRight size={18} /></button>
    })}</section>
    <section className="surface empty-state"><MapPin size={30} /><h3>Localização protegida</h3><p>A data, o horário e a precisão do GPS serão registrados automaticamente, sem exibir as coordenadas ao técnico.</p></section>
  </>
}

function StockPage({ section, data, onChange }: { section: Page; data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const [writeOffItem, setWriteOffItem] = useState<InventoryItem | null>(null)
  const [printDocument, setPrintDocument] = useState<PrintDocument | null>(null)
  const [search, setSearch] = useState('')
  const config = section === 'pessoal-ferramentas'
    ? { title: 'Ferramentas', description: 'Consulte suas ferramentas, escadas e o resultado da última auditoria. Imprima cada bloco separadamente.', filter: (category: string) => category.includes('Ferramenta') || category === 'Escada' }
    : section === 'pessoal-epis'
      ? { title: 'EPIs', description: 'Acompanhe e dê baixa nos equipamentos de proteção individual sob sua responsabilidade.', filter: (category: string) => category === 'EPI' }
      : { title: 'Insumos', description: 'Acompanhe os materiais de consumo e registre quando forem instalados ou devolvidos.', filter: (category: string) => category === 'Insumo' }
  const filteredItems = personalInventory(data, data.account.id).filter(item => config.filter(item.category))
  const renderStockTable = (title: string, items: typeof filteredItems, secondary = false) => <section className={secondary ? 'surface table-surface stock-secondary-table' : 'surface table-surface'}>
    <div className="table-toolbar"><div><p className="eyebrow">Estoque individual</p><h3>{title}</h3></div><button className="secondary-button compact" disabled={!items.length} onClick={() => setPrintDocument(inventoryPrintDocument(data, title, items))}><Printer size={17} /> Imprimir este bloco</button></div>
    <div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Código / identificador</th><th>Marca / modelo</th><th>Unidade</th><th>Quantidade</th><th>Status</th><th>Ação</th></tr></thead><tbody>{items.length ? items.filter(item => `${item.equipment} ${item.code} ${itemIdentifier(data, data.account.id, item)}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))).map(item => { const status = itemAuditStatus(data, data.account.id, item); const audit = latestItemAudit(data, data.account.id, item.id); return <tr key={item.id}>
      <td>{item.equipment}</td><td>{itemIdentifier(data, data.account.id, item)}{itemIdentifier(data, data.account.id, item) !== item.code && <small className="table-subtitle">Cadastro: {item.code}</small>}</td><td>{[item.brand, item.model].filter(Boolean).join(' ') || '—'}</td><td>{item.unit}</td><td>{formatQuantity(item.quantity)}</td><td><span className={`status ${status === 'Não aprovado' || status === 'Não liberada' ? 'danger' : status === 'Não auditado' ? 'warning' : 'success'}`}>{status}</span>{item.ladderRestriction && <small className="table-subtitle">Entre em contato com seu gestor e solicite a substituição.</small>}{audit && <small className="table-subtitle">{new Date(audit.record.completedAt).toLocaleDateString('pt-BR')}{audit.result.observation && ` · ${audit.result.observation}`}</small>}</td><td><button className="secondary-button compact" onClick={() => setWriteOffItem(item)}><ClipboardCheck size={15} /> Dar baixa</button></td>
    </tr> }) : <tr><td colSpan={7} className="table-empty">Nenhum item deste tipo foi atribuído a você.</td></tr>}</tbody></table></div>
  </section>
  return <>
    <PageIntro eyebrow="Pessoal" title={config.title} description={config.description} action={<label className="search-field"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar equipamento" /></label>} />
    <section className="attention-grid stock-summary"><Metric icon={Warehouse} value={String(filteredItems.length)} label={`Tipos de ${config.title.toLowerCase()}`} /><Metric icon={ClipboardCheck} value={String(data.materialUsages.filter(item => item.personId === data.account.id && item.workflowStatus !== 'Cancelado').length)} label="Baixas realizadas" /><Metric icon={Boxes} value={formatQuantity(filteredItems.reduce((total, item) => total + item.quantity, 0))} label="Quantidade atribuída" /></section>
    {section === 'pessoal-ferramentas' ? <>
      {renderStockTable('Ferramentas atribuídas a você', filteredItems.filter(item => item.category === 'Ferramenta pessoal'))}
      {renderStockTable('Ferramentas rotativas atribuídas a você', filteredItems.filter(item => item.category === 'Ferramenta rotativa'), true)}
      {renderStockTable('Escadas atribuídas a você', filteredItems.filter(item => item.category === 'Escada'), true)}
    </> : renderStockTable(`${config.title} atribuídos a você`, filteredItems)}
    {writeOffItem && <MaterialWriteOffModal data={data} item={writeOffItem} available={writeOffItem.quantity} onClose={() => setWriteOffItem(null)} onChange={onChange} />}
    {printDocument && <PrintDialog document={printDocument} onClose={() => setPrintDocument(null)} />}
  </>
}

function SettingsPage({ data, onChange }: { data: AppData; onChange: (data: AppData, message: string) => void }) {
  return <>
    <PageIntro eyebrow="Administração" title="Configurações e acessos" description="Cadastre pessoas e atribua um ou mais perfis predefinidos para cada operador." />
    <section className="settings-grid"><button className="setting-card"><Users size={22} /><div><b>Pessoas e grupos</b><small>{data.people.length} pessoas cadastradas</small></div><ChevronRight size={18} /></button><button className="setting-card"><Warehouse size={22} /><div><b>Clientes e veículos</b><small>{data.clients.length} clientes · {data.vehicles.length} veículos</small></div><ChevronRight size={18} /></button><button className="setting-card"><ShieldCheck size={22} /><div><b>Histórico de segurança</b><small>Administrador com acesso total</small></div><ChevronRight size={18} /></button></section>
    <section className="surface profile-rules"><div className="section-heading"><div><p className="eyebrow">Perfis predefinidos</p><h3>Acessos da plataforma</h3></div><ShieldCheck size={22} /></div><div className="profile-rule-grid">{profileNames.map(profile => <article className={profile === 'Administrador' ? 'profile-rule admin' : 'profile-rule'} key={profile}><div><b>{profile}</b>{profile !== 'Técnico' && profile !== 'Administrador' && <span>Inclui o acesso do Técnico</span>}</div><p>{profileDescriptions[profile]}</p></article>)}</div><p className="admin-note"><ShieldCheck size={17} />Os perfis são acumuláveis. O Administrador sempre possui acesso total e não depende de combinações.</p></section>
    <AdminCatalogs data={data} onChange={onChange} />
  </>
}

function QuickRegister({ action, online, clients, technicians, onClose, onSave }: { action: ActionName; online: boolean; clients: string[]; technicians: string[]; onClose: () => void; onSave: (record: QuickRecord) => void }) {
  const [formOpenedAt] = useState(() => new Date().toISOString())
  const [date, setDate] = useState(todayInput())
  const [time, setTime] = useState(nowInput())
  const [client, setClient] = useState('')
  const [pointType, setPointType] = useState('Entrada')
  const [observation, setObservation] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<string[]>([])
  const [location, setLocation] = useState<{ latitude?: number; longitude?: number; accuracy?: number; status: 'capturing' | 'ready' | 'error' }>({ status: 'capturing' })
  const isPoint = action === 'Esqueci meu ponto'
  const needsTeam = action === 'Encontro' || action === 'Desencontro'
  const minDate = localDateInput(new Date(Date.now() - 6 * 86400000))

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(position => setLocation({ status: 'ready', latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }), () => setLocation({ status: 'error' }), { enableHighAccuracy: true, timeout: 12000 })
  }, [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const detail = isPoint ? `${pointType} · ${time}` : `${client || 'Sem cliente'} · ${time}`
    if (location.status !== 'ready') return
    onSave({ action, summary: detail, date, time, formOpenedAt, client: isPoint ? pointType : client, team: selectedTeam, observation, latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy })
  }

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={action}>
    <button className="modal-backdrop" onClick={onClose} aria-label="Fechar" />
    <form className="quick-modal" onSubmit={submit}>
      <div className="modal-heading"><div><p className="eyebrow">Novo registro</p><h2>{action}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={21} /></button></div>
      <div className={location.status === 'error' ? 'capture-state error' : online ? 'capture-state' : 'capture-state offline'}>{location.status === 'error' ? <AlertTriangle size={18} /> : online ? <MapPin size={18} /> : <SignalZero size={18} />}<div><b>{location.status === 'capturing' ? 'Obtendo localização...' : location.status === 'error' ? 'Ative a localização para continuar' : online ? 'Localização pronta para registrar' : 'Registro será salvo offline'}</b><small>{location.status === 'ready' ? `Precisão aproximada de ${Math.round(location.accuracy || 0)} metros.` : 'A localização é obrigatória para concluir este registro.'}</small></div></div>
      <div className="form-grid">
        <label>Data<input type="date" value={date} min={isPoint ? minDate : todayInput()} max={todayInput()} onChange={event => setDate(event.target.value)} required /></label>
        <label>Horário informado<input type="time" value={time} onChange={event => setTime(event.target.value)} required /></label>
        {isPoint ? <label>Tipo de ponto<select value={pointType} onChange={event => setPointType(event.target.value)}><option>Entrada</option><option>Saída</option><option>Início do almoço</option><option>Término do almoço</option></select></label> : <label>Cliente (opcional)<select value={client} onChange={event => setClient(event.target.value)}><option value="">Sem cliente</option>{clients.map(item => <option key={item}>{item}</option>)}<option>Outros</option></select></label>}
      </div>
      {needsTeam && <fieldset className="team-field"><legend>Técnicos envolvidos</legend><div>{technicians.map(name => <label key={name}><input type="checkbox" checked={selectedTeam.includes(name)} onChange={() => setSelectedTeam(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name])} />{name}</label>)}</div>{selectedTeam.length === 0 && <small>Selecione pelo menos um técnico para continuar.</small>}</fieldset>}
      <label>{isPoint ? 'Justificativa obrigatória' : 'Observação (opcional)'}<textarea value={observation} onChange={event => setObservation(event.target.value)} required={isPoint} placeholder={isPoint ? 'Explique por que o ponto não foi registrado no outro aplicativo.' : 'Inclua uma informação importante, se necessário.'} /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={(needsTeam && selectedTeam.length === 0) || location.status !== 'ready'}>Confirmar registro <ChevronRight size={18} /></button></div>
    </form>
  </div>
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <section className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div>{action}</section>
}

function Metric({ icon: Icon, value, label, tone = '' }: { icon: ComponentType<{ size?: number }>; value: string; label: string; tone?: string }) {
  return <article className={`metric-card ${tone}`}><span><Icon size={21} /></span><div><b>{value}</b><small>{label}</small></div></article>
}

function nextRequestCode(data: AppData) {
  const date = new Date()
  const prefix = `ALT${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}`
  const sequence = data.stockRequests.filter(item => item.code.startsWith(prefix)).length + 1
  return `${prefix}${String(sequence).padStart(4, '0')}`
}
