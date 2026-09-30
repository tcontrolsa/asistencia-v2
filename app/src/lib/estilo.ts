import type { CSSProperties } from 'react';

// Convierte los estilos en línea del legado ("color: red; font-size: 12px") en objetos de React,
// para portar el marcado sin reescribir a mano cada declaración (paridad visual 1:1, 05_DISENO §1).
const cache = new Map<string, CSSProperties>();

export function s(css: string): CSSProperties {
  const hit = cache.get(css);
  if (hit) return hit;
  const out: Record<string, string> = {};
  // Separa por ';' respetando paréntesis (url(), rgba(), linear-gradient(…; …) no ocurre pero por si acaso)
  let prof = 0, actual = '';
  const partes: string[] = [];
  for (const ch of css) {
    if (ch === '(') prof++;
    if (ch === ')') prof--;
    if (ch === ';' && prof === 0) { partes.push(actual); actual = ''; } else actual += ch;
  }
  partes.push(actual);
  for (const decl of partes) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    let valor = decl.slice(i + 1).trim();
    if (!prop || !valor) continue;
    const importante = /!important$/.test(valor);
    if (importante) valor = valor.replace(/\s*!important$/, '');
    const clave = prop.startsWith('--') ? prop : prop.replace(/-([a-z])/g, (_, l: string) => l.toUpperCase())
      .replace(/^Webkit/, 'Webkit').replace(/^webkit/, 'Webkit');
    out[clave] = valor;
  }
  cache.set(css, out as CSSProperties);
  return out as CSSProperties;
}
