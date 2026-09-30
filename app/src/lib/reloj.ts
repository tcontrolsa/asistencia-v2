// Hora oficial: la del servidor (D-15) en America/Guayaquil. Nunca toISOString() para "hoy" (§3).
const TZ = 'America/Guayaquil';
let desfaseMs = 0;

// El servidor envía su hora local ('YYYY-MM-DDTHH:MM:SS...' sin zona) en mi_contexto
export function sincronizarReloj(ahoraServidorLocal: string) {
  const [f, h] = ahoraServidorLocal.split('T');
  const [y, m, d] = f.split('-').map(Number);
  const [hh, mm, ss] = h.split(':').map(x => parseFloat(x));
  // Guayaquil es UTC-5 todo el año (sin horario de verano)
  const utcMs = Date.UTC(y, m - 1, d, hh + 5, mm, Math.floor(ss), Math.round((ss % 1) * 1000));
  desfaseMs = utcMs - Date.now();
}

export function ahora(): Date {
  return new Date(Date.now() + desfaseMs);
}

export interface Partes { anio: number; mes: number; dia: number; hora: number; minuto: number; segundo: number; diaSemana: number }

export function partes(d: Date = ahora()): Partes {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    second: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(d).map(x => [x.type, x.value]));
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { anio: +p.year, mes: +p.month, dia: +p.day, hora: +p.hour, minuto: +p.minute, segundo: +p.second, diaSemana: dias[p.weekday] };
}

const dos = (n: number) => String(n).padStart(2, '0');

export function hoyStr(d: Date = ahora()): string {
  const p = partes(d);
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}`;
}

export function minutosDelDia(d: Date = ahora()): number {
  const p = partes(d);
  return p.hora * 60 + p.minuto;
}

export function horaStr(d: Date = ahora()): string {
  const p = partes(d);
  return `${dos(p.hora)}:${dos(p.minuto)}:${dos(p.segundo)}`;
}

export function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${dos(x.getUTCMonth() + 1)}-${dos(x.getUTCDate())}`;
}

// 'HH:MM' → minutos
export function aMinutos(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const m = String(hhmm).match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}
