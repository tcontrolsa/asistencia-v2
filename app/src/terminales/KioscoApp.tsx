// Kiosco (funcionalidad nueva aprobada, D-23; sin cámara). No existe en el legado: reutiliza el
// marcado y el CSS de la terminal de guardia. Cada colaborador se identifica con su ID y su propia
// contraseña (P-02); el dispositivo no guarda sesión y la contraseña solo vive en memoria.
import { useEffect, useRef, useState } from 'react';
import { ErrorApi, rpc, urlFoto } from '../lib/api';
import { BarraGps, confirmarSalidaAnticipada, PantallaRegistro, PersonaTerminal, useGpsTerminal, useToastGuardia } from './comun';

const INACTIVIDAD_MS = 60000;

export function KioscoApp() {
  const [id, setId] = useState('');
  const [clave, setClave] = useState('');
  const [persona, setPersona] = useState<PersonaTerminal | null>(null);
  const [almuerzo, setAlmuerzo] = useState<'SI' | 'NO' | ''>('');
  const [cargando, setCargando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const toast = useToastGuardia();
  const gps = useGpsTerminal();
  const refId = useRef<HTMLInputElement>(null);
  const refClave = useRef<HTMLInputElement>(null);

  useEffect(() => { gps.iniciar(); refId.current?.focus(); }, [gps.iniciar]);

  const volver = () => {
    setPersona(null);
    setAlmuerzo('');
    setId('');
    setClave('');
    window.setTimeout(() => refId.current?.focus(), 0);
  };

  // Si alguien se identifica y se va, la pantalla vuelve al inicio y olvida la contraseña
  useEffect(() => {
    if (!persona) return;
    const t = window.setTimeout(volver, INACTIVIDAD_MS);
    return () => window.clearTimeout(t);
  }, [persona, almuerzo]);

  const identificar = async () => {
    if (!id.trim()) { toast.mostrar('Ingrese ID', 'error'); return; }
    if (!clave) { toast.mostrar('Ingrese su contraseña', 'error'); refClave.current?.focus(); return; }
    if (!gps.ok) { toast.mostrar('Espere GPS', 'info'); return; }
    setCargando(true);
    try {
      const r = await rpc<PersonaTerminal>('kiosco_identificar', { p_usuario: id.trim(), p_password: clave }, false);
      if (!r.tipo) { toast.mostrar('Jornada completada', 'error'); setClave(''); return; }
      setAlmuerzo('');
      setPersona(r);
    } catch (e) {
      setClave('');
      toast.mostrar(e instanceof ErrorApi && e.codigo !== 'RED' ? e.message : 'Error de conexión', 'error');
    } finally {
      setCargando(false);
    }
  };

  const registrar = async () => {
    if (!persona) return;
    if (persona.tipo === 'ENTRADA' && !almuerzo) { toast.mostrar('Seleccione opción de almuerzo', 'error'); return; }
    setCargando(true);
    setRegistrando(true);
    try {
      if (persona.tipo === 'SALIDA') {
        const [a] = await rpc<{ hora: string }[]>('ahora', {}, false);
        const [h, m] = a.hora.split(':').map(Number);
        setCargando(false);
        if (!confirmarSalidaAnticipada(persona.nombre, h * 60 + m, a.hora.slice(0, 5), 16 * 60 + 15)) return;
        setCargando(true);
      }
      const r = await rpc<{ ok: boolean; tipo: string; almuerzo: boolean | null }>('marcar_kiosco', {
        p_usuario: persona.id, p_password: clave, p_tipo: persona.tipo,
        p_almuerzo: persona.tipo === 'ENTRADA' ? almuerzo : null, p_lat: gps.lat, p_lng: gps.lng,
      }, false);
      // R-14: después de las 09:30 el servidor registra el almuerzo fuera de planta
      toast.mostrar(`${r.tipo} registrada correctamente${almuerzo === 'SI' && r.almuerzo === false ? ' (almuerzo fuera de planta: ingreso después de las 09:30)' : ''}`, 'success');
      window.setTimeout(volver, 1500);
    } catch (e) {
      toast.mostrar(e instanceof ErrorApi && e.codigo !== 'RED' ? e.message || 'Error al registrar' : 'Error de conexión', 'error');
    } finally {
      setCargando(false);
      setRegistrando(false);
    }
  };

  return (
    <>
      <div className="app-container">
        <div className="header">
          <h1>🖥️ Kiosco</h1>
          <p>Registro de asistencia</p>
        </div>
        <div className="main-content">
          <BarraGps gps={gps} onRefrescar={() => { toast.mostrar('Actualizando GPS...', 'info'); gps.iniciar(); }} />
          {!persona ? (
            <div className="card">
              <input ref={refId} type="text" id="iId" className="form-control input-id" placeholder="ID" inputMode="numeric" autoComplete="off"
                value={id} onChange={e => setId(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') refClave.current?.focus(); }} />
              <input ref={refClave} type="password" id="iClave" className="form-control" placeholder="Contraseña" autoComplete="off"
                value={clave} onChange={e => setClave(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void identificar(); }}
                style={{ padding: 18, borderRadius: 48, textAlign: 'center', fontSize: 22, letterSpacing: 4, marginTop: 16 }} />
              <button className="btn-large btn-primary" onClick={() => void identificar()} style={{ marginTop: 20 }}>
                <i className="fas fa-sign-in-alt"></i> Continuar
              </button>
              <p className="text-muted small text-center mt-3 mb-0">Use el mismo ID y contraseña de la app TCONTROL</p>
            </div>
          ) : (
            <PantallaRegistro persona={persona} foto={urlFoto(persona.foto_url)} gps={gps} almuerzo={almuerzo} onAlmuerzo={setAlmuerzo}
              onRegistrar={() => void registrar()} onVolver={volver} registrando={registrando} textoVolver="Cancelar" />
          )}
        </div>
      </div>
      <div id="loadingOverlay" className={`loading-overlay${cargando ? '' : ' hidden'}`}><div className="spinner"></div></div>
      {toast.nodo}
    </>
  );
}
