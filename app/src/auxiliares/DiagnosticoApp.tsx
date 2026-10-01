// Diagnóstico (diagnostico.html): el legado probaba la URL de Apps Script y llamadas JSONP. Sin Apps Script,
// la página muestra el estado real del servidor (api.sup_estado_sistema, D-16). Solo con sesión de supervisor.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { rpc, urlApi } from '../lib/api';
import { leerClaims } from '../lib/sesion';

const NOMBRES_TAREA: Record<string, string> = {
  reset_autorizaciones: 'Reset de autorizaciones de horas extra', autocompletar_salidas: 'Autocompletar salidas',
  aviso_no_registro: 'Aviso WhatsApp "no registró entrada"', copia_legado: 'Copia de Firestore (legado)',
  reporte_paralelo: 'Reporte de diferencias (paralelo)',
};

export function DiagnosticoApp() {
  const claims = leerClaims();
  const autorizado = !!claims && ['supervisor', 'supervisor_admin', 'admin'].includes(claims.role);
  const [estado, setEstado] = useState<any>(null);
  const [log, setLog] = useState<{ t: string; m: string; ok: boolean }[]>([]);
  const [cargando, setCargando] = useState(false);
  const [paralelo, setParalelo] = useState<any>(null);

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

  // Fase 7: reporte diario de diferencias (solo Sup. Admin / Admin)
  const verParalelo = (fecha?: string) => rpc<any>('sup_paralelo', fecha ? { p_fecha: fecha } : {}).then(setParalelo).catch(() => setParalelo(null));
  useEffect(() => { if (autorizado && ['supervisor_admin', 'admin'].includes(claims!.role)) void verParalelo(); }, [autorizado]); // eslint-disable-line react-hooks/exhaustive-deps

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
              {fila('Modo de WhatsApp', estado.worker?.modo === 'real' ? 'Envío real' : estado.worker?.modo ? 'Simulación (no envía)' : '')}
              {fila('Sesión de WhatsApp', estado.worker?.sesionActiva === 'true' || estado.worker?.sesionActiva === true ? 'Lista' : estado.worker?.error || '')}
              {fila('Google Sheets', estado.worker?.sheets)}
            </tbody></table>
            <h2 style={{ marginTop: 15 }}>Tareas programadas</h2>
            <table><tbody>
              {(estado.tareas || []).length ? estado.tareas.map((t: any) => fila(`${NOMBRES_TAREA[t.tarea] || t.tarea} · ${t.fecha}`,
                t.error ? `❌ ${t.error}` : `${t.inicio?.slice(11)} · ${JSON.stringify(t.resultado)}`)) : fila('Tareas', 'Aún no se ejecutan')}
            </tbody></table>
          </div>
          {paralelo && <SeccionParalelo datos={paralelo} onFecha={f => void verParalelo(f)} />}
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

const NOMBRE_INDICADOR: Record<string, string> = {
  asistencias: 'Asistencias', faltas: 'Faltas', diasVacaciones: 'Vacaciones', diasJustificados: 'Justificados', diasExtras: 'Días extra',
  diasCampo: 'Campo', atrasos: 'Atrasos', minutosAtrasos: 'Min. atraso', permisoMedico: 'Permiso médico', permisoPersonal: 'Permiso personal',
  tiempoPorJustificar: 'Por justificar', tiempoADescontar: 'A descontar', almPlanta: 'Almuerzo planta', almFuera: 'Almuerzo fuera',
  horasExtra50: 'Extra 50 %', horasExtra100: 'Extra 100 %', horasCampo50: 'Campo 50 %', horasCampo100: 'Campo 100 %',
  entradas: 'Entradas', entradasAuto: 'Entradas auto', salidas: 'Salidas', salidasAuto: 'Salidas auto',
};

// Operación en paralelo (Fase 7): legado (Firestore) vs base nueva, mismo motor de cálculo
function SeccionParalelo({ datos, onFecha }: { datos: any; onFecha: (f: string) => void }) {
  const rep = datos.reporte;
  const dia = rep?.resumen?.dia;
  const per = rep?.resumen?.periodo;
  return (
    <div className="container">
      <h2>🔁 Operación en paralelo · legado vs base nueva</h2>
      {!rep ? <div className="status warning">Aún no hay reportes: el worker los genera cada noche después de copiar Firestore.</div> : (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {datos.dias.map((d: any) => (
              <button key={d.fecha} onClick={() => onFecha(d.fecha)} style={d.fecha === rep.fecha ? { background: '#1f6feb' } : undefined}
                title={`${d.iguales} iguales · ${d.conDiferencias} con diferencias`}>
                {d.fecha.slice(5)} {d.sinExplicar > 0 ? `⚠️${d.sinExplicar}` : '✓'}
              </button>
            ))}
          </div>
          <div className={dia?.sinExplicar ? 'status warning' : 'status ok'}>
            {rep.fecha}: {dia?.iguales} de {dia?.comparados} colaboradores idénticos · {dia?.conDiferencias} con diferencias
            {dia?.sinExplicar ? ` (${dia.sinExplicar} por revisar)` : ' (todas explicadas)'} · generado {rep.generado}
          </div>
          {per && (
            <table><tbody>
              <tr><th>Período</th><td>{per.label} (hasta {per.hasta})</td></tr>
              <tr><th>Filas colaborador idénticas</th><td>{per.filasIguales} de {per.colaboradores}</td></tr>
              <tr><th>Totales distintos (legado / nuevo)</th><td>{Object.keys(per.totalesDistintos || {}).length
                ? Object.entries(per.totalesDistintos).map(([k, v]: any) => `${NOMBRE_INDICADOR[k] || k}: ${v[0]} / ${v[1]}`).join(' · ') : 'Ninguno'}</td></tr>
            </tbody></table>
          )}
          {rep.diferencias?.length > 0 && (
            <table style={{ marginTop: 10 }}>
              <thead><tr><th>Colaborador</th><th>Causa</th><th>Indicadores (legado / nuevo)</th><th>Legado</th><th>Nuevo</th></tr></thead>
              <tbody>
                {rep.diferencias.map((d: any) => (
                  <tr key={d.id}>
                    <td>{d.nombre} ({d.id})</td>
                    <td title={d.explicacion}>{d.causa}</td>
                    <td>{Object.entries(d.indicadores).map(([k, v]: any) => `${NOMBRE_INDICADOR[k] || k}: ${v[0]}/${v[1]}`).join(', ')}</td>
                    <td>{(d.legado || []).join(', ') || '—'}</td>
                    <td>{(d.nuevo || []).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
