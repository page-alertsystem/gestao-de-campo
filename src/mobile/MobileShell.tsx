import { type ComponentType, type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, CalendarClock, CarFront, CheckCircle2, ChevronRight, ClipboardCheck, Download, FileCheck2, Home, LogOut, Monitor,
  MessageSquareReply, Route, Server, ShieldCheck, Signal, SignalZero, Smartphone, Users, Wrench, X,
} from 'lucide-react'
import type { Page } from '../access'
import { profileSummary } from '../access'
import type { AppData } from '../store'
import { brandAssets } from '../paths'
import { appLinks, insideAndroidApp } from '../appLinks'

/** Telas disponíveis no GIO Mobile (o acesso de cada pessoa ainda depende do perfil). */
export const mobilePages: Page[] = [
  'inicio',
  'atendimento-preventiva',
  'operacao-dia', 'operacao-km', 'operacao-ponto', 'operacao-apr', 'operacao-retorno',
  'gestao-auditoria',
  'manutencao-rma',
]

type DayAction = 'Início do deslocamento' | 'Encontro' | 'Desencontro' | 'Chegada em casa' | 'Esqueci meu ponto'
type Icon = ComponentType<{ size?: number }>

const dayActions: { label: DayAction; short: string; icon: Icon }[] = [
  { label: 'Início do deslocamento', short: 'Saída', icon: Route },
  { label: 'Encontro', short: 'Encontro', icon: Users },
  { label: 'Desencontro', short: 'Desencontro', icon: Users },
  { label: 'Chegada em casa', short: 'Chegada', icon: Home },
]

const operationTabs: { id: Page; label: string }[] = [
  { id: 'operacao-dia', label: 'Registro do dia' },
  { id: 'operacao-km', label: 'KM' },
  { id: 'operacao-ponto', label: 'Ponto' },
  { id: 'operacao-apr', label: 'APR' },
  { id: 'operacao-retorno', label: 'Retorno' },
]

const tabs: { id: Page; label: string; icon: Icon; match: (page: Page) => boolean }[] = [
  { id: 'inicio', label: 'Início', icon: Home, match: page => page === 'inicio' },
  { id: 'operacao-dia', label: 'Operação', icon: Route, match: page => page.startsWith('operacao-') },
  { id: 'atendimento-preventiva', label: 'Preventiva', icon: Server, match: page => page === 'atendimento-preventiva' },
  { id: 'gestao-auditoria', label: 'Auditoria', icon: ShieldCheck, match: page => page === 'gestao-auditoria' },
  { id: 'manutencao-rma', label: 'RMA', icon: Wrench, match: page => page === 'manutencao-rma' },
]

