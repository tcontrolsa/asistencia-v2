// Terminal de Guardia (guardia.html + guardia_core.js). Cambios frente al legado (D-14):
// la clave compartida TCONTROL2026 se reemplaza por usuario y contraseña de cada guardia,
// y la hora, la geocerca y R-14 se validan en el servidor (api.marcar_guardia).
import { useCallback, useEffect, useRef, useState } from 'react';
import { alCerrarSesion, ErrorApi, rpc, sesion, urlFoto } from '../lib/api';
import { leerClaims } from '../lib/sesion';
import { BarraGps, confirmarSalidaAnticipada, FotoModal, PantallaRegistro, PersonaTerminal, useGpsTerminal, useToastGuardia } from './comun';

interface Presente { empleado_id: string; nombre: string; foto_url: string | null; hora_entrada: string | null; hora_salida: string | null; almuerzo: boolean | null }

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '--:--');

export function GuardiaApp() {
  const [activa, setActiva] = useState(() => leerClaims()?.role === 'guardia');
  const [debeCambiar, setDebeCambiar] = useState(() => !!leerClaims()?.debe_cambiar);
  const [cargando, setCargando] = useState(false);
  const toast = useToastGuardia();

  useEffect(() => { alCerrarSesion(() => { setActiva(false); setDebeCambiar(false); }); }, []);

  const salir = () => {
    rpc('cerrar_sesion').catch(() => undefined);
    sesion.cerrar();
    setActiva(false);
    setDebeCambiar(false);
  };

  return (
    <>
      <div className="app-container">
        {!activa ? (
          <Login toast={toast.mostrar} setCargando={setCargando} onActivar={dc => { setDebeCambiar(dc); setActiva(true); }} />
        ) : debeCambiar ? (
          <CambiarClave toast={toast.mostrar} setCargando={setCargando} onListo={() => setDebeCambiar(false)} onSalir={salir} />
        ) : (
          <Terminal toast={toast.mostrar} setCargando={setCargando} onSalir={salir} />
        )}
      </div>
      <div id="loadingOverlay" className={`loading-overlay${cargando ? '' : ' hidden'}`}><div className="spinner"></div></div>
      {toast.nodo}
    </>
  );
}

type Toast = ReturnType<typeof useToastGuardia>['mostrar'];

