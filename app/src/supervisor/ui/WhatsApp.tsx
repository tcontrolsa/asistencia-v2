// Notificaciones WhatsApp (#panel-whatsapp, supervisor_whatsapp.js): servidor y prueba, recordatorio automático,
// plantillas con simulador, auditoría; modales de envío masivo, mensaje individual y nueva plantilla.
// Los mensajes se encolan en el servidor; los envía el worker (Fase 6) con la llave en su variable de entorno.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { rpc } from '../../lib/api';
import { s } from '../../lib/estilo';
import { obtenerEstadoCumpleanos, obtenerFechaNacimientoEmpleado } from '../legado/personas';
import { escapeHtml } from '../legado/util';
import {
  CategoriaWA, ConfigWA, PLANTILLAS_RESTABLECER, PlantillaWA, SUBTITULOS_CATEGORIA, TITULOS_CATEGORIA, clasificarDestinatarios,
  fechaHoraAhora, formatearMensaje, markdownWA, mensajeIndividual, mensajePrueba, normalizarNumero, resolverTipoPlantilla, textoPlantilla,
} from '../legado/whatsapp';
import { abrirModal, cerrarModal, useModal } from '../nav';
import { buscarEmpleado, cargarDatosCompletos, mostrarLoader, sup, useSup } from '../store';
import { PhotoCell, errorTexto, mostrarToast } from './comun';

// ─── Datos de WhatsApp (configuración, plantillas y estado del servicio) ───
interface DatosWA { config: ConfigWA; plantillas: Record<string, PlantillaWA>; servicio: { conectado: boolean; numeroEmisor?: string; nombreEmisor?: string; error?: string } }
let datosWA: DatosWA | null = null;
const oyentes = new Set<() => void>();
export async function cargarWA(): Promise<DatosWA> {
  datosWA = await rpc<DatosWA>('sup_whatsapp_plantillas', {});
  oyentes.forEach(f => f());
  return datosWA;
}
function useWA(): DatosWA | null {
  const d = useSyncExternalStore(f => { oyentes.add(f); return () => { oyentes.delete(f); }; }, () => datosWA);
  useEffect(() => { if (!datosWA) cargarWA().catch(e => mostrarToast(errorTexto(e), 'error')); }, []);
  return d;
}

async function encolar(mensajes: any[], tipo: string, origen = 'MANUAL') {
  return rpc<{ encolados: number; sinTelefono: number }>('sup_encolar_whatsapp', { p_mensajes: mensajes, p_tipo: tipo, p_origen: origen });
}