export function MobileShell({ data, profiles, allowedPages, page, title, online, pendingSync, toast, onNavigate, onSignOut, children }: {
  data: AppData; profiles: string[]; allowedPages: Set<Page>; page: Page; title: string; online: boolean; pendingSync: number; toast: string
  onNavigate: (page: Page) => void; onSignOut: () => void; children: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [desktopUrl, setDesktopUrl] = useState('')
  useEffect(() => { void appLinks().then(links => setDesktopUrl(links.desktop)) }, [])
  const initials = data.account.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  const visibleTabs = tabs.map(tab => {
    if (tab.id !== 'operacao-dia') return allowedPages.has(tab.id) ? tab : null
    const first = operationTabs.find(item => allowedPages.has(item.id))
    return first ? { ...tab, id: first.id } : null
  }).filter((tab): tab is NonNullable<typeof tab> => Boolean(tab))
  const visibleOperationTabs = operationTabs.filter(item => allowedPages.has(item.id))

  useEffect(() => {
    // Botão "voltar" do Android: volta para o Início em vez de sair do app.
    if (page === 'inicio') return
    const state = { gioMobile: page }
    window.history.pushState(state, '')
    const back = () => onNavigate('inicio')
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [page])

  return <div className="m-shell">
    <header className="m-topbar">
      {page === 'inicio'
        ? <div className="m-brand"><img src={brandAssets.color} alt="Grupo Alert" /><b>GIO <span>Mobile</span></b></div>
        : <button className="m-back" onClick={() => onNavigate('inicio')} aria-label="Voltar ao início"><ArrowLeft size={22} /><b>{title}</b></button>}
      <div className="m-top-actions">
        <span className={online ? 'm-status online' : 'm-status offline'} title={online ? 'Online' : 'Sem internet'}>{online ? <Signal size={15} /> : <SignalZero size={15} />}</span>
        <button className="m-avatar" onClick={() => setMenuOpen(true)} aria-label="Abrir menu do usuário">{initials}</button>
      </div>
    </header>

    {!online && <div className="m-banner offline"><SignalZero size={16} /><span>Sem internet. Pode continuar: os registros serão enviados quando a conexão voltar.</span></div>}
    {pendingSync > 0 && <div className="m-banner sync"><Signal size={16} /><span>{pendingSync} {pendingSync === 1 ? 'registro aguardando' : 'registros aguardando'} envio.</span></div>}

    {page.startsWith('operacao-') && visibleOperationTabs.length > 1 && <nav className="m-chips" aria-label="Itens da operação">
      {visibleOperationTabs.map(item => <button key={item.id} className={item.id === page ? 'active' : ''} onClick={() => onNavigate(item.id)}>{item.label}</button>)}
    </nav>}

    <main className="m-content">
      {toast && <div className="toast m-toast" role="status"><CheckCircle2 size={19} />{toast}</div>}
      {children}
    </main>

    {visibleTabs.length > 1 && <nav className="m-tabbar" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, 1fr)` }} aria-label="Navegação do GIO Mobile">
      {visibleTabs.map(tab => {
        const TabIcon = tab.icon
        return <button key={tab.label} className={tab.match(page) ? 'active' : ''} onClick={() => onNavigate(tab.id)}><TabIcon size={22} /><span>{tab.label}</span></button>
      })}
    </nav>}

    {menuOpen && <div className="m-sheet-layer" role="dialog" aria-modal="true">
      <button className="m-sheet-backdrop" onClick={() => setMenuOpen(false)} aria-label="Fechar" />
      <section className="m-sheet">
        <button className="m-sheet-close" onClick={() => setMenuOpen(false)} aria-label="Fechar"><X size={20} /></button>
        <div className="m-sheet-user"><span className="m-avatar large">{initials}</span><div><b>{data.account.name}</b><small>{data.account.email}</small><small>Perfil: {profileSummary(profiles)}</small></div></div>
        {desktopUrl && !insideAndroidApp() && <a className="m-sheet-item" href={desktopUrl}><Monitor size={19} /><span>Abrir versão completa</span><ChevronRight size={17} /></a>}
        <button className="m-sheet-item danger" onClick={() => { setMenuOpen(false); onSignOut() }}><LogOut size={19} /><span>Sair</span><ChevronRight size={17} /></button>
        <p className="m-sheet-note">GIO Mobile · Grupo Alert</p>
      </section>
    </div>}
  </div>
}

export function MobileHome({ data, profiles, allowedPages, online, onAction, onNavigate, onKm }: {
  data: AppData; profiles: string[]; allowedPages: Set<Page>; online: boolean
  onAction: (action: DayAction) => void; onNavigate: (page: Page) => void; onKm: () => void
}) {
  const [apkUrl, setApkUrl] = useState('')
  useEffect(() => { void appLinks().then(links => setApkUrl(links.androidApk)) }, [])
  const today = new Date().toLocaleDateString('en-CA')
  const date = useMemo(() => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date()), [])
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const mine = [
    ...data.trajectories.filter(item => item.author === data.account.name && new Date(item.recordedAt).toLocaleDateString('en-CA') === today).map(item => ({ title: item.type, detail: `${item.declaredTime}${item.client ? ` · ${item.client}` : ''}`, at: item.recordedAt })),
    ...data.kmRecords.filter(item => item.driver === data.account.name && new Date(item.createdAt).toLocaleDateString('en-CA') === today).map(item => ({ title: 'Relatório de KM', detail: `${item.vehicle} · ${item.mileage.toLocaleString('pt-BR')} km`, at: item.createdAt })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  const shortcuts: { id: Page; label: string; detail: string; icon: Icon; run: () => void }[] = [
    { id: 'operacao-km', label: 'Relatório de KM', detail: 'Veículo e quilometragem', icon: CarFront, run: onKm },
    { id: 'operacao-ponto', label: 'Esqueci meu ponto', detail: 'Até 7 dias atrás', icon: CalendarClock, run: () => onAction('Esqueci meu ponto') },
    { id: 'operacao-apr', label: 'APR aprovada', detail: 'Fotos e assinatura', icon: FileCheck2, run: () => onNavigate('operacao-apr') },
    { id: 'operacao-retorno', label: 'Chamado de retorno', detail: 'Abre chamado no Movidesk', icon: MessageSquareReply, run: () => onNavigate('operacao-retorno') },
    { id: 'atendimento-preventiva', label: 'Preventiva sistêmica', detail: 'Servidor, workstation, storage', icon: Server, run: () => onNavigate('atendimento-preventiva') },
    { id: 'gestao-auditoria', label: 'Auditoria', detail: 'Ferramentas, EPIs e escadas', icon: ShieldCheck, run: () => onNavigate('gestao-auditoria') },
    { id: 'manutencao-rma', label: 'RMA', detail: 'Equipamento para manutenção', icon: Wrench, run: () => onNavigate('manutencao-rma') },
  ]
  const visibleShortcuts = shortcuts.filter(item => allowedPages.has(item.id))
  const showAndroid = !insideAndroidApp() && /android/i.test(navigator.userAgent) && apkUrl

  return <div className="m-home">
    <section className="m-hello">
      <p>{date}</p>
      <h2>{greeting}, {data.account.name.split(' ')[0]}</h2>
      <small>{profileSummary(profiles)} · {online ? 'conectado' : 'sem internet'}</small>
    </section>

    {allowedPages.has('operacao-dia') && <section className="m-section">
      <h3>Registro do dia <span>com GPS</span></h3>
      <div className="m-day-grid">{dayActions.map(item => {
        const ActionIcon = item.icon
        return <button key={item.label} className="m-day-button" onClick={() => onAction(item.label)}><ActionIcon size={26} /><b>{item.short}</b></button>
      })}</div>
    </section>}

    {visibleShortcuts.length > 0 && <section className="m-section">
      <h3>Registrar</h3>
      <div className="m-tiles">{visibleShortcuts.map(item => {
        const TileIcon = item.icon
        return <button key={item.id} className="m-tile" onClick={item.run}><span><TileIcon size={22} /></span><div><b>{item.label}</b><small>{item.detail}</small></div><ChevronRight size={18} /></button>
      })}</div>
    </section>}

    <section className="m-section">
      <h3>Seus registros de hoje <span>{mine.length}</span></h3>
      {mine.length
        ? <ul className="m-today">{mine.slice(0, 6).map(item => <li key={item.at + item.title}><ClipboardCheck size={17} /><div><b>{item.title}</b><small>{item.detail}</small></div></li>)}</ul>
        : <p className="m-empty">Nenhum registro hoje ainda.</p>}
    </section>

    {showAndroid && <a className="m-download" href={apkUrl}><Smartphone size={22} /><div><b>Instalar o app GIO Mobile</b><small>Baixe o aplicativo para Android</small></div><Download size={20} /></a>}
  </div>
}
