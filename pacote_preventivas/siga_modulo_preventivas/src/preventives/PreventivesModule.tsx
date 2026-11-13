// Gestão › Agenda de Preventiva (SIGA web e mobile).
// Visível só para Service Desk e Administrador. Consulta de calendário e cronograma,
// reagendamento (motivo obrigatório) e aviso de clientes do SIGA sem cronograma.
// O cadastro e o planejamento dos cronogramas são feitos no app instalado (Preventiva V4).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ACTION_NAMES, MONTHS, STATUS_CLASS, PreventivesApiError, brDate, createPreventivesApi, daysInMonth, isoOf, todayIso, weekdayMon0,
  type Holiday, type HistoryRow, type PendingClient, type PlanClient, type PreventivesApi, type TokenGetter, type Visit,
} from './preventivesApi';
import './preventives.css';

type Tab = 'calendar' | 'schedule';
type TeamFilter = 'Todas' | 'SP' | 'BR';

export interface PreventivesModuleProps {
  /** Devolve o token da sessão do SIGA (o mesmo usado em src/serverApi.ts). */
  getToken: TokenGetter;
  /** true na casca mobile: layout em lista. */
  compact?: boolean;
  baseUrl?: string;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export default function PreventivesModule({ getToken, compact = false, baseUrl = '' }: PreventivesModuleProps) {
  const api = useMemo(() => createPreventivesApi(getToken, baseUrl), [getToken, baseUrl]);
  const today = todayIso();
  const [tab, setTab] = useState<Tab>('calendar');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<PendingClient[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [rescheduling, setRescheduling] = useState<Visit | null>(null);
  const [historyOf, setHistoryOf] = useState<Visit | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const year = Number(today.slice(0, 4));
    api.pending().then(setPending).catch((e) => setError(errorText(e)));
    api.holidays(`${year - 1}-01-01`, `${year + 5}-12-31`).then(setHolidays).catch(() => setHolidays([]));
  }, [api, today, reloadKey]);

  const showError = (e: unknown) => {
    if (e instanceof PreventivesApiError && e.status === 403) setError('Seu perfil não tem acesso à Agenda de Preventiva.');
    else setError(errorText(e));
  };

  return (
    <section className={`pv-module${compact ? ' pv-compact' : ''}`}>
      <header className="pv-header page-intro">
        <div>
          <h1>Agenda de Preventiva</h1>
          <p>Calendário e cronograma das preventivas. O planejamento é feito no app Agenda de Preventiva.</p>
        </div>
        <nav className="pv-tabs" aria-label="Visões">
          <button type="button" className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>Calendário</button>
          <button type="button" className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}>Cronograma</button>
        </nav>
      </header>

      {pending.length > 0 && <PendingBanner api={api} items={pending} onChange={reload} onError={showError} />}
      {error && <div className="pv-alert pv-alert-error" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
      {notice && <div className="pv-alert pv-alert-ok" role="status">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}

      {tab === 'calendar'
        ? <CalendarView api={api} today={today} reloadKey={reloadKey} onError={showError} onReschedule={setRescheduling} onHistory={setHistoryOf} />
        : <ScheduleView api={api} today={today} reloadKey={reloadKey} onError={showError} onReschedule={setRescheduling} onHistory={setHistoryOf} />}

      {rescheduling && (
        <RescheduleDialog
          api={api} visit={rescheduling} holidays={holidays}
          onClose={() => setRescheduling(null)}
          onDone={(visit) => { setRescheduling(null); setNotice(`${visit.clientName}: reagendada para ${brDate(visit.scheduledDate)}.`); reload(); }}
          onConflict={(message) => { setRescheduling(null); setError(message); reload(); }}
        />
      )}
      {historyOf && <HistoryDialog api={api} visit={historyOf} onClose={() => setHistoryOf(null)} />}
    </section>
  );
}

