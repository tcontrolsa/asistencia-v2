import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { s } from '../lib/estilo';
import { formatearHora, formatMins } from '../lib/formato';
import { calcularEstadisticas, historialPorSemana, logrosPeriodo } from '../lib/estadisticas';
import { ahora, partes } from '../lib/reloj';
import { useApp } from '../app/Estado';

const TARJETA = 'padding: 16px; border-radius: 16px; background: rgba(255, 255, 255, 0.6); border: 1px solid rgba(226, 232, 240, 0.8); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03); height: 100%; display: flex; flex-direction: column;';
const CAB = 'display: flex; align-items: center; gap: 10px; margin-bottom: 15px; border-bottom: 1.5px solid rgba(226, 232, 240, 0.8); padding-bottom: 10px;';
const TIT = 'font-weight: 750; font-size: clamp(11px, 3.2vw, 13px); color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;';
const FILA = 'display: flex; justify-content: space-between; align-items: center;';
const ETQ = 'font-size: clamp(11px, 3vw, 12px); color: #64748b; font-weight: 600;';

function Tarjeta({ icono, fondo, titulo, children }: { icono: string; fondo: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="col-12 col-md-6 col-lg-3">
      <div className="stat-card" style={s(TARJETA)}>
        <div style={s(CAB)}>
          <div style={{ ...s('font-size: 20px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%;'), background: fondo }}>{icono}</div>
          <div style={s(TIT)}>{titulo}</div>
        </div>
        <div style={s('display: flex; flex-direction: column; gap: 12px; flex-grow: 1; justify-content: center;')}>{children}</div>
      </div>
    </div>
  );
}

function Dato({ etiqueta, sub, valor, estilo }: { etiqueta: string; sub?: string; valor: React.ReactNode; estilo: string }) {
  return (
    <div style={s(FILA)}>
      {sub ? <div><span style={s(ETQ + ' display: block;')}>{etiqueta}</span><small style={s('font-size: 9px; color: #94a3b8; font-weight: 500;')}>{sub}</small></div>
        : <span style={s(ETQ)}>{etiqueta}</span>}
      <span style={s(estilo)}>{valor}</span>
    </div>
  );
}

const COLOR_DET: Record<string, { bg: string; borde: string; color: string; icono: string; titulo: string }> = {
  vacacion: { bg: 'rgba(33,150,243,0.1)', borde: '#2196f3', color: '#1565c0', icono: '🏖️', titulo: 'Vacación:' },
  justificacion: { bg: 'rgba(255,152,0,0.1)', borde: '#ff9800', color: '#e65100', icono: '📌', titulo: 'Justificación:' },
  atraso: { bg: 'rgba(244,67,54,0.1)', borde: '#f44336', color: '#c62828', icono: '🔴', titulo: 'Atraso:' },
  salida: { bg: 'rgba(255,152,0,0.05)', borde: '#e91e63', color: '#ad1457', icono: '⏱️', titulo: 'Salida temp:' },
  permiso: { bg: 'rgba(76,175,80,0.1)', borde: '#4caf50', color: '#2e7d32', icono: '', titulo: '' },
};

