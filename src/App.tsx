import { FormEvent, type ComponentType, type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Bell, Boxes, CalendarClock, CarFront, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck,
  Download, FileBarChart, Home, LogOut, MapPin, Menu, PackageCheck, Plus, Route,
  Search, Settings, ShieldCheck, Signal, SignalZero, Users, Warehouse, X,
} from 'lucide-react'
import { PermissionMatrix } from './PermissionMatrix'
import { KmForm } from './KmForm'
import { StockRequestForm } from './StockRequestForm'
import { AdminCatalogs } from './AdminCatalogs'
import { hashPassword, loadAppData, saveAppData, type AppData } from './store'

type Page = 'inicio' | 'operacao-km' | 'operacao-dia' | 'operacao-ponto' | 'estoque' | 'relatorios' | 'configuracoes'
type ActionName = 'Início do deslocamento' | 'Encontro' | 'Desencontro' | 'Chegada em casa' | 'Esqueci meu ponto'
type QuickRecord = { action: ActionName; summary: string; date: string; time: string; client: string; team: string[]; observation: string; latitude?: number; longitude?: number; accuracy?: number }

const nav: { id: Page; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'operacao-dia', label: 'Operação', icon: Route },
  { id: 'estoque', label: 'Estoque', icon: Boxes },
  { id: 'relatorios', label: 'Relatórios', icon: FileBarChart },
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
const isOperationPage = (page: Page) => page.startsWith('operacao-')

