// Regras de agenda da Agenda de Preventiva (porte de preventiva_v4/scheduler.py).
// Datas sempre como texto 'AAAA-MM-DD'; cálculos em UTC para não sofrer com fuso.

export const PERIODICITIES = new Set([1, 2, 3, 6]);
export const STATUS_NAMES = ['Agendado', 'Atrasado', 'Não realizado', 'Concluído', 'Concluído antecipado', 'Concluído com atraso'];
const TIME_ZONE = 'America/Sao_Paulo';

const pad = (n) => String(n).padStart(2, '0');
export const toIso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function parseIso(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return toIso(date) === value ? date : null;
}

export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function nowIso(now = new Date()) {
  // instante com o fuso de São Paulo, ex.: 2026-11-13T15:00:00-03:00
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}-03:00`;
}

export const addDays = (iso, days) => { const d = parseIso(iso); d.setUTCDate(d.getUTCDate() + days); return toIso(d); };
const weekday = (iso) => (parseIso(iso).getUTCDay() + 6) % 7; // segunda = 0

export function easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const nationalCache = new Map();
export function nationalHolidays(year) {
  if (!nationalCache.has(year)) {
    const map = new Map([
      [`${year}-01-01`, 'Confraternização Universal'],
      [addDays(easterDate(year), -2), 'Sexta-feira da Paixão'],
      [`${year}-04-21`, 'Tiradentes'],
      [`${year}-05-01`, 'Dia do Trabalho'],
      [`${year}-09-07`, 'Independência do Brasil'],
      [`${year}-10-12`, 'Nossa Senhora Aparecida'],
      [`${year}-11-02`, 'Finados'],
      [`${year}-11-15`, 'Proclamação da República'],
      [`${year}-12-25`, 'Natal'],
    ]);
    if (year >= 2024) map.set(`${year}-11-20`, 'Consciência Negra'); // Lei 14.759/2023
    nationalCache.set(year, map);
  }
  return nationalCache.get(year);
}

/** extra: Map<iso, {name, teamIds: string[]}> vindo de preventive_holidays */
export function holidayName(iso, teamId, extra) {
  const national = nationalHolidays(Number(iso.slice(0, 4))).get(iso);
  if (national) return national;
  const item = extra?.get(iso);
  if (item && (!item.teamIds.length || !teamId || item.teamIds.includes(teamId))) return item.name;
  return null;
}

export const isBusinessDay = (iso, teamId, extra) => weekday(iso) < 5 && !holidayName(iso, teamId, extra);
export const isRestricted = (iso, occupied, teamId, extra) => !isBusinessDay(iso, teamId, extra) || occupied.has(iso);

export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const absolute = y * 12 + (m - 1) + months;
  const year = Math.floor(absolute / 12), month = (absolute % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(d, last))}`;
}

export function calculateStatus(scheduled, completed, today = todayIso()) {
  if (completed) {
    if (completed < scheduled) return 'Concluído antecipado';
    if (completed > scheduled) return 'Concluído com atraso';
    return 'Concluído';
  }
  if (today <= scheduled) return 'Agendado';
  if (today.slice(0, 7) > scheduled.slice(0, 7)) return 'Não realizado';
  return 'Atrasado';
}

/** Dia útil livre mais próximo; em empate vence o posterior; prefere o mesmo mês. */
export function nearestAvailable(requested, occupied, { teamId, extra, allowOverride = false, maxDays = 366 } = {}) {
  const valid = (iso) => isBusinessDay(iso, teamId, extra) && !occupied.has(iso);
  if (allowOverride || valid(requested)) return { requested, selected: requested, adjusted: false, reason: '' };
  let fallback = null;
  for (let distance = 1; distance <= maxDays; distance += 1) {
    for (const candidate of [addDays(requested, distance), addDays(requested, -distance)]) {
      if (!valid(candidate)) continue;
      if (candidate.slice(0, 7) === requested.slice(0, 7)) {
        return { requested, selected: candidate, adjusted: true, reason: 'Data ajustada para o dia útil disponível mais próximo' };
      }
      if (!fallback) fallback = candidate;
    }
    if (fallback && distance > 31) break;
  }
  if (fallback) return { requested, selected: fallback, adjusted: true, reason: 'Data ajustada para o dia útil disponível mais próximo (outro mês)' };
  throw new Error('Não foi encontrada uma data disponível.');
}

/** Datas pedidas a partir da primeira, somando n × periodicidade (sem deriva). */
export function generateRequestedDates(first, periodMonths, end) {
  if (!PERIODICITIES.has(periodMonths)) throw new Error('Periodicidade inválida.');
  const dates = [];
  for (let index = 0; ; index += 1) {
    const current = addMonths(first, index * periodMonths);
    if (current > end) return dates;
    dates.push(current);
  }
}

export const horizonEnd = (today = todayIso(), years = 5) => `${Number(today.slice(0, 4)) + years - 1}-12-31`;
