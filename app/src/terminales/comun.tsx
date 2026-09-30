// Utilidades compartidas por las terminales de Guardia y Kiosco (guardia_core.js)
import { useCallback, useEffect, useRef, useState } from 'react';

export type TipoToast = 'info' | 'success' | 'error';

// mostrarToast de guardia_core.js: un mensaje a la vez, 3 s
export function useToastGuardia() {
  const [toast, setToast] = useState<{ msg: string; tipo: TipoToast; k: number } | null>(null);
  const mostrar = useCallback((msg: string, tipo: TipoToast = 'info') => {
    const k = Date.now();
    setToast({ msg, tipo, k });
    window.setTimeout(() => setToast(t => (t?.k === k ? null : t)), 3000);
  }, []);
  const nodo = <div id="toastContainer" className="toast-container">{toast && <div className={`toast-msg ${toast.tipo}`}>{toast.msg}</div>}</div>;
  return { mostrar, nodo };
}

// startGPS con watchPosition, alta precisión (guardia_core.js)
export function useGpsTerminal() {
  const [estado, setEstado] = useState<{ ok: boolean; lat: number | null; lng: number | null; status: string }>({ ok: false, lat: null, lng: null, status: 'Obteniendo GPS...' });
  const watch = useRef<number | null>(null);
  const iniciar = useCallback(() => {
    if (!navigator.geolocation) { setEstado(e => ({ ...e, ok: false, status: 'GPS no soportado' })); return; }
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = navigator.geolocation.watchPosition(
      p => setEstado({ ok: true, lat: p.coords.latitude, lng: p.coords.longitude, status: 'GPS activo' }),
      err => setEstado(e => ({ ...e, ok: false, status: ({ 1: 'Permiso denegado', 2: 'Sin señal', 3: 'Timeout' } as Record<number, string>)[err.code] || 'Error GPS' })),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);
  useEffect(() => () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); }, []);
  return { ...estado, iniciar };
}

export function BarraGps({ gps, onRefrescar }: { gps: ReturnType<typeof useGpsTerminal>; onRefrescar: () => void }) {
  return (
    <div className="gps-bar" id="gpsBar" style={{ borderColor: gps.ok ? 'var(--success)' : 'var(--gray-200)' }}>
      <div className={`gps-icon${gps.ok ? ' ok' : ''}`} id="gpsIcon">{gps.ok ? '📍' : '📡'}</div>
      <div className="gps-text">
        <div className="gps-status" id="gpsStatus">{gps.status}</div>
        <div className="gps-coord" id="gpsCoord">{gps.ok && gps.lat !== null ? `${gps.lat.toFixed(5)}°, ${gps.lng!.toFixed(5)}°` : (gps.status === 'Obteniendo GPS...' ? 'Esperando señal' : '---')}</div>
      </div>
      <i className="fas fa-sync-alt" onClick={onRefrescar} style={{ color: 'var(--gray-500)', cursor: 'pointer' }}></i>
    </div>
  );
}

export function FotoModal({ url, onCerrar }: { url: string; onCerrar: () => void }) {
  const [error, setError] = useState(false);
  return (
    <div className="photo-modal" onClick={onCerrar}>
      {error ? <div style={{ color: 'white', textAlign: 'center' }}><i className="fas fa-image fa-4x mb-3"></i><br />No se pudo cargar la imagen</div>
        : <img src={url} onError={() => setError(true)} alt="" />}
    </div>
  );
}

export interface PersonaTerminal { id: string; nombre: string; area: string | null; foto_url: string | null; tipo: 'ENTRADA' | 'SALIDA' | null }

