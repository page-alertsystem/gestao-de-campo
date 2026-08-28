import { FormEvent, type ComponentType, type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Bell, Boxes, CalendarClock, CarFront, CheckCircle2, ChevronRight, ClipboardCheck,
  Download, FileBarChart, Home, LogOut, MapPin, Menu, PackageCheck, Plus, Route,
  Search, Settings, ShieldCheck, Signal, SignalZero, Users, Warehouse, X,
} from 'lucide-react'
import { PermissionMatrix } from './PermissionMatrix'
import { KmForm } from './KmForm'
import { StockRequestForm } from './StockRequestForm'

type Page = 'inicio' | 'trajeto' | 'estoque' | 'relatorios' | 'configuracoes'
type ActionName = 'Início do deslocamento' | 'Encontro' | 'Desencontro' | 'Chegada em casa' | 'Esqueci meu ponto'

const nav: { id: Page; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'trajeto', label: 'Operação', icon: Route },
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

const todayInput = () => new Date().toISOString().slice(0, 10)
const nowInput = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default function App() {
  const [logged, setLogged] = useState(() => sessionStorage.getItem('gio-preview-session') === '1')
  const [page, setPage] = useState<Page>('inicio')
  const [online, setOnline] = useState(navigator.onLine)
  const [drawer, setDrawer] = useState(false)
  const [activeAction, setActiveAction] = useState<ActionName | null>(null)
  const [permissionsOpen, setPermissionsOpen] = useState(false)
  const [kmOpen, setKmOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [pendingSync, setPendingSync] = useState(0)
  const [activities, setActivities] = useState([
    { title: 'Início do deslocamento', detail: 'Cliente Alpha · 07:18', tone: 'success' },
    { title: 'Encontro', detail: 'Marcos e Ana · 08:02', tone: 'neutral' },
  ])

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

  const navigate = (next: Page) => {
    setPage(next)
    setDrawer(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const signOut = () => {
    sessionStorage.removeItem('gio-preview-session')
    setLogged(false)
  }

  const register = (action: ActionName, summary: string) => {
    setActivities(current => [{ title: action, detail: summary, tone: action === 'Esqueci meu ponto' ? 'warning' : 'success' }, ...current])
    if (!online) setPendingSync(current => current + 1)
    setActiveAction(null)
    showToast(online ? 'Registro realizado com sucesso.' : 'Registro salvo neste celular e aguardando internet.')
  }

  if (!logged) {
    return <Login onLogin={() => {
      sessionStorage.setItem('gio-preview-session', '1')
      setLogged(true)
    }} />
  }

  const title = nav.find(item => item.id === page)?.label ?? 'Início'

  return <div className="app-shell">
    <aside className={drawer ? 'sidebar open' : 'sidebar'}>
      <div className="brand-block">
        <div className="brand-mark">G</div>
        <div><b>GIO</b><span>Gestão Integrada<br />de Operações</span></div>
      </div>
      <nav className="main-nav" aria-label="Navegação principal">
        {nav.map(item => {
          const Icon = item.icon
          return <button key={item.id} className={page === item.id ? 'nav-item active' : 'nav-item'} onClick={() => navigate(item.id)}>
            <Icon size={20} /><span>{item.label}</span>
          </button>
        })}
      </nav>
      <div className="sidebar-foot">
        <div className="profile-avatar">GA</div>
        <div className="profile-copy"><b>Gabriel Alcantara</b><span>Administrador</span></div>
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
          <button className="notification-button" aria-label="Notificações"><Bell size={20} /><span>4</span></button>
          <div className="top-avatar">GA</div>
        </div>
      </header>

      {!online && <div className="offline-banner"><SignalZero size={18} /><span>Você está sem internet. Continue trabalhando: os registros serão enviados automaticamente quando a conexão voltar.</span></div>}
      {pendingSync > 0 && <div className="sync-banner"><Signal size={18} /><span>{pendingSync} {pendingSync === 1 ? 'registro aguardando' : 'registros aguardando'} sincronização.</span></div>}

      <main className="page-content">
        {toast && <div className="toast" role="status"><CheckCircle2 size={19} />{toast}</div>}
        {page === 'inicio' && <Dashboard activities={activities} onAction={setActiveAction} onNavigate={navigate} onKm={() => setKmOpen(true)} onRequest={() => setRequestOpen(true)} />}
        {page === 'trajeto' && <OperationPage onAction={setActiveAction} onKm={() => setKmOpen(true)} />}
        {page === 'estoque' && <StockPage onRequest={() => setRequestOpen(true)} />}
        {page === 'relatorios' && <ReportsPage />}
        {page === 'configuracoes' && <SettingsPage onOpenPermissions={() => setPermissionsOpen(true)} />}
      </main>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        {nav.map(item => {
          const Icon = item.icon
          return <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={20} /><span>{item.label === 'Configurações' ? 'Mais' : item.label}</span></button>
        })}
      </nav>
    </div>

    {activeAction && <QuickRegister action={activeAction} online={online} onClose={() => setActiveAction(null)} onSave={register} />}
    {permissionsOpen && <div className="full-screen-layer"><PermissionMatrix onClose={() => setPermissionsOpen(false)} onSaved={() => { setPermissionsOpen(false); showToast('Permissões atualizadas com sucesso.') }} /></div>}
    {kmOpen && <KmForm onClose={() => setKmOpen(false)} onComplete={() => { setKmOpen(false); showToast('Relatório de KM registrado com sucesso.') }} />}
    {requestOpen && <StockRequestForm onClose={() => setRequestOpen(false)} onComplete={code => { setRequestOpen(false); showToast(`Solicitação ${code} criada com sucesso.`) }} />}
  </div>
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [showPassword, setShowPassword] = useState(false)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onLogin()
  }
  return <main className="login-page">
    <section className="login-message">
      <div className="login-brand"><span>G</span><b>GIO</b></div>
      <p className="eyebrow light">Gestão Integrada de Operações</p>
      <h1>Operação organizada.<br />Equipe conectada.</h1>
      <p>Uma única plataforma para acompanhar equipes, trajetos, veículos, estoque e auditorias.</p>
      <div className="login-points"><span><CheckCircle2 size={18} />Preparado para celular</span><span><CheckCircle2 size={18} />Funciona mesmo sem internet</span><span><CheckCircle2 size={18} />Acessos por departamento</span></div>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <div className="mobile-login-brand"><span>G</span><b>GIO</b></div>
        <p className="eyebrow">Acesso seguro</p>
        <h2>Bem-vindo à GIO</h2>
        <p className="form-intro">Entre com seu e-mail e senha para continuar.</p>
        <label>E-mail<input type="email" defaultValue="admin@alertsystem.com.br" autoComplete="username" required /></label>
        <label>Senha<div className="password-field"><input type={showPassword ? 'text' : 'password'} defaultValue="provisoria" autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div></label>
        <button className="primary-button full" type="submit">Entrar na plataforma <ChevronRight size={18} /></button>
        <button className="text-button" type="button">Preciso de uma nova senha provisória</button>
        <div className="preview-note"><ShieldCheck size={18} /><span>Prévia inicial. A autenticação definitiva será conectada ao ambiente escolhido.</span></div>
      </form>
    </section>
  </main>
}

function Dashboard({ activities, onAction, onNavigate, onKm, onRequest }: { activities: { title: string; detail: string; tone: string }[]; onAction: (action: ActionName) => void; onNavigate: (page: Page) => void; onKm: () => void; onRequest: () => void }) {
  const date = useMemo(() => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date()), [])
  return <>
    <section className="welcome-row">
      <div><p className="eyebrow">{date}</p><h2>Bom dia, Gabriel</h2><p>Veja o que precisa da sua atenção e registre a operação.</p></div>
      <button className="secondary-button"><Download size={17} /> Instalar GIO no celular</button>
    </section>

    <section className="attention-grid">
      <button className="attention-card critical" onClick={() => onNavigate('estoque')}><span><AlertTriangle size={21} /></span><div><b>3</b><small>Itens com saldo negativo</small></div><ChevronRight size={19} /></button>
      <button className="attention-card warning"><span><CalendarClock size={21} /></span><div><b>2</b><small>Auditorias próximas</small></div><ChevronRight size={19} /></button>
      <button className="attention-card neutral" onClick={() => onNavigate('estoque')}><span><PackageCheck size={21} /></span><div><b>5</b><small>Recebimentos pendentes</small></div><ChevronRight size={19} /></button>
      <button className="attention-card success"><span><ClipboardCheck size={21} /></span><div><b>12</b><small>Registros realizados hoje</small></div><ChevronRight size={19} /></button>
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
        <div className="timeline">{activities.slice(0, 5).map((item, index) => <div className={`timeline-item ${item.tone}`} key={`${item.title}-${index}`}><span className="timeline-dot" /><div><b>{item.title}</b><small>{item.detail}</small></div></div>)}</div>
        <p className="privacy-note"><ShieldCheck size={16} />As coordenadas e o horário real são protegidos e visíveis somente nos relatórios autorizados.</p>
      </aside>
    </section>
  </>
}

function OperationPage({ onAction, onKm }: { onAction: (action: ActionName) => void; onKm: () => void }) {
  return <>
    <PageIntro eyebrow="Operação de campo" title="Registros do dia" description="Cada técnico registra a própria movimentação. Registros enviados não podem ser apagados." />
    <section className="action-grid operation-actions">{actions.map(item => {
      const Icon = item.icon
      return <button key={item.label} className={item.label === 'Esqueci meu ponto' ? 'action-card point' : 'action-card'} onClick={() => onAction(item.label)}><span><Icon size={21} /></span><div><b>{item.label}</b><small>{item.detail}</small></div><ChevronRight size={18} /></button>
    })}</section>
    <section className="form-shortcuts operation-shortcuts"><button onClick={onKm}><span><CarFront size={22} /></span><div><b>Relatório de KM</b><small>Veículo, destino, troca de condutor, fotos e avarias</small></div><ChevronRight size={19} /></button></section>
    <section className="surface empty-state"><MapPin size={30} /><h3>Localização protegida</h3><p>A data, o horário e a precisão do GPS serão registrados automaticamente, sem exibir as coordenadas ao técnico.</p></section>
  </>
}

function StockPage({ onRequest }: { onRequest: () => void }) {
  return <>
    <PageIntro eyebrow="Responsabilidade do técnico" title="Estoque do técnico" description="Acompanhe materiais, ferramentas pessoais, rotativas e EPIs sob sua responsabilidade." action={<button className="primary-button" onClick={onRequest}><Plus size={18} /> Nova solicitação</button>} />
    <section className="stock-tabs"><button className="active">Insumos <span>14</span></button><button>Ferramentas <span>8</span></button><button>EPIs <span>11</span></button></section>
    <section className="attention-grid stock-summary"><Metric icon={Warehouse} value="126" label="Itens disponíveis" /><Metric icon={PackageCheck} value="5" label="Aguardando confirmação" /><Metric icon={AlertTriangle} value="3" label="Saldo negativo" tone="critical" /></section>
    <section className="surface table-surface"><div className="table-toolbar"><div><p className="eyebrow">Insumos</p><h3>Materiais cadastrados</h3></div><label className="search-field"><Search size={17} /><input placeholder="Buscar equipamento" /></label></div><div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Marca / modelo</th><th>Unidade</th><th>Disponível</th><th>Status</th></tr></thead><tbody><tr><td>Cabo de rede</td><td>Furukawa Cat6</td><td>Metros</td><td>82,5</td><td><span className="status success">Disponível</span></td></tr><tr><td>Conector RJ45</td><td>—</td><td>Unidade</td><td>-3</td><td><span className="status danger">Saldo negativo</span></td></tr><tr><td>Fita isolante</td><td>3M</td><td>Rolo</td><td>6</td><td><span className="status warning">Estoque mínimo</span></td></tr></tbody></table></div></section>
  </>
}

function ReportsPage() {
  const reports = ['Trajetos', 'Pontos esquecidos', 'Quilometragem', 'Estoque por técnico', 'Solicitações', 'Auditorias de ferramentas', 'Auditorias de EPI', 'Histórico de ações']
  return <>
    <PageIntro eyebrow="Informação para decisão" title="Relatórios" description="Consulte apenas as informações liberadas para o seu grupo de acesso." />
    <section className="report-grid">{reports.map((report, index) => <button className="report-card" key={report}><span><FileBarChart size={22} /></span><div><b>{report}</b><small>{index < 3 ? 'Atualizado hoje' : 'Filtros e exportação para Excel'}</small></div><ChevronRight size={19} /></button>)}</section>
  </>
}

function SettingsPage({ onOpenPermissions }: { onOpenPermissions: () => void }) {
  const departments = ['Técnico', 'RH', 'Logística', 'Estoque', 'Auditor', 'Seg. Trabalho']
  return <>
    <PageIntro eyebrow="Administração" title="Configurações e acessos" description="Cadastre a operação e defina exatamente o que cada departamento pode fazer." action={<button className="primary-button"><Plus size={18} /> Cadastrar pessoa</button>} />
    <section className="settings-grid"><button className="setting-card"><Users size={22} /><div><b>Pessoas e grupos</b><small>30 pessoas cadastradas</small></div><ChevronRight size={18} /></button><button className="setting-card"><Warehouse size={22} /><div><b>Clientes e veículos</b><small>Cadastros operacionais</small></div><ChevronRight size={18} /></button><button className="setting-card"><ShieldCheck size={22} /><div><b>Histórico de segurança</b><small>Ações e alterações</small></div><ChevronRight size={18} /></button></section>
    <section className="surface permission-surface"><div className="section-heading"><div><p className="eyebrow">Matriz de permissões</p><h3>Acessos por departamento</h3></div><button className="secondary-button" onClick={onOpenPermissions}>Abrir matriz completa</button></div><div className="responsive-table"><table className="permission-table"><thead><tr><th>Funcionalidade</th>{departments.map(item => <th key={item}>{item}</th>)}</tr></thead><tbody>{['Visualizar clientes', 'Registrar trajeto', 'Visualizar todos os registros', 'Gerenciar estoque'].map((permission, row) => <tr key={permission}><td>{permission}</td>{departments.map((department, column) => <td key={department}><span className={(row + column) % 3 === 0 || (row === 1 && column === 0) ? 'permission on' : 'permission'}>{(row + column) % 3 === 0 || (row === 1 && column === 0) ? '✓' : ''}</span></td>)}</tr>)}</tbody></table></div><p className="admin-note"><ShieldCheck size={17} />O Administrador não aparece na matriz porque sempre possui acesso total.</p></section>
  </>
}

function QuickRegister({ action, online, onClose, onSave }: { action: ActionName; online: boolean; onClose: () => void; onSave: (action: ActionName, summary: string) => void }) {
  const [date, setDate] = useState(todayInput())
  const [time, setTime] = useState(nowInput())
  const [client, setClient] = useState('')
  const [pointType, setPointType] = useState('Entrada')
  const [observation, setObservation] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<string[]>([])
  const isPoint = action === 'Esqueci meu ponto'
  const needsTeam = action === 'Encontro' || action === 'Desencontro'
  const technicians = ['Ana Martins', 'Bruno Lima', 'Marcos Silva', 'Paulo Souza']
  const minDate = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const detail = isPoint ? `${pointType} · ${time}` : `${client || 'Sem cliente'} · ${time}`
    onSave(action, detail)
  }

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={action}>
    <button className="modal-backdrop" onClick={onClose} aria-label="Fechar" />
    <form className="quick-modal" onSubmit={submit}>
      <div className="modal-heading"><div><p className="eyebrow">Novo registro</p><h2>{action}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={21} /></button></div>
      <div className={online ? 'capture-state' : 'capture-state offline'}>{online ? <MapPin size={18} /> : <SignalZero size={18} />}<div><b>{online ? 'Localização pronta para registrar' : 'Registro será salvo offline'}</b><small>Horário real e precisão do GPS ficarão protegidos.</small></div></div>
      <div className="form-grid">
        <label>Data<input type="date" value={date} min={isPoint ? minDate : todayInput()} max={todayInput()} onChange={event => setDate(event.target.value)} required /></label>
        <label>Horário informado<input type="time" value={time} onChange={event => setTime(event.target.value)} required /></label>
        {isPoint ? <label>Tipo de ponto<select value={pointType} onChange={event => setPointType(event.target.value)}><option>Entrada</option><option>Saída</option><option>Início do almoço</option><option>Término do almoço</option></select></label> : <label>Cliente (opcional)<select value={client} onChange={event => setClient(event.target.value)}><option value="">Sem cliente</option><option>Cliente Alpha</option><option>Hospital Central</option><option>Outros</option></select></label>}
      </div>
      {needsTeam && <fieldset className="team-field"><legend>Técnicos envolvidos</legend><div>{technicians.map(name => <label key={name}><input type="checkbox" checked={selectedTeam.includes(name)} onChange={() => setSelectedTeam(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name])} />{name}</label>)}</div>{selectedTeam.length === 0 && <small>Selecione pelo menos um técnico para continuar.</small>}</fieldset>}
      <label>{isPoint ? 'Justificativa obrigatória' : 'Observação (opcional)'}<textarea value={observation} onChange={event => setObservation(event.target.value)} required={isPoint} placeholder={isPoint ? 'Explique por que o ponto não foi registrado no outro aplicativo.' : 'Inclua uma informação importante, se necessário.'} /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={needsTeam && selectedTeam.length === 0}>Confirmar registro <ChevronRight size={18} /></button></div>
    </form>
  </div>
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <section className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div>{action}</section>
}

function Metric({ icon: Icon, value, label, tone = '' }: { icon: ComponentType<{ size?: number }>; value: string; label: string; tone?: string }) {
  return <article className={`metric-card ${tone}`}><span><Icon size={21} /></span><div><b>{value}</b><small>{label}</small></div></article>
}