// ---------------- clientes pendentes ----------------
function PendingBanner({ api, items, onChange, onError }: { api: PreventivesApi; items: PendingClient[]; onChange: () => void; onError: (e: unknown) => void }) {
  const [open, setOpen] = useState(false);
  async function dismiss(item: PendingClient) {
    const reason = window.prompt(`Por que ${item.name} não terá cronograma de preventivas?`);
    if (!reason?.trim()) return;
    try {
      await api.dismiss(item.id, reason.trim());
      onChange();
    } catch (e) { onError(e); }
  }
  return (
    <div className="pv-pending">
      <button type="button" className="pv-pending-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <strong>{items.length} cliente(s) novo(s) no SIGA sem cronograma de preventivas.</strong>
        <span>{open ? 'Ocultar' : 'Revisar'}</span>
      </button>
      {open && (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <div><strong>{item.name}</strong><small>{[item.city, item.state].filter(Boolean).join(' / ')}</small></div>
              <div className="pv-pending-actions">
                <span>Criar o cronograma no app Agenda de Preventiva</span>
                <button type="button" onClick={() => dismiss(item)}>Não terá cronograma</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------- calendário ----------------
interface ViewProps {
  api: PreventivesApi;
  today: string;
  reloadKey: number;
  onError: (e: unknown) => void;
  onReschedule: (v: Visit) => void;
  onHistory: (v: Visit) => void;
}

function CalendarView({ api, today, reloadKey, onError, onReschedule, onHistory }: ViewProps) {
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [team, setTeam] = useState<TeamFilter>('Todas');
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.visits(isoOf(year, month, 1), isoOf(year, month, daysInMonth(year, month)))
      .then((items) => { if (alive) setVisits(items); })
      .catch(onError)
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [api, year, month, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (delta: number) => {
    const index = year * 12 + month - 1 + delta;
    setYear(Math.floor(index / 12));
    setMonth((index % 12) + 1);
    setSelectedDay(null);
  };
  const filtered = visits.filter((v) => team === 'Todas' || v.teamId === team);
  const byDay = new Map<string, Visit[]>();
  for (const v of filtered) byDay.set(v.scheduledDate, [...(byDay.get(v.scheduledDate) ?? []), v]);
  const first = isoOf(year, month, 1);
  const cells: (string | null)[] = Array(weekdayMon0(first)).fill(null);
  for (let d = 1; d <= daysInMonth(year, month); d += 1) cells.push(isoOf(year, month, d));
  while (cells.length % 7) cells.push(null);
  const list = selectedDay ? byDay.get(selectedDay) ?? [] : filtered;

  return (
    <div className="pv-calendar-layout">
      <div className="surface pv-panel">
        <div className="pv-toolbar">
          <button type="button" onClick={() => move(-1)} aria-label="Mês anterior">‹</button>
          <h2>{MONTHS[month - 1]} {year}</h2>
          <button type="button" onClick={() => move(1)} aria-label="Próximo mês">›</button>
          <button type="button" className="pv-link" onClick={() => { setYear(Number(today.slice(0, 4))); setMonth(Number(today.slice(5, 7))); setSelectedDay(null); }}>Hoje</button>
          <div className="pv-segment" role="group" aria-label="Equipe">
            {(['Todas', 'SP', 'BR'] as TeamFilter[]).map((t) => (
              <button type="button" key={t} className={team === t ? 'active' : ''} onClick={() => setTeam(t)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="pv-grid" aria-busy={loading}>
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => <div key={d} className="pv-weekday">{d}</div>)}
          {cells.map((day, index) => {
            if (!day) return <div key={`e${index}`} className="pv-day pv-day-empty" />;
            const items = byDay.get(day) ?? [];
            const sp = items.filter((v) => v.teamId === 'SP').length;
            const brCount = items.filter((v) => v.teamId === 'BR').length;
            return (
              <button type="button" key={day} onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                className={`pv-day${day === today ? ' pv-today' : ''}${day === selectedDay ? ' pv-selected' : ''}${weekdayMon0(day) >= 5 ? ' pv-weekend' : ''}`}>
                <span className="pv-day-number">{Number(day.slice(8))}</span>
                {sp > 0 && <span className={`pv-chip pv-sp${sp > 1 ? ' many' : ''}`}>SP: {sp}</span>}
                {brCount > 0 && <span className={`pv-chip pv-br${brCount > 1 ? ' many' : ''}`}>BR: {brCount}</span>}
              </button>
            );
          })}
        </div>
        <div className="pv-legend"><span className="pv-chip pv-sp">1 SP</span><span className="pv-chip pv-sp many">2+ SP</span><span className="pv-chip pv-br">1 BR</span><span className="pv-chip pv-br many">2+ BR</span></div>
      </div>
      <div className="surface pv-panel">
        <div className="pv-toolbar">
          <h2>{selectedDay ? `Preventivas de ${brDate(selectedDay)}` : 'Preventivas do mês'}</h2>
          <span className="pv-count">{list.length}</span>
          {selectedDay && <button type="button" className="pv-link" onClick={() => setSelectedDay(null)}>Ver o mês</button>}
        </div>
        <VisitList visits={list} onReschedule={onReschedule} onHistory={onHistory} empty="Nenhuma preventiva neste período." />
      </div>
    </div>
  );
}

function VisitList({ visits, onReschedule, onHistory, empty, showClient = true }: { visits: Visit[]; onReschedule: (v: Visit) => void; onHistory: (v: Visit) => void; empty: string; showClient?: boolean }) {
  if (!visits.length) return <p className="pv-empty">{empty}</p>;
  return (
    <ul className="pv-visits">
      {visits.map((v) => {
        const done = Boolean(v.completedDate);
        return (
          <li key={v.id}>
            <div className="pv-visit-main">
              <span className="pv-date">{brDate(v.scheduledDate)}</span>
              <div>
                {showClient && <strong>{v.clientName}</strong>}
                <small>
                  {MONTHS[Number(v.referenceDate.slice(5, 7)) - 1]} · Equipe {v.teamId}
                  {v.rescheduled ? ' · reagendada' : ''}{v.notifiedClient ? ' · cliente notificado' : ''}
                  {v.movidesk.ticketId ? ` · ticket ${v.movidesk.ticketId}` : ''}
                </small>
              </div>
            </div>
            <div className="pv-visit-actions">
              <span className={`pv-status pv-status-${STATUS_CLASS[v.status] ?? 'scheduled'}`}>{v.status}</span>
              <button type="button" onClick={() => onHistory(v)}>Histórico</button>
              <button type="button" className="primary-button" disabled={done} title={done ? 'Preventiva já realizada' : ''} onClick={() => onReschedule(v)}>Reagendar</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------- cronograma ----------------
function ScheduleView({ api, today, reloadKey, onError, onReschedule, onHistory }: ViewProps) {
  const [clients, setClients] = useState<PlanClient[]>([]);
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [visits, setVisits] = useState<Visit[]>([]);

  useEffect(() => {
    api.clients().then((items) => {
      setClients(items);
      setClientId((current) => current || items[0]?.id || '');
    }).catch(onError);
  }, [api, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!clientId) { setVisits([]); return; }
    api.visits(`${year}-01-01`, `${year}-12-31`, clientId).then(setVisits).catch(onError);
  }, [api, clientId, year, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const options = clients.filter((c) => !search || norm(c.name).includes(norm(search)));
  const client = clients.find((c) => c.id === clientId);
  const periodName = { 1: 'Mensal', 2: 'Bimestral', 3: 'Trimestral', 6: 'Semestral' } as Record<number, string>;
  const currentYear = Number(today.slice(0, 4));

  return (
    <div className="surface pv-panel">
      <div className="pv-toolbar pv-filters">
        <label>Pesquisar<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome do cliente" /></label>
        <label>Cliente
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Ano
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 7 }, (_, i) => currentYear - 2 + i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
      {client?.plan && (
        <p className="pv-plan">
          {periodName[client.plan.periodMonths]} · início {MONTHS[client.plan.startMonth - 1].toLowerCase()}/{client.plan.startYear} · equipe {client.plan.teamName}
          {[client.city, client.state].filter(Boolean).length ? ` · ${[client.city, client.state].filter(Boolean).join(' / ')}` : ''}
        </p>
      )}
      <VisitList visits={visits} onReschedule={onReschedule} onHistory={onHistory} showClient={false} empty={clientId ? 'Nenhuma preventiva neste ano.' : 'Nenhum cliente com cronograma.'} />
    </div>
  );
}

// ---------------- reagendar ----------------
function RescheduleDialog({ api, visit, holidays, onClose, onDone, onConflict }: {
  api: PreventivesApi; visit: Visit; holidays: Holiday[];
  onClose: () => void; onDone: (v: Visit) => void; onConflict: (message: string) => void;
}) {
  const [date, setDate] = useState(visit.scheduledDate);
  const [reason, setReason] = useState('');
  const [occupied, setOccupied] = useState<Set<string>>(new Set());
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.occupied(visit.teamId, visit.id).then((items) => setOccupied(new Set(items))).catch(() => setOccupied(new Set()));
  }, [api, visit]);

  const holiday = holidays.find((h) => h.date === date && (!h.teamIds.length || h.teamIds.includes(visit.teamId)));
  const restrictions = [
    date && weekdayMon0(date) >= 5 ? 'é final de semana' : '',
    holiday ? `é feriado (${holiday.name})` : '',
    occupied.has(date) ? 'já tem preventiva desta equipe' : '',
  ].filter(Boolean);

  async function submit(target: string, override: boolean) {
    if (!reason.trim()) { setMessage('Informe o motivo do reagendamento.'); return; }
    setBusy(true);
    setMessage('');
    try {
      onDone(await api.reschedule(visit.id, target, override, reason.trim(), visit.rev));
    } catch (e) {
      if (e instanceof PreventivesApiError && e.code === 'date_restricted') {
        setSuggestion(String(e.payload.suggestedDate || '') || null);
        setMessage(e.message);
      } else if (e instanceof PreventivesApiError && e.code === 'conflict') {
        onConflict('Outra pessoa alterou esta preventiva. A lista foi atualizada; tente novamente.');
      } else {
        setMessage(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pv-backdrop" role="dialog" aria-modal="true" aria-labelledby="pv-reschedule-title" onClick={onClose}>
      <form className="pv-dialog surface" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); submit(date, restrictions.length > 0); }}>
        <h2 id="pv-reschedule-title">Reagendar preventiva</h2>
        <p className="pv-muted">{visit.clientName} · {MONTHS[Number(visit.referenceDate.slice(5, 7)) - 1]} · equipe {visit.teamId}<br />Data atual: <strong>{brDate(visit.scheduledDate)}</strong></p>
        <label>Nova data<input type="date" value={date} required onChange={(e) => { setDate(e.target.value); setSuggestion(null); setMessage(''); }} /></label>
        {restrictions.length > 0 && <p className="pv-warning">Atenção: a data escolhida {restrictions.join(' e ')}. Ao confirmar, ela será mantida mesmo assim.</p>}
        <label>Motivo (obrigatório)<textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Ex.: pedido do cliente" /></label>
        {message && <p className="pv-warning" role="alert">{message}</p>}
        <div className="pv-dialog-actions">
          {suggestion && <button type="button" disabled={busy} onClick={() => submit(suggestion, false)}>Usar {brDate(suggestion)}</button>}
          <button type="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={busy || !date || date === visit.scheduledDate}>{busy ? 'Salvando…' : 'Confirmar'}</button>
        </div>
      </form>
    </div>
  );
}

function HistoryDialog({ api, visit, onClose }: { api: PreventivesApi; visit: Visit; onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  useEffect(() => { api.history(visit.id).then(setRows).catch(() => setRows([])); }, [api, visit]);
  return (
    <div className="pv-backdrop" role="dialog" aria-modal="true" aria-labelledby="pv-history-title" onClick={onClose}>
      <div className="pv-dialog pv-dialog-wide surface" onClick={(e) => e.stopPropagation()}>
        <h2 id="pv-history-title">Histórico · {visit.clientName}</h2>
        {!rows ? <p className="pv-muted">Carregando…</p> : (
          <ul className="pv-history">
            {rows.map((r, i) => (
              <li key={i}>
                <span>{r.createdAt.slice(0, 16).replace('T', ' ')}</span>
                <strong>{ACTION_NAMES[r.action] ?? r.action}</strong>
                <span>{[r.oldDate && `de ${brDate(r.oldDate)}`, r.newDate && `para ${brDate(r.newDate)}`].filter(Boolean).join(' ')}</span>
                <small>{[r.userName, r.details].filter(Boolean).join(' · ')}</small>
              </li>
            ))}
          </ul>
        )}
        <div className="pv-dialog-actions"><button type="button" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  );
}