function Login({ toast, setCargando, onActivar }: { toast: Toast; setCargando: (v: boolean) => void; onActivar: (debeCambiar: boolean) => void }) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const refClave = useRef<HTMLInputElement>(null);

  const login = async () => {
    if (!usuario.trim()) { toast('Ingrese el usuario', 'error'); return; }
    if (!clave.trim()) { toast('Ingrese la contraseña', 'error'); return; }
    setCargando(true);
    try {
      const r = await rpc<{ ok: boolean; token: string; rol: string; debe_cambiar: boolean }>('login', { p_usuario: usuario.trim(), p_password: clave }, false);
      if (r.rol !== 'guardia') { toast('Esta cuenta no es de guardia', 'error'); return; }
      sesion.guardar(r.token);
      if (!r.debe_cambiar) toast('Terminal Activa', 'success');
      onActivar(r.debe_cambiar);
    } catch (e) {
      toast(e instanceof ErrorApi && e.codigo !== 'RED' ? e.message : 'Error de conexión', 'error');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div id="vLogin">
      <div className="header">
        <h1>🔐 Terminal Guardia</h1>
        <p>Control de Asistencia</p>
      </div>
      <div className="main-content">
        <div className="card">
          <div className="mb-4 text-center">
            <i className="fas fa-terminal fa-3x text-danger mb-3"></i>
            <h2 className="h5 mb-1">Acceso de Seguridad</h2>
            <p className="text-muted small">Ingrese su usuario y contraseña de guardia</p>
          </div>
          <div className="mb-3">
            <input type="text" id="iUsuario" className="form-control" placeholder="Usuario" autoComplete="username" value={usuario}
              onChange={e => setUsuario(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') refClave.current?.focus(); }}
              style={{ padding: 18, borderRadius: 48, textAlign: 'center', fontSize: 20 }} />
          </div>
          <div className="mb-4">
            <input ref={refClave} type="password" id="iClave" className="form-control" placeholder="••••••••" autoComplete="current-password" value={clave}
              onChange={e => setClave(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void login(); }}
              style={{ padding: 18, borderRadius: 48, textAlign: 'center', fontSize: 24, letterSpacing: 4 }} />
          </div>
          <button className="btn-large btn-primary" onClick={() => void login()}>
            <i className="fas fa-unlock-alt"></i> Activar Terminal
          </button>
        </div>
      </div>
    </div>
  );
}

// Contraseña temporal asignada por el supervisor: se cambia antes de usar la terminal (D-06)
function CambiarClave({ toast, setCargando, onListo, onSalir }: { toast: Toast; setCargando: (v: boolean) => void; onListo: () => void; onSalir: () => void }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirma, setConfirma] = useState('');
  const estilo = { padding: 16, borderRadius: 48, textAlign: 'center' as const, fontSize: 18 };

  const guardar = async () => {
    if (!actual || !nueva) { toast('Complete todos los campos', 'error'); return; }
    if (nueva !== confirma) { toast('Las contraseñas no coinciden', 'error'); return; }
    setCargando(true);
    try {
      const r = await rpc<{ token?: string }>('cambiar_password', { p_actual: actual, p_nueva: nueva });
      if (r?.token) sesion.guardar(r.token);
      toast('Contraseña actualizada. Terminal Activa', 'success');
      onListo();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error de conexión', 'error');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      <div className="header">
        <h1>🔐 Terminal Guardia</h1>
        <p>Cambio de contraseña</p>
      </div>
      <div className="main-content">
        <div className="card">
          <div className="mb-4 text-center">
            <i className="fas fa-key fa-3x text-danger mb-3"></i>
            <h2 className="h5 mb-1">Contraseña temporal</h2>
            <p className="text-muted small">Cree una contraseña personal para activar la terminal</p>
          </div>
          <input type="password" className="form-control mb-3" placeholder="Contraseña actual" autoComplete="current-password" value={actual} onChange={e => setActual(e.target.value)} style={estilo} />
          <input type="password" className="form-control mb-3" placeholder="Nueva contraseña (mín. 8)" autoComplete="new-password" value={nueva} onChange={e => setNueva(e.target.value)} style={estilo} />
          <input type="password" className="form-control mb-4" placeholder="Confirmar nueva contraseña" autoComplete="new-password" value={confirma} onChange={e => setConfirma(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void guardar(); }} style={estilo} />
          <button className="btn-large btn-primary" onClick={() => void guardar()}><i className="fas fa-save"></i> Guardar</button>
          <button className="btn-large btn-secondary" onClick={onSalir}><i className="fas fa-sign-out-alt"></i> Salir</button>
        </div>
      </div>
    </div>
  );
}

function Terminal({ toast, setCargando, onSalir }: { toast: Toast; setCargando: (v: boolean) => void; onSalir: () => void }) {
  const [tab, setTab] = useState<'registro' | 'presentes'>('registro');
  const [id, setId] = useState('');
  const [persona, setPersona] = useState<PersonaTerminal | null>(null);
  const [almuerzo, setAlmuerzo] = useState<'SI' | 'NO' | ''>('');
  const [registrando, setRegistrando] = useState(false);
  const [presentes, setPresentes] = useState<Presente[] | null>(null);
  const [ampliar, setAmpliar] = useState('');
  const gps = useGpsTerminal();
  const refId = useRef<HTMLInputElement>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const cargarPresentes = useCallback(async () => {
    setCargando(true);
    try {
      setPresentes(await rpc<Presente[]>('presentes_hoy'));
    } catch (e) {
      toast('Error al cargar presentes: ' + (e instanceof Error ? e.message : ''), 'error');
    } finally {
      setCargando(false);
    }
  }, [setCargando, toast]);

  useEffect(() => { gps.iniciar(); refId.current?.focus(); void cargarPresentes(); }, [gps.iniciar, cargarPresentes]);

  const cambiarTab = (t: 'registro' | 'presentes') => {
    setTab(t);
    if (t === 'presentes') void cargarPresentes();
  };

  const volverABuscar = () => {
    setPersona(null);
    setAlmuerzo('');
    setId('');
    window.setTimeout(() => refId.current?.focus(), 0);
  };

  const buscar = async () => {
    const x = id.trim();
    if (!x) { toast('Ingrese ID', 'error'); return; }
    if (!gps.ok) { toast('Espere GPS', 'info'); return; }
    setCargando(true);
    try {
      const r = await rpc<PersonaTerminal>('guardia_buscar', { p_empleado_id: x });
      if (!r.tipo) { toast('Jornada completada', 'error'); return; }
      setAlmuerzo('');
      setPersona(r);
    } catch (e) {
      toast(e instanceof ErrorApi && e.codigo !== 'RED' ? e.message : 'Error', 'error');
    } finally {
      setCargando(false);
    }
  };

  const registrar = async () => {
    if (!persona) return;
    if (persona.tipo === 'ENTRADA' && !almuerzo) { toast('Seleccione opción de almuerzo', 'error'); return; }
    setCargando(true);
    setRegistrando(true);
    try {
      if (persona.tipo === 'SALIDA') {
        // La advertencia usa la hora oficial del servidor, no la del teléfono
        const [a] = await rpc<{ hora: string }[]>('ahora');
        const [h, m] = a.hora.split(':').map(Number);
        setCargando(false);
        if (!confirmarSalidaAnticipada(persona.nombre, h * 60 + m, a.hora.slice(0, 5), 16 * 60 + 15)) return;
        setCargando(true);
      }
      const r = await rpc<{ ok: boolean; tipo: string; almuerzo: boolean | null }>('marcar_guardia', {
        p_empleado_id: persona.id, p_tipo: persona.tipo, p_almuerzo: persona.tipo === 'ENTRADA' ? almuerzo : null, p_lat: gps.lat, p_lng: gps.lng,
      });
      // R-14: después de las 09:30 el servidor registra el almuerzo fuera de planta
      toast(`${r.tipo} registrada correctamente${almuerzo === 'SI' && r.almuerzo === false ? ' (almuerzo fuera de planta: ingreso después de las 09:30)' : ''}`, 'success');
      if (tabRef.current === 'presentes') void cargarPresentes();
      window.setTimeout(volverABuscar, 1500);
    } catch (e) {
      toast(e instanceof ErrorApi && e.codigo !== 'RED' ? e.message || 'Error al registrar' : 'Error de conexión', 'error');
    } finally {
      setCargando(false);
      setRegistrando(false);
    }
  };

  return (
    <div id="vTerm">
      <div className="header">
        <h1>📋 Terminal Guardia</h1>
        <p>Registro de asistencia</p>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === 'registro' ? 'active' : ''}`} onClick={() => cambiarTab('registro')}><i className="fas fa-clipboard-list"></i> Registrar</button>
        <button className={`tab ${tab === 'presentes' ? 'active' : ''}`} onClick={() => cambiarTab('presentes')}><i className="fas fa-users"></i> Presentes</button>
      </div>
      <div className="main-content">
        <BarraGps gps={gps} onRefrescar={() => { toast('Actualizando GPS...', 'info'); gps.iniciar(); }} />

        <div id="panelRegistro" className={tab === 'registro' ? '' : 'hidden'}>
          {!persona ? (
            <div id="screenSearch">
              <div className="card">
                <input ref={refId} type="text" id="iId" className="form-control input-id" placeholder="ID" inputMode="numeric" autoComplete="off"
                  value={id} onChange={e => setId(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void buscar(); }} />
                <button className="btn-large btn-primary" onClick={() => void buscar()} style={{ marginTop: 20 }}><i className="fas fa-search"></i> Buscar</button>
                <button className="btn-large btn-secondary" onClick={onSalir}><i className="fas fa-sign-out-alt"></i> Salir</button>
              </div>
            </div>
          ) : (
            <div id="screenRegister">
              <PantallaRegistro persona={persona} foto={urlFoto(persona.foto_url)} gps={gps} almuerzo={almuerzo} onAlmuerzo={setAlmuerzo}
                onRegistrar={() => void registrar()} onVolver={volverABuscar} registrando={registrando} />
            </div>
          )}
        </div>

        <div id="panelPresentes" className={tab === 'presentes' ? '' : 'hidden'}>
          <div className="card">
            <div className="present-count">
              <i className="fas fa-user-check"></i> <span id="presentCount">{presentes?.length ?? 0}</span> empleados presentes hoy
            </div>
            <div id="presentList" className="present-list">
              {presentes === null ? (
                <div className="empty-state"><i className="fas fa-users-slash"></i><p>Cargando lista de presentes...</p></div>
              ) : presentes.length === 0 ? (
                <div className="empty-state"><i className="fas fa-user-clock"></i><p>No hay empleados registrados hoy</p></div>
              ) : presentes.map(p => {
                const foto = urlFoto(p.foto_url);
                return (
                  <div className="present-item" key={p.empleado_id}>
                    {foto ? <img className="present-photo" src={foto} alt={p.nombre} onClick={() => setAmpliar(foto)} style={{ cursor: 'pointer' }} />
                      : <div className="present-photo-placeholder">{(p.nombre || '?').charAt(0).toUpperCase()}</div>}
                    <div className="present-info">
                      <div className="present-name">{p.nombre}</div>
                      <div className="present-time">
                        <i className="fas fa-clock"></i> {hhmm(p.hora_entrada)}
                        {p.hora_salida && <> <span className="present-badge badge-salida-small"><i className="fas fa-sign-out-alt"></i> Salida: {hhmm(p.hora_salida)}</span></>}
                        {p.almuerzo !== null && <> <span className="present-badge badge-almuerzo"><i className="fas fa-utensils"></i> {p.almuerzo ? '🏢 Planta' : '🏠 Fuera'}</span></>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="btn-large btn-outline" onClick={() => void cargarPresentes()} style={{ marginTop: 16 }}><i className="fas fa-sync-alt"></i> Actualizar</button>
          </div>
        </div>
      </div>
      {ampliar && <FotoModal url={ampliar} onCerrar={() => setAmpliar('')} />}
    </div>
  );
}