export function HistoryPage({ onDescargarTodo, todoDescargado }: { onDescargarTodo: () => Promise<void>; todoDescargado: boolean }) {
  const { ctx, emp, registros, cargandoRegistros, hoy } = useApp();
  const navegar = useNavigate();
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [descargando, setDescargando] = useState(false);
  const stats = useMemo(() => calcularEstadisticas(registros, ctx.periodo, emp.es_pasante), [registros, ctx.periodo, emp.es_pasante]);
  const logros = logrosPeriodo(stats, emp.es_pasante);
  const semanas = useMemo(() => historialPorSemana(registros, emp.es_pasante, h => formatearHora(h), todoDescargado ? null : ctx.periodo.inicio),
    [registros, emp.es_pasante, todoDescargado, ctx.periodo.inicio]);
  const p = partes(ahora());
  const dos = (n: number) => String(n).padStart(2, '0');
  const actualizado = `${dos(p.dia)}-${dos(p.mes)}-${p.anio} ${dos(p.hora)}:${dos(p.minuto)}:${dos(p.segundo)}`;

  return (
    <div className="page">
      <div className="glass-card mt-3">
        <h5 className="fw-bold mb-3" style={{ fontSize: 'clamp(14px, 4.5vw, 16px)' }}><i className="fas fa-chart-bar text-primary"></i> Resumen del Período</h5>
        <div className="row g-3">
          <Tarjeta icono="📅" fondo="rgba(99, 102, 241, 0.1)" titulo="Asistencia y Almuerzos">
            <Dato etiqueta="Días Trabajados" valor={stats.diasTrabajados} estilo="font-size: clamp(15px, 4.5vw, 18px); color: #4f46e5; font-weight: 850;" />
            <Dato etiqueta="Horas Trabajadas" valor={stats.horas_trabajadas} estilo="font-size: clamp(14px, 4.2vw, 16px); color: #10b981; font-weight: 800;" />
            <Dato etiqueta="Almuerzos en Planta" valor={stats.almuerzos} estilo="font-size: clamp(15px, 4.5vw, 18px); color: #0284c7; font-weight: 850;" />
          </Tarjeta>
          <Tarjeta icono="⏳" fondo="rgba(245, 158, 11, 0.1)" titulo="Horas Extras y Campo">
            <Dato etiqueta="Extras (50%)" sub="(A+C Autorizadas)" valor={stats.horas_extras_50} estilo="font-size: clamp(14px, 4.2vw, 16px); color: #d97706; font-weight: 850;" />
            <Dato etiqueta="Extras (100%)" sub="(B+D Feriado/Sáb/Dom)" valor={stats.horas_extras_100} estilo="font-size: clamp(14px, 4.2vw, 16px); color: #dc2626; font-weight: 850;" />
            <Dato etiqueta="Horas en Campo" sub="(Labores de Campo)" valor={stats.horas_campo} estilo="font-size: clamp(14px, 4.2vw, 16px); color: #2563eb; font-weight: 850;" />
          </Tarjeta>
          <Tarjeta icono="⏱️" fondo="rgba(239, 68, 68, 0.1)" titulo="Puntualidad y Control">
            <Dato etiqueta="Días con Atraso" valor={stats.atrasos} estilo="font-size: clamp(15px, 4.5vw, 18px); color: #1f2937; font-weight: 850;" />
            <Dato etiqueta="Demoras Acumuladas" valor={`+${stats.minutosAtrasoTotal} min`} estilo="font-size: clamp(13px, 3.8vw, 15px); color: #4b5563; font-weight: 800;" />
            <Dato etiqueta="Salidas Tempranas" valor={stats.salidas_tempranas} estilo="font-size: clamp(15px, 4.5vw, 18px); color: #10b981; font-weight: 850;" />
          </Tarjeta>
          <Tarjeta icono="🗓️" fondo="rgba(16, 185, 129, 0.1)" titulo="Administración del Tiempo">
            <Dato etiqueta="Permisos Personales" valor={stats.minutosPermisoPersonal > 0 ? formatMins(stats.minutosPermisoPersonal) : '—'} estilo="font-size: clamp(14px, 4.2vw, 16px); color: var(--indigo); font-weight: 850;" />
            <Dato etiqueta="Permisos Médicos" valor={stats.minutosPermisoMedico > 0 ? formatMins(stats.minutosPermisoMedico) : '—'} estilo="font-size: clamp(14px, 4.2vw, 16px); color: var(--teal); font-weight: 850;" />
            <Dato etiqueta="Tiempo Justificado" valor={stats.minutosTiempoJustificado > 0 ? formatMins(stats.minutosTiempoJustificado) : '—'} estilo="font-size: clamp(14px, 4.2vw, 16px); color: #eab308; font-weight: 850;" />
            <Dato etiqueta="Vacaciones Tomadas" valor={stats.vacacionesEnPeriodo > 0 ? `${stats.vacacionesEnPeriodo} día(s)` : '—'} estilo="font-size: clamp(14px, 4.2vw, 16px); color: #0284c7; font-weight: 850;" />
          </Tarjeta>
        </div>
        {hoy.tieneEntrada && !hoy.tieneSalida && (
          <div className="mt-3">
            <button className="btn btn-danger btn-lg w-100" onClick={() => navegar('/', { state: { iniciar: 'SALIDA' } })}
              style={s('font-size: clamp(14px, 4.2vw, 16px); padding: clamp(12px, 3.5vw, 14px);')}>
              <i className="fas fa-sign-out-alt"></i> REGISTRAR SALIDA
            </button>
          </div>
        )}
      </div>

      <div className="glass-card mt-3">
        <div style={s('display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;')}>
          <h5 className="fw-bold m-0" style={s('font-size: clamp(14px, 4.5vw, 16px); color: #1e3a8a;')}><i className="fas fa-trophy text-warning"></i> Mis Logros</h5>
          <span style={s('font-size: 10px; color: #64748b; font-weight: 600;')}>Actual al: {actualizado}</span>
        </div>
        <div style={s('display: flex; flex-direction: column; gap: 10px;')}>
          {logros.map((l, i) => (
            <div key={i} className="achievement-card" style={s(`display: flex; align-items: center; gap: 15px; background: rgba(255, 255, 255, 0.7); padding: 12px 15px; border-radius: 12px; border: 1px solid rgba(226, 232, 240, 0.8); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);${i > 0 ? ' margin-top: 8px;' : ''}`)}>
              <div className="achievement-icon" style={{ ...s('font-size: 24px; width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 1px solid rgba(0,0,0,0.05); flex-shrink: 0;'), background: l.color }}>{l.icono}</div>
              <div style={{ flex: 1 }}>
                <div style={s('font-weight: 700; font-size: 13px; color: #1e293b;')}>{l.titulo}</div>
                <div style={s('font-size: 11px; color: #64748b; margin-top: 2px;')}>{l.descripcion}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card mt-3">
        <h5 className="fw-bold mb-3" style={{ fontSize: 'clamp(14px, 4.5vw, 16px)' }}><i className="fas fa-history"></i> Historial completo</h5>
        <div id="historialAgrupado">
          {cargandoRegistros ? (
            <div className="text-center py-4">
              <div className="spinner-border text-primary spinner-border-sm" role="status" style={s('width: 24px; height: 24px; border-width: 2.5px;')}></div>
              <p className="text-muted mt-2" style={s('font-size: 13px; font-weight: 500;')}>Cargando historial de marcaciones...</p>
            </div>
          ) : !registros.length ? (
            <p className="text-muted text-center py-3" style={{ fontSize: 'clamp(12px, 3.8vw, 14px)' }}>No hay registros disponibles</p>
          ) : (
            <>
              <div style={s('display: flex; flex-direction: column; gap: 12px;')}>
                {semanas.map(sem => {
                  const abierta = abiertas.has(sem.clave);
                  return (
                    <div key={sem.clave} className="semana-container" style={s('border-radius: clamp(12px, 4vw, 16px); border: 1px solid #e0e0e0; overflow: hidden;')}>
                      <div className="semana-header" onClick={() => { const n = new Set(abiertas); if (abierta) n.delete(sem.clave); else n.add(sem.clave); setAbiertas(n); }}
                        style={s('padding: clamp(12px, 3.5vw, 14px); background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-weight: 600;')}>
                        <div>
                          <div style={{ fontSize: 'clamp(12px, 3.5vw, 14px)' }}>📅 {sem.etiqueta}</div>
                          <div style={s('font-size: clamp(10px, 3vw, 12px); opacity: 0.9; margin-top: 4px;')}>
                            {sem.dias} días • {sem.atrasos} atrasos • {sem.justificaciones} justif. • {sem.horas.toFixed(1)}h
                          </div>
                        </div>
                        <i className="fas fa-chevron-down" style={{ transition: 'transform 0.3s', transform: abierta ? 'rotate(180deg)' : 'rotate(0deg)' }}></i>
                      </div>
                      <div className="semana-content" style={{ padding: 0, display: abierta ? 'block' : 'none' }}>
                        {sem.lista.map(dia => (
                          <div key={dia.fecha} className="dia-item" style={{ ...s('padding: clamp(12px, 3.5vw, 14px); border-bottom: 1px solid #f0f0f0;'), background: dia.resaltar ? 'rgba(255,193,7,0.05)' : 'white' }}>
                            <div style={s('display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px;')}>
                              <div style={{ flex: 1 }}>
                                <div style={s('font-weight: 600; font-size: clamp(12px, 3.5vw, 14px); display: flex; align-items: center; gap: 6px;')}>{dia.statusIcon} {dia.fechaFormato}</div>
                                <div style={s('font-size: clamp(10px, 3vw, 12px); color: #666; margin-top: 4px;')}>
                                  ⏰ {dia.entradaHora} → {dia.salidaHora} <span style={s('font-weight: 600; color: #333;')}>{dia.duracion}</span>
                                </div>
                              </div>
                              <div style={s('text-align: right; font-size: clamp(9px, 2.8vw, 11px);')}>{dia.almuerzoIcon}</div>
                            </div>
                            {dia.detalles.length > 0 && (
                              <div style={s('margin-top: 8px; display: flex; flex-direction: column; gap: 4px;')}>
                                {dia.detalles.map((d, i) => {
                                  const c = COLOR_DET[d.tipo];
                                  return (
                                    <div key={i} style={{ ...s('padding: 6px 10px; border-radius: 4px; font-size: clamp(9px, 2.8vw, 11px); margin-bottom: 4px;'), background: c.bg, borderLeft: `3px solid ${c.borde}`, color: c.color }}>
                                      {c.titulo ? <><strong>{c.icono} {c.titulo}</strong> {d.texto}</> : d.texto}
                                      {d.extra && <> <strong style={{ color: '#d32f2f' }}>{d.extra}</strong></>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!todoDescargado && (
                <div className="text-center mt-3" id="btnDescargarAnterioresContainer">
                  <button id="btnDescargarAnteriores" className="btn btn-outline-primary btn-sm w-100" disabled={descargando}
                    onClick={async () => { setDescargando(true); await onDescargarTodo(); setDescargando(false); }}
                    style={s('font-weight: 700; border-radius: 12px; padding: 12px; border: 2px solid var(--primary); background: transparent; color: var(--primary); cursor: pointer; transition: all 0.2s;')}>
                    {descargando ? <><i className="fas fa-spinner fa-spin"></i> Descargando...</> : <><i className="fas fa-download"></i> Descargar periodos anteriores</>}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
