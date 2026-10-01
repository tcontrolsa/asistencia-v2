// Lectura de Firestore del legado por REST (solo lectura). Las reglas del legado permiten leer `registros` y
// `empleados` sin autenticación; no se usan llaves. Devuelve los documentos como objetos planos.
const valor = v => {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return plano(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valor);
  if ('geoPointValue' in v) return v.geoPointValue;
  return null;
};
const plano = campos => Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, valor(v)]));

export function crearFirestore({ proyecto }) {
  const base = `https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents`;

  // Colección completa, página por página. Lanza error si alguna página falla (la copia no borra nada en ese caso).
  async function listar(coleccion) {
    const docs = [];
    let token = '';
    do {
      const url = `${base}/${coleccion}?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Firestore ${coleccion}: ${d.error?.message || r.status}`);
      for (const doc of d.documents || []) docs.push({ id: doc.name.split('/').pop(), data: plano(doc.fields || {}) });
      token = d.nextPageToken || '';
    } while (token);
    return docs;
  }

  return { listar };
}