// Imagen reducida a 1200 px en JPEG 0.85 (_onSubirImagenPlantillaWA)
function leerImagen(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Error al leer el archivo de imagen'));
    reader.onload = ev => {
      const raw = String(ev.target?.result || '');
      const img = new Image();
      img.onerror = () => resolve(raw);
      img.onload = () => {
        try {
          let w = img.width, h = img.height;
          const max = 1200;
          if (w > max || h > max) { if (w > h) { h = Math.round((h * max) / w); w = max; } else { w = Math.round((w * max) / h); h = max; } }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d')!.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.85));
        } catch { resolve(raw); }
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}
const esImagen = (f: File) => (f.type || '').toLowerCase().startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|jfif)$/i.test(f.name || '');

const TABS_BASE = [
  { tipo: 'no_registro', id: 'btnTabPlantillaNoRegistro', texto: <><i className="fas fa-bell"></i> 🔔 Entrada Faltante</> },
  { tipo: 'vacaciones', id: 'btnTabPlantillaVacaciones', texto: <>🏖️ Vacaciones</> },
  { tipo: 'permisos', id: 'btnTabPlantillaPermiso', texto: <>📝 Permisos</> },
  { tipo: 'ausente', id: 'btnTabPlantillaAusente', texto: <><i className="fas fa-user-slash"></i> 📋 Ausencia Laboral</> },
  { tipo: 'salida_faltante', id: 'btnTabPlantillaSalida', texto: <><i className="fas fa-door-open"></i> 🚪 Salida Faltante</> },
  { tipo: 'emergencia', id: 'btnTabPlantillaEmergencia', texto: <><i className="fas fa-exclamation-triangle"></i> 🚨 Alerta de Emergencia</> },
];
const TITULOS_PLANTILLA: Record<string, string> = {
  no_registro: 'Plantilla: Entrada Faltante (Sin Marcar)', vacaciones: 'Plantilla: Notificación de Vacaciones', permisos: 'Plantilla: Permiso o Justificación Laboral',
  ausente: 'Plantilla: Ausencia Laboral', salida_faltante: 'Plantilla: Salida Faltante', emergencia: 'Plantilla: Alerta de Emergencia',
};
const DIAS = [['LUNES', 1, 'Lunes'], ['MARTES', 2, 'Martes'], ['MIERCOLES', 3, 'Miércoles'], ['JUEVES', 4, 'Jueves'], ['VIERNES', 5, 'Viernes'], ['SABADO', 6, 'Sábado']] as const;

export function PanelWhatsApp() {
  const wa = useWA();
  const [sub, setSub] = useState<'servidor' | 'automatico' | 'plantillas' | 'logs'>('servidor');
  const [cfg, setCfg] = useState<ConfigWA | null>(null);
  const [tipoActivo, setTipoActivo] = useState('no_registro');
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<'verificando' | 'ok' | 'error'>('verificando');
  const [numPrueba, setNumPrueba] = useState('593984660105');
  const [tipoPrueba, setTipoPrueba] = useState('ENTRADA_FALTANTE');
  const [msgPrueba, setMsgPrueba] = useState('');
  const [nuevaPlantilla, setNuevaPlantilla] = useState(false);
  const refTxt = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!wa) return;
    setCfg(c => c || wa.config);
    setEstado(wa.servicio.conectado ? 'ok' : 'error');
  }, [wa]);
  useEffect(() => { if (cfg && !msgPrueba) setMsgPrueba(mensajePrueba(tipoPrueba, cfg.enlaceApp, '')); }, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps

  const plantillas = wa?.plantillas || {};
  const textoActivo = textos[tipoActivo] ?? textoPlantilla(plantillas, tipoActivo);
  const imagenActiva = plantillas[tipoActivo]?.imagen || null;
  const personalizadas = Object.entries(plantillas).filter(([, p]) => p.personalizada);

  const probarConexion = async (silencioso = false) => {
    setEstado('verificando');
    try {
      const d = await cargarWA();
      setEstado(d.servicio.conectado ? 'ok' : 'error');
      if (!silencioso) {
        if (d.servicio.conectado) mostrarToast('Servidor WhatsApp conectado exitosamente', 'success');
        else mostrarToast(d.servicio.error || 'El servicio de envío (worker) aún no reporta conexión con OpenWA', 'error');
      }
    } catch (e) { setEstado('error'); if (!silencioso) mostrarToast(errorTexto(e), 'error'); }
  };

  const guardarConfig = async () => {
    if (!cfg) return;
    mostrarLoader(true);
    try {
      await rpc('sup_guardar_whatsapp_config', { p_config: cfg });
      await rpc('sup_guardar_plantilla_wa', { p_clave: tipoActivo, p_nombre: plantillas[tipoActivo]?.nombre || TITULOS_PLANTILLA[tipoActivo] || tipoActivo, p_texto: textoActivo });
      await cargarWA();
      mostrarToast('Configuración y plantillas de WhatsApp guardadas exitosamente', 'success');
    } catch (e) { mostrarToast('Error al guardar configuración: ' + errorTexto(e), 'error'); }
    finally { mostrarLoader(false); }
  };

  const restablecer = () => {
    if (!window.confirm('¿Deseas restablecer la plantilla activa a su texto predeterminado?')) return;
    setTextos(t => ({ ...t, [tipoActivo]: PLANTILLAS_RESTABLECER[tipoActivo] || PLANTILLAS_RESTABLECER.no_registro }));
    mostrarToast('Plantilla restablecida a valor por defecto', 'info');
  };

  const insertarVariable = (v: string) => {
    const ta = refTxt.current;
    if (!ta) return;
    const ini = ta.selectionStart || 0, fin = ta.selectionEnd || 0;
    setTextos(t => ({ ...t, [tipoActivo]: textoActivo.substring(0, ini) + v + textoActivo.substring(fin) }));
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = ini + v.length; });
  };

  const subirImagen = async (file: File | undefined) => {
    if (!file) return;
    if (!esImagen(file)) { mostrarToast('Por favor selecciona un archivo de imagen válido (JPG, PNG, WebP)', 'warning'); return; }
    mostrarToast('Cargando y procesando imagen...', 'info');
    try {
      const b64 = await leerImagen(file);
      await rpc('sup_guardar_plantilla_wa', { p_clave: tipoActivo, p_nombre: plantillas[tipoActivo]?.nombre || TITULOS_PLANTILLA[tipoActivo] || tipoActivo, p_texto: textoActivo, p_imagen: b64 });
      await cargarWA();
      mostrarToast('¡Imagen adjuntada a la plantilla con éxito!', 'success');
    } catch (e) { mostrarToast(errorTexto(e), 'error'); }
  };
  const quitarImagen = async () => {
    try {
      await rpc('sup_guardar_plantilla_wa', { p_clave: tipoActivo, p_nombre: plantillas[tipoActivo]?.nombre || TITULOS_PLANTILLA[tipoActivo] || tipoActivo, p_texto: textoActivo, p_quitar_imagen: true });
      await cargarWA();
      mostrarToast('Imagen eliminada de la plantilla', 'info');
    } catch (e) { mostrarToast(errorTexto(e), 'error'); }
  };
  const eliminarPlantilla = async () => {
    if (!tipoActivo.startsWith('custom_') || !window.confirm('¿Seguro que deseas eliminar esta plantilla personalizada?')) return;
    try {
      await rpc('sup_eliminar_plantilla_wa', { p_clave: tipoActivo });
      await cargarWA();
      setTipoActivo('no_registro');
      mostrarToast('Plantilla eliminada', 'info');
    } catch (e) { mostrarToast(errorTexto(e), 'error'); }
  };

  const cargarPrueba = (tipo: string) => { setTipoPrueba(tipo); setMsgPrueba(mensajePrueba(tipo, cfg?.enlaceApp || 'https://tcontrol.ec/asistencia', textoActivo)); };
  const clavePrueba = resolverTipoPlantilla(tipoPrueba, tipoActivo);
  const imgPrueba = plantillas[clavePrueba]?.imagen || null;
  const enviarPrueba = async () => {
    const num = numPrueba.trim();
    if (!num) { mostrarToast('Ingresa un número telefónico para la prueba', 'error'); return; }
    const msg = msgPrueba.trim() || mensajePrueba(tipoPrueba, cfg?.enlaceApp || '', textoActivo);
    if (!msgPrueba.trim()) setMsgPrueba(msg);
    mostrarLoader(true);
    try {
      const r = await encolar([{ empleadoId: 'TEST-001', nombre: 'Prueba de Sistema', telefono: num, mensaje: msg, plantilla: imgPrueba ? clavePrueba : null }], `PRUEBA_${tipoPrueba}`);
      if (r.encolados) mostrarToast('Mensaje de prueba en cola de envío para ' + num + (imgPrueba ? ' (con imagen adjunta)' : ''), 'success');
      else mostrarToast('Número de WhatsApp no válido para la prueba', 'error');
    } catch (e) { mostrarToast('Error de conexión: ' + errorTexto(e), 'error'); }
    finally { mostrarLoader(false); }
  };

  const { fecha, hora } = fechaHoraAhora();
  const previewHtml = markdownWA(escapeHtml(textoActivo.replace(/\{nombre\}/gi, 'Carlos Mendoza').replace(/\{fecha\}/gi, fecha).replace(/\{hora\}/gi, hora)
    .replace(/\{link\}/gi, cfg?.enlaceApp || 'https://tcontrol.ec/asistencia').replace(/\{area\}/gi, 'Producción').replace(/\{cargo\}/gi, 'Técnico Electromecánico')));

  const badge = estado === 'ok' ? { bg: '#dcfce7', c: '#15803d', t: <><i className="fas fa-check-circle"></i> Conectado</> }
    : estado === 'error' ? { bg: '#fee2e2', c: '#b91c1c', t: <><i className="fas fa-exclamation-triangle"></i> Desconectado</> }
    : { bg: '#e2e8f0', c: '#475569', t: <><i className="fas fa-circle-notch fa-spin"></i> Verificando...</> };
  const tabBtn = (id: typeof sub, icono: string, texto: string) => (
    <button type="button" onClick={() => { setSub(id); if (id === 'servidor') void probarConexion(true); }} id={`btnWaSub${id[0].toUpperCase()}${id.slice(1)}`} className={`btn-wa-subtab${sub === id ? ' active' : ''}`}><i className={icono}></i> {texto}</button>
  );
  const pillPlantilla = (activo: boolean) => s(`padding:7px 14px; border-radius:8px; font-size:12px; font-weight:${activo ? '700' : '600'}; border:1px solid ${activo ? '#86efac' : '#cbd5e1'}; background:${activo ? '#ecfdf5' : '#ffffff'}; color:${activo ? '#15803d' : '#475569'}; cursor:pointer; display:inline-flex; align-items:center; gap:6px;`);
  const lbl = s('font-size:11.5px; font-weight:700;');
  const setC = (p: Partial<ConfigWA>) => setCfg(c => (c ? { ...c, ...p } : c));

  return (
    <div style={s('background:#ffffff; border:1px solid var(--g200); border-radius:16px; padding:24px; margin-bottom:16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);')}>
      <div style={s('display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; margin-bottom:20px; border-bottom:1px solid #f1f5f9; padding-bottom:16px;')}>
        <div style={s('display:flex; align-items:center; gap:10px;')}>
          <span style={s('background:linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color:white; width:38px; height:38px; border-radius:10px; display:inline-flex; align-items:center; justify-content:center; font-size:19px; box-shadow:0 3px 10px rgba(34,197,94,0.3);')}><i className="fab fa-whatsapp"></i></span>
          <div>
            <h4 style={s('font-weight:800; color:#0f172a; margin:0; font-size:18px;')}>Configuración de Notificaciones por WhatsApp</h4>
            <p style={s('color:#64748b; margin:3px 0 0 0; font-size:12.5px;')}>Integración con servicio OpenWA para alertas de asistencia, recordatorios a no registrados y comunicación directa.</p>
          </div>
        </div>
        <div style={s('display:flex; gap:8px; flex-wrap:wrap;')}>
          <button type="button" className="btn" onClick={restablecer} style={s('padding:9px 15px; border-radius:8px; font-size:12.5px; font-weight:600; background:#f8fafc; border:1px solid var(--g300); color:#475569; display:inline-flex; align-items:center; gap:6px; cursor:pointer;')} title="Restablecer plantilla y valores por defecto"><i className="fas fa-undo"></i> Restablecer Plantilla</button>
          <button type="button" className="btn btn-success" onClick={() => void guardarConfig()} style={s('padding:9px 20px; border-radius:8px; font-size:12.5px; font-weight:700; background:#16a34a; border:none; color:white; display:inline-flex; align-items:center; gap:6px; cursor:pointer; box-shadow:0 2px 8px rgba(22,163,74,0.25);')}><i className="fas fa-save"></i> Guardar Configuración</button>
        </div>
      </div>

      <div className="wa-subtabs-bar">
        {tabBtn('servidor', 'fas fa-server', '1. Servidor & Conexión')}
        {tabBtn('automatico', 'fas fa-robot', '2. Recordatorio Automático')}
        {tabBtn('plantillas', 'fas fa-comment-alt', '3. Plantillas & Simulador')}
        {tabBtn('logs', 'fas fa-clipboard-list', '4. Auditoría & Logs')}
      </div>

      {sub === 'servidor' && (
        <div id="waSecServidor" className="wa-subtab-content" style={s('display:block;')}>
          <div style={s('display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:20px;')}>
            <div style={s('background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; gap:16px;')}>
              <div>
                <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;')}>
                  <h5 style={s('margin:0; font-size:14.5px; font-weight:750; color:#1e293b; display:flex; align-items:center; gap:8px;')}><i className="fas fa-server" style={s('color:#0284c7;')}></i> Servidor OpenWA / WAHA</h5>
                  <span id="badgeOpenWAEstado" style={s(`font-size:11px; font-weight:800; padding:3px 10px; border-radius:20px; background:${badge.bg}; color:${badge.c};`)}>{badge.t}</span>
                </div>
                <div className="form-group" style={s('margin-bottom:12px;')}>
                  <label className="form-label" style={lbl}>URL del Servidor WhatsApp *</label>
                  <input type="text" id="txtWhatsAppServidorUrl" className="form-input" value={cfg?.servidorUrl || ''} onChange={ev => setC({ servidorUrl: ev.target.value })} placeholder="http://192.168.10.129:2785 o https://...trycloudflare.com" style={s('font-family:monospace; font-size:12.5px;')} />
                  <small style={s('color:#64748b; font-size:11px; margin-top:3px; display:block;')}>Dirección que usa el servicio de envío del servidor para conectarse con OpenWA.</small>
                </div>
                <div className="form-group" style={s('margin-bottom:12px;')}>
                  <label className="form-label" style={lbl}>API Key / Token</label>
                  <input type="password" id="txtWhatsAppApiKey" className="form-input" disabled value="" placeholder="Configurada en el servidor" style={s('font-family:monospace; font-size:12.5px;')} />
                  <small style={s('color:#64748b; font-size:11px; margin-top:3px; display:block;')}>Por seguridad la clave (header X-Api-Key) se guarda solo en el servidor, en la variable de entorno del servicio de envío.</small>
                </div>
                <div style={s('background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:10px 12px; margin-bottom:12px;')}>
                  <div style={s('font-size:11.5px; color:#64748b; margin-bottom:4px;')}>Línea de WhatsApp Vinculada:</div>
                  <div style={s('display:flex; align-items:center; justify-content:space-between;')}>
                    <strong id="lblWhatsAppNumeroEmisor" style={s('color:#0f172a; font-size:13px;')}>{estado === 'ok' ? wa?.servicio.numeroEmisor || 'Conectado' : '--'}</strong>
                    <span id="lblWhatsAppNombreEmisor" style={s('font-size:11px; background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:6px; font-weight:700;')}>{estado === 'ok' ? wa?.servicio.nombreEmisor || 'OpenWA' : '--'}</span>
                  </div>
                </div>
                <label htmlFor="chkWhatsAppActivo" style={s('display:flex; align-items:center; justify-content:space-between; background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:10px 12px; cursor:pointer; user-select:none;')}>
                  <div>
                    <strong style={s('font-size:12.5px; color:#1e293b; display:block;')}>Módulo WhatsApp Activo</strong>
                    <span style={s('font-size:11px; color:#64748b;')}>Habilita el envío de mensajes desde la plataforma</span>
                  </div>
                  <div className="switch"><input type="checkbox" id="chkWhatsAppActivo" checked={cfg?.activo !== false} onChange={ev => setC({ activo: ev.target.checked })} /><span className="slider-round"></span></div>
                </label>
              </div>
              <div>
                <button type="button" className="btn" onClick={() => void probarConexion()} style={s('width:100%; padding:10px; border-radius:8px; font-size:12px; font-weight:700; background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;')}><i className="fas fa-plug"></i> Probar Conexión con Servidor</button>
                <div style={s('margin-top:8px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:7px 9px; font-size:11px; color:#1e40af; line-height:1.35;')}>
                  <i className="fas fa-info-circle"></i> <strong>Servicio de envío:</strong> el estado corresponde al último reporte del servicio del servidor que se conecta con OpenWA.
                </div>
              </div>
            </div>

            <div style={s('background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; gap:16px;')}>
              <div>
                <h5 style={s('margin:0 0 12px 0; font-size:14.5px; font-weight:750; color:#1e293b; display:flex; align-items:center; gap:8px;')}><i className="fas fa-paper-plane" style={s('color:#ea580c;')}></i> Prueba Rápida de Envío Directo</h5>
                <p style={s('color:#64748b; font-size:12px; margin:0 0 14px 0; line-height:1.4;')}>Comprueba que la línea y la plantilla funcionen enviando un mensaje directo a cualquier número de WhatsApp.</p>
                <div className="form-group" style={s('margin-bottom:12px;')}>
                  <label className="form-label" style={lbl}>Número de WhatsApp Destino *</label>
                  <input type="text" id="txtWhatsAppNumeroPrueba" className="form-input" value={numPrueba} onChange={ev => setNumPrueba(ev.target.value)} placeholder="Ej: 0984660105 o 593984660105" style={s('font-size:13px; font-weight:600;')} />
                  <small style={s('color:#64748b; font-size:11px; margin-top:3px; display:block;')}>Se normaliza automáticamente con código de país Ecuador (+593).</small>
                </div>
                <div className="form-group" style={s('margin-bottom:10px;')}>
                  <label className="form-label" style={lbl}>Tipo de Mensaje de Prueba</label>
                  <select id="selTipoMensajePrueba" className="form-select" value={tipoPrueba} onChange={ev => cargarPrueba(ev.target.value)} style={s('font-size:12px; font-weight:600; padding:7px 10px; border-radius:8px; border:1px solid #cbd5e1; width:100%; background:white;')}>
                    <option value="ENTRADA_FALTANTE">🔔 Recordatorio: Marcación de Entrada Pendiente</option>
                    <option value="AUSENCIA_LABORAL">📋 Notificación: Ausencia Injustificada</option>
                    <option value="SALIDA_FALTANTE">🚪 Recordatorio: Marcación de Salida Pendiente</option>
                    <option value="ALERTA_EMERGENCIA">🚨 Comunicado / Alerta de Emergencia</option>
                    <option value="PING_RAPIDO">⚡ Ping Rápido de Verificación</option>
                    <option value="PLANTILLA_ACTIVA">📝 Plantilla Activa del Panel</option>
                    <option value="PERSONALIZADO">✏️ Mensaje Personalizado Libre</option>
                  </select>
                </div>
                <div style={s('display:flex; gap:5px; flex-wrap:wrap; margin-bottom:12px;')}>
                  {[['ENTRADA_FALTANTE', '🔔 Entrada', '#f0fdf4', '#15803d', '#bbf7d0'], ['AUSENCIA_LABORAL', '📋 Ausencia', '#fef2f2', '#b91c1c', '#fecaca'],
                    ['SALIDA_FALTANTE', '🚪 Salida', '#eff6ff', '#1d4ed8', '#bfdbfe'], ['ALERTA_EMERGENCIA', '🚨 Emergencia', '#fff7ed', '#c2410c', '#fed7aa'],
                    ['PING_RAPIDO', '⚡ Ping', '#f5f3ff', '#6d28d9', '#ddd6fe']].map(([t, txt, bg, c, b]) => (
                    <button key={t} type="button" onClick={() => cargarPrueba(t)} style={s(`font-size:11px; font-weight:700; background:${bg}; color:${c}; border:1px solid ${b}; border-radius:6px; padding:3px 8px; cursor:pointer;`)}>{txt}</button>
                  ))}
                </div>
                {imgPrueba && (
                  <div id="waPruebaImgPreviewContainer" style={s('margin-bottom:10px; padding:10px 14px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; text-align:center;')}>
                    <div style={s('margin-bottom:6px; font-size:11.5px; color:#15803d; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px;')}><i className="fas fa-image"></i> Imagen de la plantilla lista para enviar:</div>
                    <img id="waPruebaImgPreviewEl" src={imgPrueba} style={s('max-height:130px; max-width:100%; border-radius:8px; object-fit:cover; border:1px solid #86efac; display:inline-block; box-shadow:0 2px 5px rgba(0,0,0,0.06);')} alt="Imagen de prueba" />
                  </div>
                )}
                <div className="form-group" style={s('margin-bottom:12px;')}>
                  <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;')}>
                    <label className="form-label" style={s('font-size:11.5px; font-weight:700; margin:0;')}>Contenido del Mensaje *</label>
                    <button type="button" onClick={() => cargarPrueba(tipoPrueba)} style={s('background:none; border:none; color:var(--blue); font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; padding:0;')}><i className="fas fa-sync-alt"></i> Restablecer</button>
                  </div>
                  <textarea id="txtWhatsAppMensajePrueba" className="form-input" rows={4} value={msgPrueba} onChange={ev => setMsgPrueba(ev.target.value)} style={s('font-size:12px; font-family:inherit; line-height:1.45; resize:vertical; background:#ffffff;')} placeholder="Escribe el mensaje de prueba o selecciona una plantilla arriba..."></textarea>
                  <small style={s('color:#64748b; font-size:10.5px; margin-top:3px; display:block;')}>Puedes editar libremente el texto antes de enviar la prueba.</small>
                </div>
                <div style={s('background:#fff7ed; border:1px solid #fed7aa; border-radius:10px; padding:8px 12px; font-size:11.5px; color:#9a3412; line-height:1.4;')}>
                  <i className="fas fa-shield-alt"></i> Todas las pruebas quedan registradas automáticamente en la auditoría de envíos con el tipo <code>PRUEBA_…</code>.
                </div>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void enviarPrueba()} style={s('width:100%; padding:11px; border-radius:8px; font-size:12.5px; font-weight:700; background:#ea580c; border:none; color:white; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 2px 6px rgba(234,88,12,0.25);')}><i className="fas fa-paper-plane"></i> Enviar Mensaje de Prueba</button>
            </div>
          </div>
        </div>
      )}

      {sub === 'automatico' && cfg && (
        <div id="waSecAutomatico" className="wa-subtab-content" style={s('display:block;')}>
          <div style={s('background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:24px; max-width:820px; margin:0 auto; box-shadow:0 1px 3px rgba(0,0,0,0.02);')}>
            <div style={s('margin-bottom:18px;')}>
              <h5 style={s('margin:0 0 4px 0; font-size:16px; font-weight:800; color:#1e293b; display:flex; align-items:center; gap:8px;')}><i className="fas fa-robot" style={s('color:#8b5cf6;')}></i> Automatización Diaria de Recordatorios (No Registro)</h5>
              <p style={s('color:#64748b; font-size:12.5px; margin:0;')}>El sistema monitorea la asistencia y despacha recordatorios amigables por WhatsApp a los colaboradores que no han registrado su entrada a la hora estipulada.</p>
            </div>
            <label htmlFor="chkWhatsAppAutoNoRegistro" style={s('display:flex; align-items:center; justify-content:space-between; background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:12px 14px; margin-bottom:16px; cursor:pointer; user-select:none;')}>
              <div>
                <strong style={s('font-size:13px; color:#1e293b; display:block;')}>Activar Recordatorio Automático Diario</strong>
                <span style={s('font-size:11.5px; color:#64748b;')}>Notifica automáticamente a los colaboradores sin marcación en días hábiles</span>
              </div>
              <div className="switch"><input type="checkbox" id="chkWhatsAppAutoNoRegistro" checked={cfg.autoEnvioNoRegistro} onChange={ev => setC({ autoEnvioNoRegistro: ev.target.checked })} /><span className="slider-round"></span></div>
            </label>
            <div style={s('display:grid; grid-template-columns:1fr 1.5fr; gap:14px; margin-bottom:16px;')}>
              <div className="form-group" style={s('margin:0;')}>
                <label className="form-label" style={lbl}>Hora Límite de Corte *</label>
                <input type="time" id="txtWhatsAppHoraCorte" className="form-input" value={cfg.horaCorteNoRegistro} onChange={ev => setC({ horaCorteNoRegistro: ev.target.value })} style={s('font-size:13px; font-weight:700; text-align:center;')} />
                <small style={s('color:#64748b; font-size:11px; margin-top:3px; display:block;')}>Hora a partir de la cual se evalúa la inasistencia matutina.</small>
              </div>
              <div className="form-group" style={s('margin:0;')}>
                <label className="form-label" style={lbl}>Enlace a la App de Asistencia *</label>
                <input type="text" id="txtWhatsAppEnlaceApp" className="form-input" value={cfg.enlaceApp} onChange={ev => setC({ enlaceApp: ev.target.value })} style={s('font-size:12px;')} />
                <small style={s('color:#64748b; font-size:11px; margin-top:3px; display:block;')}>Reemplaza la etiqueta <code>{'{link}'}</code> en el mensaje.</small>
              </div>
            </div>
            <div style={s('margin-bottom:18px;')}>
              <label className="form-label" style={s('font-size:11.5px; font-weight:700; margin-bottom:8px; display:block;')}>Días Hábiles de Aplicación</label>
              <div style={s('display:flex; flex-wrap:wrap; gap:8px;')} id="diasWhatsAppContainer">
                {DIAS.map(([v, n, t]) => (
                  <label key={v} style={s('font-size:12px; background:white; border:1px solid #cbd5e1; padding:6px 12px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-weight:600;')}>
                    <input type="checkbox" name="chkDiaWhatsApp" value={v} checked={cfg.diasEnvio.includes(n)}
                      onChange={ev => setC({ diasEnvio: ev.target.checked ? [...cfg.diasEnvio, n].sort() : cfg.diasEnvio.filter(x => x !== n) })} /> {t}
                  </label>
                ))}
              </div>
            </div>
            <div style={s('font-size:11.5px; color:#64748b; background:#f1f5f9; padding:12px 14px; border-radius:10px; line-height:1.45; border:1px solid #e2e8f0;')}>
              <div style={s('display:flex; align-items:flex-start; gap:8px;')}>
                <i className="fas fa-info-circle" style={s('color:#0284c7; margin-top:2px; font-size:13px;')}></i>
                <span><em>Funcionamiento:</em> La alerta automática la ejecuta el servidor 1 vez al día tras superar la hora de corte, sin depender de que un supervisor tenga el panel abierto.</span>
              </div>
              <button type="button" className="btn" onClick={() => abrirNotificarWA('sin_marcar')} style={s('margin-top:12px; width:100%; font-size:12px; font-weight:700; padding:9px 14px; display:inline-flex; align-items:center; justify-content:center; gap:8px; background:#ffffff; color:#0369a1; border:1px solid #bae6fd; border-radius:8px; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.03);')}><i className="fas fa-play" style={s('color:#0284c7;')}></i> Probar / Disparar Alerta Automática Ahora</button>
            </div>
          </div>
        </div>
      )}

      {sub === 'plantillas' && (
        <div id="waSecPlantillas" className="wa-subtab-content" style={s('display:block;')}>
          <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;')}>
            <div style={s('display:flex; gap:8px; flex-wrap:wrap; align-items:center;')} id="tabsPlantillasWhatsApp">
              {TABS_BASE.map(b => <button key={b.tipo} type="button" className="btn" id={b.id} onClick={() => setTipoActivo(b.tipo)} style={pillPlantilla(tipoActivo === b.tipo)}>{b.texto}</button>)}
              <div style={s('width:1px; height:24px; background:#e2e8f0; margin:0 4px;')}></div>
              <div id="contenedorTabsPersonalizadas" style={s('display:flex; gap:8px; flex-wrap:wrap; align-items:center;')}>
                {personalizadas.map(([k, v]) => <button key={k} type="button" className="btn" onClick={() => setTipoActivo(k)} style={pillPlantilla(tipoActivo === k)}><i className="fas fa-file-alt"></i> {v.nombre || 'Personalizada'}</button>)}
              </div>
              <button type="button" className="btn" onClick={() => setNuevaPlantilla(true)} style={s('padding:7px 14px; border-radius:8px; font-size:12px; font-weight:700; border:1px dashed #3b82f6; background:#eff6ff; color:#2563eb; cursor:pointer; display:inline-flex; align-items:center; gap:6px;')}><i className="fas fa-plus"></i> Añadir Plantilla</button>
            </div>
            <div style={s('display:flex; align-items:center; gap:8px;')}>
              <span id="lblTituloPlantillaActiva" style={s('font-size:12px; font-weight:700; color:#0f172a;')}>{TITULOS_PLANTILLA[tipoActivo] || plantillas[tipoActivo]?.nombre || 'Plantilla Personalizada'}</span>
              {tipoActivo.startsWith('custom_') && <button type="button" id="btnEliminarPlantillaActual" onClick={() => void eliminarPlantilla()} className="btn" style={s('padding:4px 8px; font-size:11px; border-radius:6px; background:#fef2f2; color:#ef4444; border:1px solid #fecaca; cursor:pointer;')} title="Eliminar Plantilla Personalizada"><i className="fas fa-trash-alt"></i></button>}
            </div>
          </div>
          <div style={s('display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:20px;')}>
            <div>
              <div style={s('margin-bottom:10px; font-size:12px; font-weight:700; color:#475569;')}>Variables disponibles para insertar:</div>
              <div style={s('display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;')}>
                {[['{nombre}', '#e0f2fe', '#0369a1', '#bae6fd'], ['{fecha}', '#fef3c7', '#b45309', '#fde68a'], ['{hora}', '#f3e8ff', '#7e22ce', '#e9d5ff'],
                  ['{link}', '#dcfce7', '#15803d', '#bbf7d0'], ['{area}', '#f1f5f9', '#475569', '#cbd5e1'], ['{cargo}', '#f1f5f9', '#475569', '#cbd5e1']].map(([v, bg, c, b]) => (
                  <button key={v} type="button" onClick={() => insertarVariable(v)} className="btn" style={s(`padding:4px 9px; font-size:11px; font-weight:700; border-radius:6px; background:${bg}; color:${c}; border:1px solid ${b}; cursor:pointer;`)}>+ {v}</button>
                ))}
              </div>
              <div className="form-group" style={s('margin-bottom:14px;')}>
                <textarea id="txtWhatsAppPlantilla" ref={refTxt} className="form-input" rows={9} value={textoActivo} onChange={ev => setTextos(t => ({ ...t, [tipoActivo]: ev.target.value }))} style={s('font-size:12.5px; line-height:1.5; font-family:inherit; resize:vertical; padding:12px;')} placeholder="Escribe aquí el contenido del mensaje..."></textarea>
                <small style={s('color:#64748b; font-size:11px; margin-top:4px; display:block;')}>Formato WhatsApp: <code>*negrita*</code>, <code>_cursiva_</code>, <code>~tachado~</code>.</small>
              </div>
              <div style={s('background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:12px;')}>
                <label className="form-label" style={s('font-size:11.5px; font-weight:700; margin-bottom:6px; display:flex; justify-content:space-between;')}>
                  <span><i className="fas fa-image" style={s('color:#0284c7;')}></i> Adjuntar Imagen a la Plantilla (Opcional)</span>
                  {imagenActiva && <button type="button" id="btnRemoverImagenWA" onClick={() => void quitarImagen()} style={s('background:none; border:none; color:#ef4444; font-size:11px; cursor:pointer; display:inline-flex;')}><i className="fas fa-times-circle"></i> Quitar Imagen</button>}
                </label>
                <input key={tipoActivo + String(!!imagenActiva)} type="file" id="waImageUpload" accept="image/*" className="form-input" style={s('font-size:11px; padding:6px;')} onChange={ev => void subirImagen(ev.target.files?.[0])} />
                <small style={s('color:#64748b; font-size:10.5px; margin-top:4px; display:block;')}>Soporta formatos JPG, PNG o WebP. Se enviará adjunta con el mensaje.</small>
              </div>
            </div>
            <div>
              <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;')}>
                <span style={s('font-size:12px; font-weight:700; color:#475569;')}>Vista Previa en Vivo (Simulador):</span>
                <span style={s('font-size:10.5px; color:#16a34a; font-weight:700; background:#dcfce7; padding:2px 8px; border-radius:6px;')}><i className="fas fa-eye"></i> Simulación Tiempo Real</span>
              </div>
              <div style={s('background:#0b141a; border-radius:18px; padding:12px; border:2px solid #1f2c34; max-width:380px; margin:0 auto; box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);')}>
                <div style={s('display:flex; align-items:center; gap:10px; padding-bottom:10px; border-bottom:1px solid #1f2c34; margin-bottom:12px;')}>
                  <div style={s('width:34px; height:34px; border-radius:50%; background:#22c55e; color:white; display:flex; align-items:center; justify-content:center; font-size:16px;')}><i className="fab fa-whatsapp"></i></div>
                  <div><div style={s('color:#e9edef; font-size:12.5px; font-weight:700;')}>Tcontrol Asistencia</div><div style={s('color:#8696a0; font-size:10px;')}>en línea</div></div>
                </div>
                <div style={s('background:#005c4b; color:#e9edef; border-radius:10px 10px 0 10px; padding:10px 12px; font-size:12px; line-height:1.45; word-break:break-word; max-width:92%; margin-left:auto; box-shadow:0 1px 2px rgba(0,0,0,0.2);')}>
                  {imagenActiva && <div id="waPreviewImageContainer" style={s('margin-bottom:8px; border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.1);')}><img id="waPreviewImageEl" src={imagenActiva} alt="Imagen adjunta" style={s('width:100%; max-height:180px; object-fit:cover; display:block;')} /></div>}
                  <div id="previewWhatsAppBody" style={s('white-space:pre-wrap; font-family:system-ui, -apple-system, sans-serif;')} dangerouslySetInnerHTML={{ __html: previewHtml }}></div>
                  <div style={s('text-align:right; font-size:10px; color:#6b7280; margin-top:6px; display:flex; justify-content:flex-end; align-items:center; gap:3px;')}><span id="previewWhatsAppHora">{hora}</span> <i className="fas fa-check-double" style={s('color:#38bdf8;')}></i></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {sub === 'logs' && <LogsWhatsApp />}
      {nuevaPlantilla && <ModalNuevaPlantilla onCerrar={() => setNuevaPlantilla(false)} onCreada={k => { setNuevaPlantilla(false); setTipoActivo(k); }} />}
    </div>
  );
}

