// Diagnóstico (diagnostico.html): el legado probaba la URL de Apps Script y llamadas JSONP. Sin Apps Script,
// la página muestra el estado real del servidor (api.sup_estado_sistema, D-16). Solo con sesión de supervisor.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { rpc, urlApi } from '../lib/api';
import { leerClaims } from '../lib/sesion';

export function DiagnosticoApp() {
  const claims = leerClaims();
  const autorizado = !!claims && ['supervisor', 'supervisor_admin', 'admin'].includes(claims.role);
  const [estado, setEstado] = useState<any>(null);
  const [log, setLog] = useState<{ t: string; m: string; ok: boolean }[]>([]);
  const [cargando, setCargando] = useState(false);

  const anotar = (m: string, ok = true) => setLog(l => [...l, { t: new Date().toLocaleTimeString('es-EC'), m, ok }]);

  const probar = async () => {
    setCargando(true);
    const t0 = performance.now();
    try {
      const r = await rpc<any>('sup_estado_sistema', {});
      setEstado(r);
      anotar(`✅ Conexión correcta con el servidor (${Math.round(performance.now() - t0)} ms)`);
    } catch (e: any) {
      anotar('❌ ' + (e?.message || 'Error de conexión con el servidor'), false);
    } finally { setCargando(false); }
  };
  useEffect(() => { if (autorizado) void probar(); }, [autorizado]); // eslint-disable-line react-hooks/exhaustive-deps

  const info = () => anotar(`ℹ️ API: ${urlApi('')} · Navegador: ${navigator.userAgent} · En línea: ${navigator.onLine ? 'sí' : 'no'} · Service worker: ${'serviceWorker' in navigator ? 'soportado' : 'no soportado'}`);

  if (!autorizado) {
    return (
      <div>
        <h1>🔧 DIAGNÓSTICO - CONTROL 2026</h1>
        <div className="container"><p>Se requiere iniciar sesión en el panel de Supervisión.</p><a className="boton" href="supervisor.html">Ir a Panel de Supervisión</a></div>
      </div>
    );
  }

  const fila = (k: string, v: unknown) => <tr key={k}><th>{k}</th><td>{v === null || v === undefined || v === '' ? '—' : String(v)}</td></tr>;
  const cola = estado?.cola || {};

  return (
    <div>
      <h1>🔧 DIAGNÓSTICO - CONTROL 2026</h1>
      <p style={{ color: '#8b949e', marginBottom: 20 }}>Herramienta para identificar problemas de conexión con el servidor</p>
      <div className="container">
        <h2>1️⃣ Pruebas de Conexión</h2>
        <button disabled={cargando} onClick={() => void probar()}>📡 Probar Conexión</button>
        <button onClick={info}>ℹ️ Mostrar Info</button>
        <button onClick={() => setLog([])}>🗑️ Limpiar Log</button>
        <div className="log-box">{log.map((l, i) => <div key={i} className={`log-entry ${l.ok ? 'success' : 'error'}`}>[{l.t}] {l.m}</div>)}</div>
      </div>
      {estado && (
        <>
          <div className="container">
            <h2>2️⃣ Servidor</h2>
            <table><tbody>
              {fila('Hora oficial (America/Guayaquil)', estado.servidor?.hora)}
              {fila('Fecha de hoy', estado.servidor?.hoy)}
              {fila('Base de datos', estado.servidor?.base)}
              {fila('PostgreSQL', estado.servidor?.postgres)}
              {fila('Última migración', estado.migracion)}
            </tbody></table>
          </div>
          <div className="container">
            <h2>3️⃣ Datos</h2>
            <table><tbody>
              {fila('Colaboradores activos', estado.datos?.empleadosActivos)}
              {fila('Marcaciones de hoy', estado.datos?.marcacionesHoy)}
              {fila('Última marcación', estado.datos?.ultimaMarcacion)}
              {fila('Dispositivos activos', estado.datos?.dispositivosActivos)}
            </tbody></table>
          </div>
          <div className="container">
            <h2>4️⃣ Notificaciones</h2>
            <table><tbody>
              {Object.keys(cola).length ? Object.entries(cola).map(([k, n]) => fila(`Cola · ${k}`, n)) : fila('Cola', 'vacía')}
              {fila('Último latido del worker', estado.worker?.ultimoLatido)}
            </tbody></table>
          </div>
          <div className="container">
            <h2>5️⃣ Estado General</h2>
            <div className={estado.worker?.activo ? 'status ok' : 'status warning'}>
              {estado.worker?.activo ? '✅ Servidor y worker de notificaciones operativos' : '⚠️ Servidor operativo · worker de notificaciones sin latido reciente (los envíos quedan en cola)'}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