const todayInput = () => new Date().toISOString().slice(0, 10)
const nowInput = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [logged, setLogged] = useState(() => sessionStorage.getItem('gio-admin-session') === '1')
  const [page, setPage] = useState<Page>('inicio')
  const [online, setOnline] = useState(navigator.onLine)
  const [drawer, setDrawer] = useState(false)
  const [operationOpen, setOperationOpen] = useState(false)
  const [activeAction, setActiveAction] = useState<ActionName | null>(null)
  const [permissionsOpen, setPermissionsOpen] = useState(false)
  const [kmOpen, setKmOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [pendingSync, setPendingSync] = useState(0)
  const [activities, setActivities] = useState<{ title: string; detail: string; tone: string }[]>([])

  useEffect(() => {
    loadAppData().then(stored => {
      setData(stored)
      setActivities(stored.trajectories.slice(-5).reverse().map(item => ({ title: item.type, detail: `${item.client || 'Sem cliente'} · ${item.declaredTime}`, tone: item.type === 'Esqueci meu ponto' ? 'warning' : 'success' })))
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
    if (message) showToast(message)
  }

  const navigate = (next: Page) => {
    setPage(next)
    if (isOperationPage(next)) setOperationOpen(true)
    setDrawer(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const signOut = () => {
    sessionStorage.removeItem('gio-admin-session')
    setLogged(false)
  }

  const register = (record: QuickRecord) => {
    setActivities(current => [{ title: record.action, detail: record.summary, tone: record.action === 'Esqueci meu ponto' ? 'warning' : 'success' }, ...current])
    if (!online) setPendingSync(current => current + 1)
    setActiveAction(null)
    showToast(online ? 'Registro realizado com sucesso.' : 'Registro salvo neste celular e aguardando internet.')
    if (data) {
      const next: AppData = { ...data, trajectories: [...data.trajectories, { id: crypto.randomUUID(), type: record.action, declaredDate: record.date, declaredTime: record.time, recordedAt: new Date().toISOString(), client: record.client, team: record.team, observation: record.observation, latitude: record.latitude, longitude: record.longitude, accuracy: record.accuracy, author: data.account.name, pendingSync: !online }] }
      if (record.action === 'Esqueci meu ponto') next.notifications = [...next.notifications, { id: crypto.randomUUID(), title: 'Ponto esquecido registrado', detail: `${data.account.name} · ${record.summary}`, createdAt: new Date().toISOString(), read: false, critical: true }]
      updateData(next)
    }
  }

  if (loading) return <main className="loading-page"><img src="/alert-logo.png" alt="Alert" /><span>Preparando a GIO...</span></main>
  if (!data) return <main className="loading-page"><AlertTriangle /><b>Não foi possível abrir os dados locais.</b></main>
  if (!logged) return <Login onLogin={async (email, password) => {
    if (email.trim().toLowerCase() !== data.account.email.toLowerCase() || await hashPassword(password) !== data.account.passwordHash) return 'E-mail ou senha inválidos.'
    sessionStorage.setItem('gio-admin-session', '1')
    setLogged(true)
    return null
  }} />
  if (data.account.mustChangePassword) return <PasswordChange onSave={async password => {
    const next = { ...data, account: { ...data.account, passwordHash: await hashPassword(password), mustChangePassword: false } }
    updateData(next)
  }} onSignOut={signOut} />

  const title = operationPages.find(item => item.id === page)?.label ?? nav.find(item => item.id === page)?.label ?? 'Início'

  return <div className="app-shell">
    <aside className={drawer ? 'sidebar open' : 'sidebar'}>
      <div className="brand-block">
        <div className="brand-logo-card"><img src="/alert-logo.png" alt="Alert" /></div>
        <div><b>GIO</b><span>Gestão Integrada<br />de Operações</span></div>
      </div>
      <nav className="main-nav" aria-label="Navegação principal">
        {nav.map(item => {
          const Icon = item.icon
          if (item.label === 'Operação') return <div className="nav-group" key={item.id}>
            <button className={isOperationPage(page) ? 'nav-item active' : 'nav-item'} onClick={() => setOperationOpen(current => !current)} aria-expanded={operationOpen}>
              <Icon size={20} /><span>{item.label}</span><ChevronDown className={operationOpen ? 'nav-chevron open' : 'nav-chevron'} size={17} />
            </button>
            {operationOpen && <div className="nav-submenu">{operationPages.map(subitem => {
              const SubIcon = subitem.icon
              return <button key={subitem.id} className={page === subitem.id ? 'nav-subitem active' : 'nav-subitem'} onClick={() => navigate(subitem.id)}><SubIcon size={16} /><span>{subitem.label}</span></button>
            })}</div>}
          </div>
          return <button key={item.id} className={page === item.id ? 'nav-item active' : 'nav-item'} onClick={() => navigate(item.id)}><Icon size={20} /><span>{item.label}</span></button>
        })}
      </nav>
      <div className="sidebar-foot">
        <div className="profile-avatar">GA</div>
        <div className="profile-copy"><b>{data.account.name}</b><span>Administrador</span></div>
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
          <div className="top-avatar">GA</div>
        </div>
      </header>

      {!online && <div className="offline-banner"><SignalZero size={18} /><span>Você está sem internet. Continue trabalhando: os registros serão enviados automaticamente quando a conexão voltar.</span></div>}
      {pendingSync > 0 && <div className="sync-banner"><Signal size={18} /><span>{pendingSync} {pendingSync === 1 ? 'registro aguardando' : 'registros aguardando'} sincronização.</span></div>}

      <main className="page-content">
        {toast && <div className="toast" role="status"><CheckCircle2 size={19} />{toast}</div>}
        {page === 'inicio' && <Dashboard data={data} activities={activities} onAction={setActiveAction} onNavigate={navigate} onKm={() => setKmOpen(true)} onRequest={() => setRequestOpen(true)} />}
        {isOperationPage(page) && <OperationPage section={page} data={data} onAction={setActiveAction} onKm={() => setKmOpen(true)} />}
        {page === 'estoque' && <StockPage data={data} onRequest={() => setRequestOpen(true)} />}
        {page === 'relatorios' && <ReportsPage data={data} />}
        {page === 'configuracoes' && <SettingsPage data={data} onChange={updateData} onOpenPermissions={() => setPermissionsOpen(true)} />}
      </main>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        {nav.map(item => {
          const Icon = item.icon
          return <button key={item.id} className={(item.label === 'Operação' ? isOperationPage(page) : page === item.id) ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={20} /><span>{item.label === 'Configurações' ? 'Mais' : item.label}</span></button>
        })}
      </nav>
    </div>

    {activeAction && <QuickRegister action={activeAction} online={online} clients={data.clients.filter(item => item.active).map(item => item.name)} technicians={data.people.filter(item => item.active && item.id !== data.account.id).map(item => item.name)} onClose={() => setActiveAction(null)} onSave={register} />}
    {permissionsOpen && <div className="full-screen-layer"><PermissionMatrix initial={data.permissions} onClose={() => setPermissionsOpen(false)} onSaved={permissions => { updateData({ ...data, permissions }, 'Permissões atualizadas com sucesso.'); setPermissionsOpen(false) }} /></div>}
    {kmOpen && <KmForm vehicles={data.vehicles.filter(item => item.active)} driver={data.account.name} onClose={() => setKmOpen(false)} onComplete={record => { const next = { ...data, kmRecords: [...data.kmRecords, record], vehicles: data.vehicles.map(vehicle => vehicle.plate === record.vehicle ? { ...vehicle, mileage: record.mileage } : vehicle) }; updateData(next); setKmOpen(false); showToast('Relatório de KM registrado com sucesso.') }} />}
    {requestOpen && <StockRequestForm code={nextRequestCode(data)} people={data.people} clients={data.clients} onClose={() => setRequestOpen(false)} onComplete={request => { const next = { ...data, stockRequests: [...data.stockRequests, { id: crypto.randomUUID(), ...request, createdAt: new Date().toISOString(), status: 'Pedido recebido', author: data.account.name }] }; updateData(next); setRequestOpen(false); showToast(`Solicitação ${request.code} criada com sucesso.`) }} />}
  </div>
}

function Login({ onLogin }: { onLogin: (email: string, password: string) => Promise<string | null> }) {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('gabriel.alcantara@alertsystem.com.br')
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
      <div className="login-brand"><span className="login-logo"><img src="/alert-logo.png" alt="Alert" /></span><b>GIO</b></div>
      <p className="eyebrow light">Gestão Integrada de Operações</p>
      <h1>Operação organizada.<br />Equipe conectada.</h1>
      <p>Uma única plataforma para acompanhar equipes, trajetos, veículos, estoque e auditorias.</p>
      <div className="login-points"><span><CheckCircle2 size={18} />Preparado para celular</span><span><CheckCircle2 size={18} />Funciona mesmo sem internet</span><span><CheckCircle2 size={18} />Acessos por departamento</span></div>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <div className="mobile-login-brand"><span className="login-logo"><img src="/alert-logo.png" alt="Alert" /></span><b>GIO</b></div>
        <p className="eyebrow">Acesso seguro</p>
        <h2>Bem-vindo à GIO</h2>
        <p className="form-intro">Entre com seu e-mail e senha para continuar.</p>
        <label>E-mail<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" required /></label>
        <label>Senha<div className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div></label>
        {error && <div className="login-error"><AlertTriangle size={17} />{error}</div>}
        <button className="primary-button full" type="submit" disabled={busy}>{busy ? 'Verificando...' : 'Entrar na plataforma'} {!busy && <ChevronRight size={18} />}</button>
        <button className="text-button" type="button">Preciso de uma nova senha provisória</button>
        <div className="preview-note"><ShieldCheck size={18} /><span>Prévia inicial. A autenticação definitiva será conectada ao ambiente escolhido.</span></div>
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
  return <main className="password-change-page"><form className="login-card" onSubmit={submit}><img className="password-logo" src="/alert-logo.png" alt="Alert" /><p className="eyebrow">Primeiro acesso</p><h2>Crie sua nova senha</h2><p className="form-intro">A senha provisória só pode ser usada uma vez.</p><label>Nova senha<input type="password" value={password} onChange={event => setPassword(event.target.value)} required /></label><label>Confirmar nova senha<input type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label>{error && <div className="login-error"><AlertTriangle size={17} />{error}</div>}<button className="primary-button full">Salvar nova senha <ChevronRight size={18} /></button><button type="button" className="text-button" onClick={onSignOut}>Voltar ao login</button></form></main>
}

function Dashboard({ data, activities, onAction, onNavigate, onKm, onRequest }: { data: AppData; activities: { title: string; detail: string; tone: string }[]; onAction: (action: ActionName) => void; onNavigate: (page: Page) => void; onKm: () => void; onRequest: () => void }) {
  const date = useMemo(() => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date()), [])
  return <>
    <section className="welcome-row">
      <div><p className="eyebrow">{date}</p><h2>Bom dia, {data.account.name.split(' ')[0]}</h2><p>Você está conectado como Administrador e possui acesso total.</p></div>
      <button className="secondary-button"><Download size={17} /> Instalar GIO no celular</button>
    </section>

    <section className="attention-grid">
      <button className="attention-card critical" onClick={() => onNavigate('estoque')}><span><AlertTriangle size={21} /></span><div><b>{data.inventory.filter(item => item.quantity < 0).length}</b><small>Itens com saldo negativo</small></div><ChevronRight size={19} /></button>
      <button className="attention-card warning"><span><CalendarClock size={21} /></span><div><b>0</b><small>Auditorias próximas</small></div><ChevronRight size={19} /></button>
      <button className="attention-card neutral" onClick={() => onNavigate('estoque')}><span><PackageCheck size={21} /></span><div><b>{data.stockRequests.filter(item => item.status !== 'Entregue').length}</b><small>Pedidos em andamento</small></div><ChevronRight size={19} /></button>
      <button className="attention-card success"><span><ClipboardCheck size={21} /></span><div><b>{data.trajectories.filter(item => item.declaredDate === todayInput()).length + data.kmRecords.length}</b><small>Registros realizados hoje</small></div><ChevronRight size={19} /></button>
    </section>

    <section className="form-shortcuts"><button onClick={onKm}><span><CarFront size={22} /></span><div><b>Relatório de KM</b><small>Registre antes de ligar o veículo</small></div><ChevronRight size={19} /></button><button onClick={onRequest}><span><PackageCheck size={22} /></span><div><b>Nova solicitação ao estoque</b><small>Solicite materiais e acompanhe a entrega</small></div><ChevronRight size={19} /></button></section>

    <section className="content-grid">
      <article className="surface quick-surface">
        <div className="section-heading"><div><p className="eyebrow">Registro rápido</p><h3>O que está acontecendo agora?</h3></div><MapPin size={21} /></div>
        <div className="action-grid">{actions.map(item => {
          const Icon = item.icon
          return <button key={item.label} className={item.label === 'Esqueci meu ponto' ? 'action-card point' : 'action-card'} onClick={() => onAction(item.label)}><span><Icon size={21} /></span><div><b>{item.label}</b><small>{item.detail}</small></div><ChevronRight size={18} /></button>
        })}</div>
      </article>

      <aside className="surface activity-surface">
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

function StockPage({ data, onRequest }: { data: AppData; onRequest: () => void }) {
  const itemRows = data.inventory.map(item => [item.equipment, [item.brand, item.model].filter(Boolean).join(' ') || '—', item.unit, String(item.quantity), item.quantity < 0 ? 'Saldo negativo' : item.quantity <= item.minimum ? 'Estoque mínimo' : 'Disponível'])
  return <>
    <PageIntro eyebrow="Responsabilidade do técnico" title="Estoque do técnico" description="Acompanhe materiais, ferramentas pessoais, rotativas e EPIs sob sua responsabilidade." action={<button className="primary-button" onClick={onRequest}><Plus size={18} /> Nova solicitação</button>} />
    <section className="stock-tabs"><button className="active">Insumos <span>{data.inventory.filter(item => item.category === 'Insumo').length}</span></button><button>Ferramentas <span>{data.inventory.filter(item => item.category.includes('Ferramenta')).length}</span></button><button>EPIs <span>{data.inventory.filter(item => item.category === 'EPI').length}</span></button></section>
    <section className="attention-grid stock-summary"><Metric icon={Warehouse} value={String(data.inventory.length)} label="Itens cadastrados" /><Metric icon={PackageCheck} value={String(data.stockRequests.filter(item => item.status !== 'Entregue').length)} label="Pedidos em andamento" /><Metric icon={AlertTriangle} value={String(data.inventory.filter(item => item.quantity < 0).length)} label="Saldo negativo" tone="critical" /></section>
    <section className="surface table-surface"><div className="table-toolbar"><div><p className="eyebrow">Estoque</p><h3>Materiais cadastrados</h3></div><label className="search-field"><Search size={17} /><input placeholder="Buscar equipamento" /></label></div><div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Marca / modelo</th><th>Unidade</th><th>Disponível</th><th>Status</th></tr></thead><tbody>{itemRows.length ? itemRows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{column === 4 ? <span className={`status ${cell === 'Saldo negativo' ? 'danger' : cell === 'Estoque mínimo' ? 'warning' : 'success'}`}>{cell}</span> : cell}</td>)}</tr>) : <tr><td colSpan={5} className="table-empty">Cadastre os primeiros itens em Configurações.</td></tr>}</tbody></table></div></section>
  </>
}

function ReportsPage({ data }: { data: AppData }) {
  const reports = ['Trajetos', 'Pontos esquecidos', 'Quilometragem', 'Estoque por técnico', 'Solicitações', 'Auditorias de ferramentas', 'Auditorias de EPI', 'Histórico de ações']
  return <>
    <PageIntro eyebrow="Informação para decisão" title="Relatórios" description="Consulte apenas as informações liberadas para o seu grupo de acesso." />
    <section className="attention-grid"><Metric icon={Route} value={String(data.trajectories.length)} label="Trajetos" /><Metric icon={CarFront} value={String(data.kmRecords.length)} label="Registros de KM" /><Metric icon={PackageCheck} value={String(data.stockRequests.length)} label="Solicitações" /><Metric icon={Users} value={String(data.people.length)} label="Pessoas" /></section>
    <section className="report-grid">{reports.map((report, index) => <button className="report-card" key={report} onClick={() => exportReport(report, data)}><span><FileBarChart size={22} /></span><div><b>{report}</b><small>{index < 3 ? 'Baixar dados registrados' : 'Exportação disponível conforme os dados'}</small></div><Download size={19} /></button>)}</section>
  </>
}

function SettingsPage({ data, onChange, onOpenPermissions }: { data: AppData; onChange: (data: AppData, message: string) => void; onOpenPermissions: () => void }) {
  const departments = ['Técnico', 'RH', 'Logística', 'Estoque', 'Auditor', 'Seg. Trabalho']
  return <>
    <PageIntro eyebrow="Administração" title="Configurações e acessos" description="Cadastre a operação e defina exatamente o que cada departamento pode fazer." action={<button className="primary-button"><Plus size={18} /> Cadastrar pessoa</button>} />
    <section className="settings-grid"><button className="setting-card"><Users size={22} /><div><b>Pessoas e grupos</b><small>{data.people.length} pessoas cadastradas</small></div><ChevronRight size={18} /></button><button className="setting-card"><Warehouse size={22} /><div><b>Clientes e veículos</b><small>{data.clients.length} clientes · {data.vehicles.length} veículos</small></div><ChevronRight size={18} /></button><button className="setting-card"><ShieldCheck size={22} /><div><b>Histórico de segurança</b><small>Administrador com acesso total</small></div><ChevronRight size={18} /></button></section>
    <section className="surface permission-surface"><div className="section-heading"><div><p className="eyebrow">Matriz de permissões</p><h3>Acessos por departamento</h3></div><button className="secondary-button" onClick={onOpenPermissions}>Abrir matriz completa</button></div><div className="responsive-table"><table className="permission-table"><thead><tr><th>Funcionalidade</th>{departments.map(item => <th key={item}>{item}</th>)}</tr></thead><tbody>{['Visualizar clientes', 'Registrar trajeto', 'Visualizar todos os registros', 'Gerenciar estoque'].map((permission, row) => <tr key={permission}><td>{permission}</td>{departments.map((department, column) => <td key={department}><span className={(row + column) % 3 === 0 || (row === 1 && column === 0) ? 'permission on' : 'permission'}>{(row + column) % 3 === 0 || (row === 1 && column === 0) ? '✓' : ''}</span></td>)}</tr>)}</tbody></table></div><p className="admin-note"><ShieldCheck size={17} />O Administrador não aparece na matriz porque sempre possui acesso total.</p></section>
    <AdminCatalogs data={data} onChange={onChange} />
  </>
}

function QuickRegister({ action, online, clients, technicians, onClose, onSave }: { action: ActionName; online: boolean; clients: string[]; technicians: string[]; onClose: () => void; onSave: (record: QuickRecord) => void }) {
  const [date, setDate] = useState(todayInput())
  const [time, setTime] = useState(nowInput())
  const [client, setClient] = useState('')
  const [pointType, setPointType] = useState('Entrada')
  const [observation, setObservation] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<string[]>([])
  const [location, setLocation] = useState<{ latitude?: number; longitude?: number; accuracy?: number; status: 'capturing' | 'ready' | 'error' }>({ status: 'capturing' })
  const isPoint = action === 'Esqueci meu ponto'
  const needsTeam = action === 'Encontro' || action === 'Desencontro'
  const minDate = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(position => setLocation({ status: 'ready', latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }), () => setLocation({ status: 'error' }), { enableHighAccuracy: true, timeout: 12000 })
  }, [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const detail = isPoint ? `${pointType} · ${time}` : `${client || 'Sem cliente'} · ${time}`
    if (location.status !== 'ready') return
    onSave({ action, summary: detail, date, time, client: isPoint ? pointType : client, team: selectedTeam, observation, latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy })
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

function exportReport(name: string, data: AppData) {
  let rows: (string | number)[][] = [['Relatório', 'Data', 'Responsável', 'Detalhes']]
  if (name === 'Trajetos' || name === 'Pontos esquecidos') rows = [...rows, ...data.trajectories.filter(item => name === 'Trajetos' ? item.type !== 'Esqueci meu ponto' : item.type === 'Esqueci meu ponto').map(item => [item.type, `${item.declaredDate} ${item.declaredTime}`, item.author, `${item.client} ${item.observation}`])]
  else if (name === 'Quilometragem') rows = [...rows, ...data.kmRecords.map(item => ['KM', item.createdAt, item.driver, `${item.vehicle} · ${item.mileage} km · ${item.destination}`])]
  else if (name === 'Solicitações') rows = [...rows, ...data.stockRequests.map(item => [item.code, item.createdAt, item.technician, `${item.items} itens · ${item.status}`])]
  else rows = [...rows, ['Resumo', new Date().toLocaleString('pt-BR'), data.account.name, `Pessoas: ${data.people.length} · Clientes: ${data.clients.length} · Veículos: ${data.vehicles.length} · Itens: ${data.inventory.length}`]]
  const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  link.download = `${name.toLowerCase().replaceAll(' ', '-')}-${todayInput()}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

function nextRequestCode(data: AppData) {
  const date = new Date()
  const prefix = `ALT${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}`
  const sequence = data.stockRequests.filter(item => item.code.startsWith(prefix)).length + 1
  return `${prefix}${String(sequence).padStart(4, '0')}`
}
