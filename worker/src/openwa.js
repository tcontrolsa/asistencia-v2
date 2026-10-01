// Cliente de OpenWA/WAHA portado de JS/openwa_service.js (probarConexion, resolverChatId, enviarMensajeTexto,
// enviarMensajeImagen) con los mismos endpoints y alternativas. Corre en el servidor: sin CORS ni contenido mixto,
// y la llave viene de OPENWA_API_KEY.
const TIEMPO_MS = 20_000;

export class ErrorEnvio extends Error {
  constructor(message, reintentar = true) { super(message); this.reintentar = reintentar; }
}

export function crearOpenWA({ url, apiKey, sesion }) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  let sesionId = sesion || '';

  const headers = (json = false) => ({
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(apiKey ? { 'X-API-Key': apiKey, Authorization: `Bearer ${apiKey}` } : {}),
  });

  async function pedir(ruta, opciones = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opciones.tiempo || TIEMPO_MS);
    try {
      return await fetch(`${base}${ruta}`, { ...opciones, signal: ctrl.signal });
    } catch (e) {
      throw new ErrorEnvio(e.name === 'AbortError' ? `Tiempo de espera agotado al conectar con ${base}.` : `No se pudo conectar a ${base} (${e.message})`);
    } finally {
      clearTimeout(t);
    }
  }
  const post = (ruta, cuerpo) => pedir(ruta, { method: 'POST', headers: headers(true), body: JSON.stringify(cuerpo) });

  // probarConexion: salud del servidor y sesión lista (número y nombre del emisor)
  async function estado() {
    if (!base) return { sesion_activa: false, error: 'Falta la URL del servidor WhatsApp (OPENWA_URL o la del panel)' };
    let vivo = false;
    for (const ruta of ['/api/health', '/health']) {
      try { const r = await pedir(ruta, { tiempo: 6000 }); if (r.status < 500) { vivo = true; break; } } catch { /* siguiente */ }
    }
    if (!vivo) return { sesion_activa: false, error: `No se pudo conectar a ${base}. Verifica que el servicio esté activo.` };
    try {
      const r = await pedir('/api/sessions', { headers: headers(), tiempo: 6000 });
      if (r.status === 401) return { sesion_activa: false, error: 'El servidor WhatsApp rechazó la API key (401)' };
      if (!r.ok) return { sesion_activa: true, servidor: base };
      const datos = await r.json();
      const lista = Array.isArray(datos) ? datos : (datos.data || []);
      const lista_ok = s => ['ready', 'WORKING', 'RUNNING', 'PAIRED'].includes(s?.status);
      const s = lista.find(lista_ok) || lista[0];
      if (s && !sesion) sesionId = s.id || s.name || sesionId;
      return {
        sesion_activa: !!s && (lista_ok(s) || !!s.phone), servidor: base,
        numero_emisor: s?.phone || s?.me?.user || s?.user || null,
        nombre_emisor: s?.pushName || s?.pushname || s?.name || null,
      };
    } catch (e) {
      return { sesion_activa: false, error: e.message };
    }
  }

  // resolverChatId: número normalizado → chatId; consulta /contacts/check si está disponible
  async function chatId(numero) {
    const limpio = String(numero || '').replace(/\D/g, '');
    if (limpio.length < 9) throw new ErrorEnvio('Número de WhatsApp inválido o no especificado.', false);
    const porDefecto = `${limpio}@c.us`;
    if (!sesionId) return porDefecto;
    try {
      const r = await pedir(`/api/sessions/${sesionId}/contacts/check/${limpio}`, { headers: headers(), tiempo: 8000 });
      if (r.ok) {
        const d = await r.json();
        if (d?.exists && d.whatsappId) return d.whatsappId;
        if (d?.exists === false) throw new ErrorEnvio(`El número ${limpio} no está registrado en WhatsApp.`, false);
      }
    } catch (e) {
      if (e instanceof ErrorEnvio && !e.reintentar) throw e;
    }
    return porDefecto;
  }

  async function respuesta(r, destino) {
    let d = {};
    try { d = await r.json(); } catch { /* sin cuerpo */ }
    if (r.ok) return { destinatario: destino, mensajeId: d.messageId || d.id || d.data || 'OK' };
    let msg = d.message || d.error || `Error HTTP ${r.status} en el servidor WhatsApp`;
    if (typeof msg === 'string' && msg.toLowerCase().includes('could not resolve the recipient')) {
      msg = `WhatsApp no pudo resolver el destinatario (${destino}). Asegúrate de que el número esté registrado en WhatsApp o abre un chat con este contacto desde el teléfono emisor primero.`;
      throw new ErrorEnvio(msg, false);
    }
    throw new ErrorEnvio(typeof msg === 'string' ? msg : JSON.stringify(msg), r.status >= 500 || r.status === 429);
  }

  async function enviarTexto(numero, texto) {
    if (!String(texto || '').trim()) throw new ErrorEnvio('El contenido del mensaje no puede estar vacío.', false);
    const to = await chatId(numero);
    const t = texto.trim();
    let r = await post(`/api/sessions/${sesionId || 'default'}/messages/send-text`, { chatId: to, text: t });
    if (r.status === 404) r = await post('/api/sendText', { chatId: to, text: t, session: 'robot' });
    if (r.status === 404) r = await post('/api/messages/sendText', { to, content: t });
    return respuesta(r, to);
  }

  async function enviarImagen(numero, texto, dataUrl) {
    if (!dataUrl) return enviarTexto(numero, texto);
    const to = await chatId(numero);
    const m = String(dataUrl).match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    const mimetype = m ? m[1] : 'image/jpeg';
    const data = m ? m[2] : String(dataUrl).split('base64,').pop();
    const uri = `data:${mimetype};base64,${data}`;
    const caption = String(texto || '').trim();
    const archivo = { mimetype, filename: 'imagen.jpg', data };
    const s = sesionId || 'default';
    let r = await post(`/api/sessions/${s}/messages/send-image`, { chatId: to, base64: data, mimetype, caption });
    if (!r.ok && (r.status === 400 || r.status === 404)) {
      const r2 = await post(`/api/sessions/${s}/messages/send-image`, { chatId: to, file: archivo, caption });
      if (r2.ok) r = r2;
    }
    if (r.status === 404) r = await post('/api/sendImage', { chatId: to, file: archivo, caption, session: s });
    if (r.status === 404) r = await post('/api/sendImage', { to, chatId: to, file: uri, filename: 'imagen.jpg', caption, session: 'robot' });
    if (r.status === 404) r = await post('/api/sendImageBase64', { to, chatId: to, base64: uri, filename: 'imagen.jpg', caption, session: 'robot' });
    if (r.status === 404) r = await post(`/api/sessions/${s}/messages/send-file`, { chatId: to, file: archivo, caption });
    if (r.status === 404) r = await post('/api/sendFile', { chatId: to, file: archivo, caption, session: s });
    return respuesta(r, to);
  }

  return { estado, enviarTexto, enviarImagen, get base() { return base; } };
}