// Perfil estilo credencial + almuerzo + resumen + botones (pantalla de registro de guardia_core.js)
export function PantallaRegistro({ persona, foto, gps, almuerzo, onAlmuerzo, onRegistrar, onVolver, registrando, textoVolver = 'Buscar otro' }:
  { persona: PersonaTerminal; foto: string; gps: ReturnType<typeof useGpsTerminal>; almuerzo: 'SI' | 'NO' | '';
    onAlmuerzo: (o: 'SI' | 'NO') => void; onRegistrar: () => void; onVolver: () => void; registrando: boolean; textoVolver?: string }) {
  const [ampliar, setAmpliar] = useState(false);
  const [errFoto, setErrFoto] = useState(false);
  const entrada = persona.tipo === 'ENTRADA';
  return (
    <div className="card">
      <div id="profileInfo">
        <div className="profile-credencial">
          <div className="photo-frame" onClick={() => setAmpliar(true)}>
            {foto && !errFoto ? <img className="employee-photo" src={foto} alt="Foto" onError={() => setErrFoto(true)} />
              : <div className="employee-photo-placeholder">👤</div>}
            <div className="photo-verified"><i className="fas fa-check"></i></div>
          </div>
          <div className="employee-name">{persona.nombre}</div>
          <div className="employee-area">{persona.area || 'Departamento'}</div>
          {entrada ? <span className="status-badge badge-pendiente"><i className="fas fa-clock"></i> Pendiente entrada</span>
            : <span className="status-badge badge-salida"><i className="fas fa-sign-out-alt"></i> Pendiente salida</span>}
        </div>
      </div>
      {entrada && (
        <div id="lunchSection">
          <div className="lunch-row">
            <div className={`lunch-btn ${almuerzo === 'SI' ? 'selected' : ''}`} id="lunchPlanta" onClick={() => onAlmuerzo('SI')}>
              <i className="fas fa-building"></i><span>En planta</span>
            </div>
            <div className={`lunch-btn ${almuerzo === 'NO' ? 'selected' : ''}`} id="lunchFuera" onClick={() => onAlmuerzo('NO')}>
              <i className="fas fa-home"></i><span>Fuera de planta</span>
            </div>
          </div>
        </div>
      )}
      <div className="summary">
        <div className="summary-row">
          <span className="summary-label">Registro</span>
          <span className="summary-value" id="sumTipo">{entrada ? <><i className="fas fa-sign-in-alt"></i> ENTRADA</> : <><i className="fas fa-sign-out-alt"></i> SALIDA</>}</span>
        </div>
        {entrada && (
          <div className="summary-row" id="sumAlmRow">
            <span className="summary-label">Almuerzo</span>
            <span className="summary-value" id="sumAlm">{almuerzo === 'SI' ? <><i className="fas fa-building"></i> En planta</> : almuerzo === 'NO' ? <><i className="fas fa-home"></i> Fuera de planta</> : '-'}</span>
          </div>
        )}
        <div className="summary-row">
          <span className="summary-label">Ubicación</span>
          <span className="summary-value" id="sumGps">{gps.ok && gps.lat !== null ? <><i className="fas fa-map-marker-alt"></i> {gps.lat.toFixed(5)}°, {gps.lng!.toFixed(5)}°</> : <><i className="fas fa-exclamation-triangle"></i> Sin GPS</>}</span>
        </div>
      </div>
      <button className="btn-large btn-success" id="btnRegistrar" onClick={onRegistrar} disabled={registrando}><i className="fas fa-check-circle"></i> Registrar</button>
      <button className="btn-large btn-secondary" onClick={onVolver}><i className="fas fa-arrow-left"></i> {textoVolver}</button>
      {ampliar && foto && <FotoModal url={foto} onCerrar={() => setAmpliar(false)} />}
    </div>
  );
}

// Confirmación de salida antes de las 16:15 (texto de guardia_core.js)
export function confirmarSalidaAnticipada(nombre: string, minutosAhora: number, horaAhora: string, minutosSalida: number): boolean {
  if (minutosAhora >= minutosSalida) return true;
  return window.confirm(`⚠️ Salida anticipada (${horaAhora}).\nLa jornada oficial finaliza a las 16:15.\n\n¿Desea confirmar el registro de salida para ${nombre || ''}?`);
}
