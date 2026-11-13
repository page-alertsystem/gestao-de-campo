// Cliente da API /api/v1/preventives para o SIGA web/mobile.
// Integração: em App.tsx, passe a função que devolve o token da sessão (a mesma que
// src/serverApi.ts usa no header Authorization). Ver INTEGRACAO.md.

export type TeamId = 'SP' | 'BR';

export interface Visit {
  id: string;
  legacyId: number | null;
  clientId: string;
  clientName: string;
  teamId: TeamId;
  teamName: string;
  referenceDate: string;
  originalDate: string;
  scheduledDate: string;
  completedDate: string | null;
  technician: string;
  osNumber: string;
  ticketNumber: string;
  summary: string;
  notifiedClient: boolean;
  overrideDate: boolean;
  rescheduled: boolean;
  movidesk: { ticketId: string | null; protocol: string | null; url: string | null };
  status: string;
  rev: number;
}

export interface PlanClient {
  id: string;
  name: string;
  city: string;
  state: string;
  plan: { periodMonths: number; startMonth: number; startYear: number; teamId: TeamId; teamName: string; active: boolean; rev: number } | null;
}

export interface PendingClient { id: string; name: string; city: string; state: string; createdAt: string }
export interface Holiday { date: string; name: string; teamIds: string[] }
export interface HistoryRow { createdAt: string; userName: string; action: string; oldDate: string | null; newDate: string | null; details: string }

export class PreventivesApiError extends Error {
  constructor(message: string, public status: number, public code: string, public payload: Record<string, unknown>) {
    super(message);
  }
}

export type TokenGetter = () => string | null | undefined;

export function createPreventivesApi(getToken: TokenGetter, baseUrl = '') {
  async function call<T>(method: string, path: string, body?: unknown, query?: Record<string, string | undefined>): Promise<T> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) if (value) params.set(key, value);
    const url = `${baseUrl}/api/v1/preventives${path}${params.toString() ? `?${params}` : ''}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${getToken() ?? ''}` },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new PreventivesApiError('Não foi possível conectar ao servidor do SIGA.', 0, 'offline', {});
    }
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) throw new PreventivesApiError(data.error || `Erro ${response.status}`, response.status, data.code || '', data);
    return data as T;
  }

  return {
    me: () => call<{ person: { name: string; profiles: string[] } }>('GET', '/me'),
    holidays: (from: string, to: string) => call<Holiday[]>('GET', '/holidays', undefined, { from, to }),
    clients: () => call<PlanClient[]>('GET', '/clients'),
    pending: () => call<PendingClient[]>('GET', '/clients/pending'),
    dismiss: (clientId: string, reason: string) => call<{ ok: boolean }>('POST', `/clients/${encodeURIComponent(clientId)}/dismiss`, { reason }),
    visits: (from: string, to: string, clientId?: string) => call<Visit[]>('GET', '/visits', undefined, { from, to, clientId }),
    occupied: (teamId: string, excludeVisitId: string) => call<string[]>('GET', '/visits/occupied', undefined, { teamId, excludeVisitId }),
    visit: (id: string) => call<Visit>('GET', `/visits/${encodeURIComponent(id)}`),
    history: (id: string) => call<HistoryRow[]>('GET', `/visits/${encodeURIComponent(id)}/history`),
    reschedule: (id: string, date: string, override: boolean, reason: string, rev: number) =>
      call<Visit>('POST', `/visits/${encodeURIComponent(id)}/reschedule`, { date, override, reason, rev }),
  };
}

export type PreventivesApi = ReturnType<typeof createPreventivesApi>;

// ---------- datas (texto AAAA-MM-DD, sem fuso) ----------
const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const brDate = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const weekdayMon0 = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
export function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const STATUS_CLASS: Record<string, string> = {
  Agendado: 'scheduled', Atrasado: 'late', 'Não realizado': 'missed', 'Concluído': 'done',
  'Concluído antecipado': 'early', 'Concluído com atraso': 'done-late',
};
export const ACTION_NAMES: Record<string, string> = {
  schedule_created: 'Cronograma criado', schedule_extended: 'Cronograma estendido', schedule_replaced: 'Substituída no replanejamento',
  reschedule: 'Reagendamento', execution_saved: 'Execução registrada', client_notified: 'Cliente notificado',
  client_notification_undone: 'Notificação desfeita', movidesk_ticket_created: 'Ticket Movidesk', movidesk_error: 'Erro no Movidesk', imported: 'Importado da V3',
};