function LogsWhatsApp() {
  const [logs, setLogs] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const cargar = async () => {
    setLogs(null); setError('');
    try { setLogs(await rpc<any[]>('sup_whatsapp_logs', { p_limite: 100 })); } catch (e) { setError(errorTexto(e)); }
  };
  useEffect(() => { void cargar(); }, []);
  const t = q.toLowerCase().trim();
  const lista = !logs ? [] : !t ? logs : logs.filter(l => (l.nombreEmpleado || '').toLowerCase().includes(t) || (l.telefono || '').includes(t)
    || (l.tipoNotificacion || '').toLowerCase().includes(t) || (l.estado || '').toLowerCase().includes(t));
  const td = 'padding: 8px 12px; font-size:11.5px;';
  return (
    <div id="waSecLogs" className="wa-subtab-content" style={s('display:block;')}>
      <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;')}>
        <div>
          <h5 style={s('margin:0; font-size:14.5px; font-weight:800; color:#1e293b; display:flex; align-items:center; gap:8px;')}><i className="fas fa-file-invoice" style={s('color:#059669;')}></i> Registro de Auditoría de Envíos WhatsApp</h5>
          <p style={s('color:#64748b; margin:2px 0 0; font-size:12px;')}>Auditoría histórica de mensajes enviados, estado de entrega, errores y destinatarios.</p>
        </div>
        <div style={s('display:flex; align-items:center; gap:8px;')}>
          <input type="text" id="txtBuscarLogWhatsApp" value={q} onChange={ev => setQ(ev.target.value)} placeholder="🔍 Buscar en logs..." style={s('padding:7px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:12px; outline:none; min-width:200px;')} />
          <button type="button" onClick={() => void cargar()} className="btn btn-outline" style={s('padding:7px 14px; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:6px; background:#ffffff;')}><i className="fas fa-sync-alt"></i> Actualizar Logs</button>
        </div>
      </div>
      <div style={s('overflow: auto; max-height: 480px; border: 1px solid #e2e8f0; border-radius: 12px; background:#ffffff; box-shadow:0 1px 3px rgba(0,0,0,0.02);')}>
        <table style={s('width: 100%; border-collapse: collapse; min-width: 820px; font-size: 12px; text-align: left;')}>
          <thead style={s('position: sticky; top: 0; z-index: 10; background: #f8fafc; color: #475569; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: uppercase;')}>
            <tr>
              <th style={s('padding: 10px 10px; font-weight: 700; width: 40px; text-align: center;')}>#</th>
              <th style={s('padding: 10px 10px; font-weight: 700; text-align: center; width: 130px;')}>Fecha y Hora</th>
              <th style={s('padding: 10px 10px; font-weight: 700;')}>Colaborador</th>
              <th style={s('padding: 10px 10px; font-weight: 700;')}>Teléfono</th>
              <th style={s('padding: 10px 10px; font-weight: 700; text-align: center;')}>Tipo</th>
              <th style={s('padding: 10px 10px; font-weight: 700; text-align: center;')}>Estado</th>
              <th style={s('padding: 10px 10px; font-weight: 700;')}>Mensaje / Detalle</th>
              <th style={s('padding: 10px 10px; font-weight: 700; text-align: center;')}>Supervisor</th>
            </tr>
          </thead>
          <tbody id="tbodyLogsWhatsApp">
            {error ? <tr><td colSpan={8} style={s('padding: 24px; text-align: center; color: var(--red);')}>Error cargando logs: {error}</td></tr>
              : !logs ? <tr><td colSpan={8} style={s('padding: 24px; text-align: center; color: var(--g500);')}><i className="fas fa-spinner fa-spin"></i> Cargando auditoría de envíos...</td></tr>
              : !lista.length ? <tr><td colSpan={8} style={s('padding: 24px; text-align: center; color: var(--g500);')}>No se registran envíos de WhatsApp.</td></tr>
              : lista.map((l, i) => {
                const ok = l.estado === 'ENVIADO', cola = l.estado === 'EN_COLA', sim = l.estado === 'SIMULADO';
                return (
                  <tr key={i} style={s('border-bottom: 1px solid #f1f5f9;')}>
                    <td style={s(td + ' text-align:center; color:#94a3b8;')}>{i + 1}</td>
                    <td style={s(td + ' color:#64748b; text-align:center;')}>{l.fecha || '--'} {l.hora || ''}</td>
                    <td style={s('padding: 8px 12px; font-weight:600; font-size:12px;')}>{l.nombreEmpleado || '--'}</td>
                    <td style={s('padding: 8px 12px; font-family:monospace; font-size:11.5px;')}>{l.telefono || '--'}</td>
                    <td style={s(td + ' text-align:center;')}><span className="badge" style={s('background:#e0f2fe; color:#0369a1; font-size:10px;')}>{l.tipoNotificacion || 'General'}</span></td>
                    <td style={s('padding: 8px 12px; text-align:center;')}>
                      <span className="badge" style={s(`background:${ok ? '#dcfce7' : cola ? '#fef3c7' : sim ? '#e2e8f0' : '#fee2e2'}; color:${ok ? '#15803d' : cola ? '#92400e' : sim ? '#475569' : '#b91c1c'}; font-weight:700; font-size:10.5px;`)}>
                        {ok ? <><i className="fas fa-check"></i> ENVIADO</> : cola ? <><i className="fas fa-clock"></i> EN COLA</> : sim ? <><i className="fas fa-flask"></i> SIMULADO</> : <><i className="fas fa-times"></i> {l.estado || 'ERROR'}</>}
                      </span>
                    </td>
                    <td style={s('padding: 8px 12px; font-size:11px; color:#475569; max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')} title={l.detalleRespuesta || ''}>{l.detalleRespuesta || '--'}</td>
                    <td style={s('padding: 8px 12px; font-size:11px; color:#64748b; text-align:center;')}>{l.supervisor || l.origen || '--'}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModalNuevaPlantilla({ onCerrar, onCreada }: { onCerrar: () => void; onCreada: (clave: string) => void }) {
  const [nombre, setNombre] = useState('');
  const [archivo, setArchivo] = useState<File | undefined>();
  const crear = async () => {
    const nom = nombre.trim();
    if (!nom) { mostrarToast('Ingresa un nombre para la nueva plantilla', 'error'); return; }
    const clave = 'custom_' + Date.now();
    try {
      const img = archivo && esImagen(archivo) ? await leerImagen(archivo) : null;
      await rpc('sup_guardar_plantilla_wa', { p_clave: clave, p_nombre: nom, p_texto: 'Hola *{nombre}*,\n\nTe compartimos este comunicado importante de Tcontrol.\n\n📱 *App:* {link}', p_imagen: img });
      await cargarWA();
      mostrarToast('Plantilla creada exitosamente', 'success');
      onCreada(clave);
    } catch (e) { mostrarToast(errorTexto(e), 'error'); }
  };
  return (
    <div id="modalNuevaPlantillaWhatsApp" className="modal-overlay" onClick={ev => { if (ev.target === ev.currentTarget) onCerrar(); }}>
      <div className="modal-content" style={s('max-width:380px; padding:20px; border-radius:14px; background:white; box-shadow:0 10px 25px rgba(0,0,0,0.2);')}>
        <h3 style={s('margin:0 0 14px 0; font-size:15px; font-weight:800; color:#1e293b;')}><i className="fas fa-plus-circle" style={s('color:#2563eb;')}></i> Nueva Plantilla de Mensaje</h3>
        <div className="form-group" style={s('margin-bottom:14px;')}>
          <label className="form-label">Nombre de la Plantilla (Ej: Bono Navidad)</label>
          <input type="text" id="txtNuevaPlantillaNombre" className="form-input" value={nombre} onChange={ev => setNombre(ev.target.value)} placeholder="Nombre corto..." style={s('font-size:12.5px;')} />
        </div>
        <div className="form-group" style={s('margin-bottom:14px;')}>
          <label className="form-label">Imagen / Multimedia (Opcional)</label>
          <input type="file" id="fileNuevaPlantillaImg" className="form-input" accept="image/*" onChange={ev => setArchivo(ev.target.files?.[0])} style={s('font-size:12px;')} />
        </div>
        <div style={s('display:flex; justify-content:flex-end; gap:8px;')}>
          <button type="button" className="btn" onClick={onCerrar} style={s('padding:8px 14px; border-radius:8px; font-size:12px; background:#f1f5f9; color:#475569; font-weight:600; cursor:pointer; border:none;')}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => void crear()} style={s('padding:8px 14px; border-radius:8px; font-size:12px; font-weight:700; background:#2563eb; color:white; border:none; cursor:pointer;')}>Crear Plantilla</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modales de envío ───
export function abrirNotificarWA(categoria: CategoriaWA = 'sin_marcar') { abrirModal('waSinMarcar', { categoria }); }

export function ModalesWhatsApp() {
  const masivo = useModal<{ categoria?: CategoriaWA }>('waSinMarcar');
  const ind = useModal<{ id: string; mensaje?: string }>('waIndividual');
  return (
    <>
      {masivo && <ModalEnvioMasivo inicial={masivo.categoria || 'sin_marcar'} />}
      {ind && <ModalIndividual id={ind.id} mensajeInicial={ind.mensaje} />}
    </>
  );
}

const CATEGORIAS: { cat: CategoriaWA; id: string; texto: string; conteo: boolean }[] = [
  { cat: 'sin_marcar', id: 'btnModalCatSinMarcar', texto: '🔔 Sin Marcar', conteo: true }, { cat: 'vacaciones', id: 'btnModalCatVacaciones', texto: '🏖️ Vacaciones', conteo: true },
  { cat: 'permisos', id: 'btnModalCatPermisos', texto: '📝 Permisos', conteo: true }, { cat: 'ausente', id: 'btnModalCatAusentes', texto: '📋 Todos Ausentes', conteo: true },
  { cat: 'salida_faltante', id: 'btnModalCatSalida', texto: '🚪 Salida Faltante', conteo: true }, { cat: 'emergencia', id: 'btnModalCatEmergencia', texto: '🚨 General', conteo: false },
];

function ModalEnvioMasivo({ inicial }: { inicial: CategoriaWA }) {
  const empCache = useSup(x => x.empCache);
  const wa = useWA();
  const [cat, setCat] = useState<CategoriaWA>(inicial);
  const listas = useMemo(() => clasificarDestinatarios(empCache), [empCache]);
  const dest = listas[cat];
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [progreso, setProgreso] = useState<{ pct: number; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { setSel(new Set(dest.filter(e => e.telefono || e.celular).map(e => String(e.id)))); }, [cat, dest]);
  const cerrar = () => cerrarModal('waSinMarcar');
  const clave = resolverTipoPlantilla(cat);
  const plantillas = wa?.plantillas || {};
  const muestra = formatearMensaje(plantillas, wa?.config || null, clave, null, { nombre: 'Colaborador', area: 'Operaciones', cargo: 'Personal' });
  const img = plantillas[clave]?.imagen;
  const conTel = dest.filter(e => !!(e.telefono || e.celular)).length;

  const enviar = async () => {
    const lista = dest.filter(e => sel.has(String(e.id)));
    if (!lista.length) { mostrarToast('Selecciona al menos un colaborador con número de teléfono', 'error'); return; }
    setEnviando(true);
    setProgreso({ pct: 0, texto: 'Enviando notificaciones...' });
    try {
      const mensajes = lista.map(e => ({ empleadoId: e.id, nombre: e.nombre, telefono: e.telefono || e.celular,
        mensaje: formatearMensaje(plantillas, wa?.config || null, clave, e), plantilla: plantillas[clave]?.imagen ? clave : null }));
      const r = await encolar(mensajes, clave);
      setProgreso({ pct: 100, texto: `Envío finalizado: ${r.encolados} en cola de envío, ${r.sinTelefono} fallidos` });
      mostrarToast(`Despacho WhatsApp completado: ${r.encolados} notificaciones puestas en cola de envío`, 'success');
      window.setTimeout(cerrar, 1800);
    } catch (e) {
      mostrarToast('Error durante el envío masivo: ' + errorTexto(e), 'error');
      setEnviando(false);
    }
  };

  return (
    <div id="modalNotificarSinMarcarWhatsApp" className="modal-overlay" onClick={ev => { if (ev.target === ev.currentTarget) cerrar(); }}>
      <div className="modal-card" style={s('max-width: 660px; border-radius:16px; overflow:hidden;')}>
        <div className="modal-header" style={s('background:linear-gradient(135deg, #16a34a 0%, #15803d 100%); color:white; padding:16px 20px;')}>
          <div style={s('display:flex; align-items:center; gap:10px;')}>
            <i className="fab fa-whatsapp" style={s('font-size:22px;')}></i>
            <div>
              <h3 style={s('margin:0; font-size:16px; font-weight:800; color:white;')} id="lblTituloModalWhatsApp">{TITULOS_CATEGORIA[cat]}</h3>
              <p style={s('margin:2px 0 0 0; font-size:12px; color:#bbf7d0;')} id="lblSubtituloModalWhatsApp">{SUBTITULOS_CATEGORIA[cat]}</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={cerrar} style={s('color:white; opacity:0.85;')}>&times;</button>
        </div>
        <div style={s('background:#f1f5f9; padding:8px 16px; border-bottom:1px solid #e2e8f0; display:flex; gap:6px; overflow-x:auto;')}>
          {CATEGORIAS.map(c => {
            const act = c.cat === cat;
            return (
              <button key={c.cat} type="button" id={c.id} onClick={() => { setCat(c.cat); setProgreso(null); setEnviando(false); }} className="btn"
                style={s(`padding:6px 12px; border-radius:6px; font-size:11.5px; font-weight:${act ? '700' : '600'}; border:1px solid ${act ? '#bbf7d0' : '#cbd5e1'}; background:${act ? '#f0fdf4' : '#ffffff'}; color:${act ? '#15803d' : '#475569'}; cursor:pointer; white-space:nowrap;`)}>
                {c.texto}{c.conteo && <> (<span>{listas[c.cat].length}</span>)</>}
              </button>
            );
          })}
        </div>
        <div className="modal-body" style={s('padding:18px 20px; background:#f8fafc; max-height:72vh; overflow-y:auto;')}>
          <div id="alertaInformativaModalWhatsApp" style={s('background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:10px 14px; margin-bottom:12px; display:flex; align-items:center; gap:10px;')}>
            <i className="fas fa-info-circle" style={s('color:#16a34a; font-size:16px;')}></i>
            <div style={s('font-size:12px; color:#166534; line-height:1.4;')} id="lblTextoAlertaModalWhatsApp">Selecciona a los colaboradores a quienes deseas enviar la notificación. Los números son normalizados automáticamente.</div>
          </div>
          <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;')}>
            <label style={s('font-size:12.5px; font-weight:700; color:#1e293b; display:inline-flex; align-items:center; gap:6px; cursor:pointer; margin:0;')}>
              <input type="checkbox" id="chkWhatsAppSeleccionarTodos" checked={conTel > 0 && sel.size === conTel}
                onChange={ev => setSel(ev.target.checked ? new Set(dest.filter(e => e.telefono || e.celular).map(e => String(e.id))) : new Set())} style={s('accent-color:#16a34a; width:16px; height:16px;')} />
              <span>Seleccionar Todos (<strong id="lblTotalSinMarcarModal">{dest.length}</strong>)</span>
            </label>
            <span style={s('font-size:11.5px; color:#64748b;')} id="lblInfoConTelefono">{conTel} con teléfono registrado</span>
          </div>
          <div id="listaColaboradoresSinMarcarWhatsApp" style={s('display:flex; flex-direction:column; gap:8px; max-height:240px; overflow-y:auto; padding-right:4px; margin-bottom:14px;')}>
            {!dest.length ? (
              <div style={s('text-align:center; padding:20px; color:#64748b; background:#f8fafc; border-radius:8px; font-size:12.5px;')}><i className="fas fa-check-circle" style={s('color:#16a34a; font-size:20px; margin-bottom:6px; display:block;')}></i>No hay colaboradores pendientes en esta categoría.</div>
            ) : dest.map(e => {
              const tel = e.telefono || e.celular || '';
              const badge = e._razonAusencia ? <span style={s('font-size:10px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:1px 6px; border-radius:4px; margin-left:6px;')}><i className="fas fa-file-medical"></i> {e._razonAusencia}</span>
                : e._esVacaciones ? <span style={s('font-size:10px; background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; padding:1px 6px; border-radius:4px; margin-left:6px;')}>🏖️ Vacaciones</span>
                : e._esPermiso ? <span style={s('font-size:10px; background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:1px 6px; border-radius:4px; margin-left:6px;')}>📝 Permiso</span>
                : !e.entradaHoy && cat === 'ausente' ? <span style={s('font-size:10px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:1px 6px; border-radius:4px; margin-left:6px;')}>⚠️ Sin justificar</span> : null;
              return (
                <label key={e.id} style={s('display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; margin:0;')}>
                  <div style={s('display:flex; align-items:center; gap:10px;')}>
                    <input type="checkbox" className="chk-wa-emp" value={e.id} disabled={!tel} checked={sel.has(String(e.id))}
                      onChange={ev => setSel(prev => { const n = new Set(prev); if (ev.target.checked) n.add(String(e.id)); else n.delete(String(e.id)); return n; })} style={s('accent-color:#16a34a; width:16px; height:16px;')} />
                    <div>
                      <div style={s('display:flex; align-items:center;')}><strong style={s('font-size:12.5px; color:#1e293b;')}>{e.nombre}</strong>{badge}</div>
                      <span style={s('font-size:11px; color:#64748b;')}>{e.area || 'Sin área'} • {e.cargo || 'Colaborador'}</span>
                    </div>
                  </div>
                  <div>
                    {tel ? <span style={s('font-family:monospace; font-size:11.5px; color:#15803d; background:#dcfce7; padding:2px 8px; border-radius:6px; font-weight:600;')}><i className="fab fa-whatsapp"></i> {tel}</span>
                      : <span style={s('font-size:11px; color:#b91c1c; background:#fee2e2; padding:2px 8px; border-radius:6px; font-weight:700;')}><i className="fas fa-times-circle"></i> Sin Teléfono</span>}
                  </div>
                </label>
              );
            })}
          </div>
          {progreso && (
            <div id="progresoEnvioWhatsAppContainer" style={s('background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:14px;')}>
              <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;')}>
                <span style={s('font-size:12px; font-weight:700; color:#1e293b;')} id="lblProgresoWhatsAppTexto">{progreso.texto}</span>
                <span style={s('font-size:11.5px; font-weight:800; color:#16a34a;')} id="lblProgresoWhatsAppPorcentaje">{progreso.pct}%</span>
              </div>
              <div style={s('width:100%; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;')}><div id="barraProgresoWhatsAppFill" style={s(`width:${progreso.pct}%; height:100%; background:linear-gradient(90deg, #22c55e, #16a34a); transition:width 0.3s;`)}></div></div>
            </div>
          )}
          <details style={s('background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px;')} open>
            <summary style={s('font-size:12px; font-weight:700; color:#475569; cursor:pointer;')}><i className="fas fa-eye"></i> Ver plantilla del mensaje que se enviará</summary>
            <div id="previewMensajeModalWhatsApp" style={s('margin-top:10px; padding:10px; background:#f8fafc; border-radius:8px; font-size:12px; line-height:1.45; white-space:pre-wrap; color:#334155; border:1px dashed #cbd5e1;')}>
              {img && <div style={s('margin-bottom:10px; text-align:center;')}><img src={img} style={s('max-height:140px; max-width:100%; border-radius:8px; object-fit:cover; border:1px solid #cbd5e1; display:inline-block; box-shadow:0 2px 6px rgba(0,0,0,0.08);')} alt="Adjunto" /><div style={s('font-size:11px; color:#16a34a; font-weight:700; margin-top:4px;')}><i className="fas fa-image"></i> Imagen adjunta vinculada a esta plantilla</div></div>}
              <div style={s('white-space:pre-wrap;')}>{muestra}</div>
            </div>
          </details>
        </div>
        <div className="modal-footer" style={s('padding:14px 20px; background:#ffffff; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;')}>
          <button type="button" className="btn btn-secondary-modal" onClick={cerrar}>Cerrar</button>
          <button type="button" id="btnEjecutarEnvioWhatsApp" className="btn btn-primary-modal" disabled={sel.size === 0 || enviando} onClick={() => void enviar()}
            style={s(`background:#16a34a; border-color:#16a34a; font-weight:700; display:inline-flex; align-items:center; gap:8px; opacity:${enviando ? '0.6' : '1'};`)}>
            <i className="fab fa-whatsapp"></i> <span>Enviar Notificaciones (<strong id="lblCountSeleccionadosWhatsApp">{sel.size}</strong>)</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalIndividual({ id, mensajeInicial }: { id: string; mensajeInicial?: string }) {
  useSup(x => x.version);
  const emp = buscarEmpleado(id);
  const [msg, setMsg] = useState(() => {
    if (mensajeInicial) return mensajeInicial;
    const st = emp ? obtenerEstadoCumpleanos(obtenerFechaNacimientoEmpleado(emp)) : null;
    return mensajeIndividual(st?.esHoy ? 'cumple' : 'saludo', emp?.nombre || '');
  });
  const [nuevoTel, setNuevoTel] = useState(String(emp?.telefono || ''));
  const [enviando, setEnviando] = useState(false);
  const cerrar = () => cerrarModal('waIndividual');
  useEffect(() => { if (!emp) { mostrarToast('Colaborador no encontrado', 'error'); cerrar(); } }, [emp]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!emp) return null;
  const rawTel = String(emp.telefono || emp.celular || emp.whatsapp || '').trim();
  const numWa = normalizarNumero(rawTel);
  const tieneWa = numWa.length >= 9;

  const guardarTel = async () => {
    if (normalizarNumero(nuevoTel.trim()).length < 9) { mostrarToast('Por favor ingresa un número celular válido (ej: 0984660105)', 'error'); return; }
    mostrarLoader(true);
    try {
      const r = await rpc<{ telefono: string }>('sup_guardar_telefono', { p_empleado_id: emp.id, p_telefono: nuevoTel.trim() });
      emp.telefono = r.telefono;
      sup.tocar();
      mostrarToast('Número de WhatsApp guardado correctamente', 'success');
      void cargarDatosCompletos({ silencioso: true });
    } catch (e) { mostrarToast(errorTexto(e) || 'No se pudo guardar el número', 'error'); }
    finally { mostrarLoader(false); }
  };
  const validar = () => {
    if (!tieneWa) { mostrarToast('El colaborador no tiene un número celular válido. Ingrésalo arriba y haz clic en Guardar.', 'error'); return false; }
    if (!msg.trim()) { mostrarToast('Escribe o selecciona un mensaje para enviar', 'warning'); return false; }
    return true;
  };
  const abrirWaMe = () => {
    if (!validar()) return;
    window.open(`https://wa.me/${numWa}?text=${encodeURIComponent(msg.trim())}`, '_blank');
    void rpc('sup_log_wame', { p_empleado_id: emp.id, p_telefono: numWa, p_mensaje: msg.trim() }).catch(() => undefined);
    mostrarToast(`Abriendo chat de WhatsApp con ${emp.nombre}...`, 'success');
  };
  const enviarServidor = async () => {
    if (!validar()) return;
    setEnviando(true);
    mostrarToast('Enviando mensaje por servidor OpenWA...', 'info');
    try {
      await encolar([{ empleadoId: emp.id, nombre: emp.nombre, telefono: numWa, mensaje: msg.trim() }], 'INDIVIDUAL_OPENWA');
      mostrarToast(`Mensaje para ${emp.nombre} puesto en cola de envío`, 'success');
      window.setTimeout(cerrar, 1200);
    } catch (e) { mostrarToast('Error al comunicar con el servidor: ' + errorTexto(e), 'error'); }
    finally { setEnviando(false); }
  };
  const PLANT = [['entrada', '⏰ Entrada', '#f0fdf4', '#bbf7d0', '#166534'], ['salida', '🚪 Salida', '#f0f9ff', '#bae6fd', '#0369a1'], ['ausencia', '🩺 Ausencia', '#fff7ed', '#fed7aa', '#c2410c'],
    ['saludo', '👋 Saludo', '#f5f3ff', '#ddd6fe', '#6d28d9'], ['cumple', '🎂 Cumpleaños', '#fef3c7', '#fde68a', '#b45309'], ['regularizacion', '📋 Regularización', '#fff1f2', '#fecdd3', '#be123c'],
    ['limpiar', '✏️ Borrar', '#f8fafc', '#e2e8f0', '#64748b']];
  const dis = tieneWa ? '' : ' opacity:0.5; cursor:not-allowed;';
  return (
    <div id="modalWhatsAppIndividual" className="modal-overlay" style={s('z-index: 10000;')} onClick={ev => { if (ev.target === ev.currentTarget) cerrar(); }}>
      <div className="modal-card" style={s('max-width: 520px; border-radius:16px; overflow:hidden; box-shadow: 0 20px 30px rgba(0,0,0,0.18); background:#ffffff;')}>
        <div className="modal-header" style={s('background:linear-gradient(135deg, #16a34a 0%, #15803d 100%); color:white; padding:16px 20px; display:flex; justify-content:space-between; align-items:center;')}>
          <div style={s('display:flex; align-items:center; gap:10px;')}>
            <div style={s('width:38px; height:38px; border-radius:50%; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:20px;')}><i className="fab fa-whatsapp"></i></div>
            <div>
              <h3 style={s('margin:0; font-size:16px; font-weight:800; color:white;')}>Mensaje Directo de WhatsApp</h3>
              <p style={s('margin:2px 0 0 0; font-size:11.5px; color:#dcfce7;')} id="lblSubtituloWaIndividual">Comunicación directa e instantánea con el colaborador</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={cerrar} style={s('color:white; opacity:0.85; font-size:22px; cursor:pointer; background:transparent; border:none; line-height:1;')}>&times;</button>
        </div>
        <div className="modal-body" style={s('padding:18px 20px; background:#ffffff;')}>
          <div id="cardEmpleadoWaIndividual" style={s('display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:14px; gap:10px;')}>
            <div style={s('display:flex; align-items:center; gap:10px;')}>
              <div id="fotoWaIndividual" style={s('width:42px; height:42px; min-width:42px; border-radius:50%; overflow:hidden; background:#e0f2fe; display:flex; align-items:center; justify-content:center; font-weight:700; color:#0369a1; font-size:16px; border:2px solid #ffffff; box-shadow:0 1px 3px rgba(0,0,0,0.1);')}><PhotoCell e={emp} size="card" /></div>
              <div>
                <div id="nombreWaIndividual" style={s('font-size:14px; font-weight:800; color:#0f172a;')}>{emp.nombre || '--'}</div>
                <div style={s('font-size:11px; color:#64748b; margin-top:2px;')}><span id="areaWaIndividual" style={s('background:#f1f5f9; padding:1px 6px; border-radius:4px; font-weight:600;')}>{emp.area || 'Sin área'}</span> • <span id="cargoWaIndividual">{emp.cargo || 'Personal'}</span></div>
              </div>
            </div>
            <div id="badgeTelefonoWaIndividual" style={s('text-align:right;')}>
              {tieneWa ? <>
                <span style={s('background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:5px;')}><i className="fab fa-whatsapp" style={s('color:#16a34a; font-size:13px;')}></i> +{numWa}</span>
                <div style={s('font-size:10px; color:#64748b; margin-top:2px;')}>Tel: {rawTel}</div>
              </> : <span style={s('background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:4px;')}><i className="fas fa-exclamation-circle" style={s('color:#ef4444;')}></i> Sin WhatsApp</span>}
            </div>
          </div>
          {!tieneWa && (
            <div id="secRegistrarTelWaIndividual" style={s('background:#fff7ed; border:1px solid #fed7aa; border-radius:10px; padding:12px 14px; margin-bottom:14px;')}>
              <div style={s('font-size:12px; font-weight:700; color:#9a3412; margin-bottom:6px; display:flex; align-items:center; gap:6px;')}><i className="fas fa-exclamation-circle"></i> No tiene número de WhatsApp registrado</div>
              <div style={s('font-size:11px; color:#78350f; margin-bottom:8px;')}>Ingresa el número celular para vincularlo a este colaborador y habilitar el envío:</div>
              <div style={s('display:flex; gap:8px;')}>
                <input type="tel" id="txtNuevoTelefonoWaIndividual" value={nuevoTel} onChange={ev => setNuevoTel(ev.target.value)} placeholder="Ej: 0984660105" style={s('flex:1; padding:7px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:12px; font-weight:600; outline:none;')} />
                <button type="button" onClick={() => void guardarTel()} style={s('background:#16a34a; color:white; border:none; padding:7px 14px; border-radius:8px; font-size:11.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 1px 3px rgba(22,163,74,0.3);')}><i className="fas fa-save"></i> Guardar</button>
              </div>
            </div>
          )}
          <div style={s('margin-bottom:12px;')}>
            <div style={s('font-size:11px; font-weight:700; color:#475569; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;')}>
              <span><i className="fas fa-bolt" style={s('color:#eab308; margin-right:4px;')}></i> Plantillas de Mensaje:</span>
              <span style={s('font-size:10px; color:#94a3b8; font-weight:500;')}>Haz clic para auto-rellenar</span>
            </div>
            <div style={s('display:flex; flex-wrap:wrap; gap:6px;')}>
              {PLANT.map(([t, txt, bg, b, c]) => <button key={t} type="button" onClick={() => setMsg(mensajeIndividual(t, emp.nombre))} className="btn-plantilla-wa" style={s(`background:${bg}; border:1px solid ${b}; color:${c}; font-size:11px; font-weight:${t === 'limpiar' ? 600 : 700}; padding:4px 10px; border-radius:8px; cursor:pointer;`)}>{txt}</button>)}
            </div>
          </div>
          <div style={s('margin-bottom:16px;')}>
            <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;')}>
              <label style={s('font-size:11.5px; font-weight:700; color:#1e293b;')}>Mensaje para enviar:</label>
              <span id="lblLongitudMensajeWa" style={s('font-size:10.5px; color:#94a3b8;')}>{msg.length} caracteres</span>
            </div>
            <textarea id="txtMensajeWaIndividual" value={msg} onChange={ev => setMsg(ev.target.value)} rows={4} style={s('width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #cbd5e1; border-radius:10px; font-size:12.5px; font-family:inherit; line-height:1.45; resize:vertical; outline:none;')} placeholder="Escribe aquí el mensaje para el colaborador..."></textarea>
          </div>
          <div style={s('display:flex; flex-direction:column; gap:8px;')}>
            <button type="button" id="btnAbrirChatWaMe" disabled={!tieneWa} onClick={abrirWaMe} style={s('width:100%; padding:11px 16px; background:linear-gradient(135deg, #25d366 0%, #16a34a 100%); color:white; border:none; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 3px 8px rgba(37,211,102,0.3); transition:all 0.15s;' + dis)}>
              <i className="fab fa-whatsapp" style={s('font-size:17px;')}></i> Abrir Chat en WhatsApp (wa.me)
            </button>
            <button type="button" id="btnEnviarServidorOpenWa" disabled={!tieneWa || enviando} onClick={() => void enviarServidor()} style={s('width:100%; padding:9px 16px; background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.15s;' + dis)}>
              <i className="fas fa-paper-plane" style={s('color:#16a34a;')}></i> Despachar por Servidor OpenWA (Silencioso)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
