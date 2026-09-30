import { ahora, partes } from './reloj';

// formatearHora del legado: 'h:mm a. m./p. m.' o 24 h. Las horas llegan como 'HH:MM:SS' del servidor.
export function formatearHora(valor?: string | Date | null, force24h = false): string {
  if (!valor) return '--:--';
  let H: number | null = null, M: number | null = null;
  if (valor instanceof Date) {
    const p = partes(valor);
    H = p.hora; M = p.minuto;
  } else {
    const s = String(valor).trim();
    const m12 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)?$/i);
    if (m12) {
      H = parseInt(m12[1], 10); M = parseInt(m12[2], 10);
      if (m12[4]) {
        if (/p/i.test(m12[4]) && H < 12) H += 12;
        if (/a/i.test(m12[4]) && H === 12) H = 0;
      }
    } else {
      const m = s.match(/(\d{1,2}):(\d{2})/);
      if (m) { H = parseInt(m[1], 10); M = parseInt(m[2], 10); }
    }
  }
  if (H === null || M === null || isNaN(H) || isNaN(M)) return '--:--';
  if (force24h) return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
  const ampm = H >= 12 ? 'p. m.' : 'a. m.';
  const h12 = H % 12 || 12;
  return `${h12}:${String(M).padStart(2, '0')} ${ampm}`;
}

export const formatearHora24 = (v?: string | Date | null) => formatearHora(v, true);

export function formatMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${h}h ${m}m`;
}

// Fecha 'YYYY-MM-DD' como Date local a mediodía (para toLocaleDateString sin corrimientos)
export function fechaLocal(f: string): Date {
  const [y, m, d] = f.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function saludo(): string {
  const h = partes(ahora()).hora;
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

export function capitalizarTexto(str: string): string {
  return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';
}

// Formato habitual en Ecuador: [Apellido 1] [Apellido 2] [Nombre 1] …
export function extraerPrimerNombre(nombre?: string): string {
  if (!nombre) return 'Colaborador';
  const partesN = nombre.trim().split(/\s+/);
  return capitalizarTexto(partesN.length >= 3 ? partesN[2] : partesN[0]);
}

export function esCumpleanos(fechaNac?: string | null): boolean {
  if (!fechaNac) return false;
  const m = String(fechaNac).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const p = partes(ahora());
  return p.dia === parseInt(m[3], 10) && p.mes === parseInt(m[2], 10);
}

// 'YYYY-MM-DD' → 'DD/MM/YYYY' (así lo muestra el perfil del legado)
export function fechaDMY(f?: string | null): string {
  if (!f) return '';
  const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(f);
}
