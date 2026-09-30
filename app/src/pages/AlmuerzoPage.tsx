import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { rpc } from '../lib/api';
import { s } from '../lib/estilo';
import { esCumpleanos } from '../lib/formato';
import { aMinutos, ahora, hoyStr, minutosDelDia, partes, sumarDias } from '../lib/reloj';
import { claves, useMenuSemanal, useMisSolicitudes } from '../lib/datos';
import type { Solicitud } from '../lib/tipos';
import { useApp } from '../app/Estado';
import { useUi } from '../ui/Ui';

// ───────── Cultura Tcontrol: pregunta del día antes del almuerzo ─────────
interface Pregunta { habilitada: boolean; id?: string; pilar?: string; clase_pilar?: string | null; icono_pilar?: string | null; pregunta?: string; opciones?: { letra: string; texto: string }[] }

function claveCultura() { return 'cultura_completada_hoy_' + hoyStr(); }

function QuizCultura({ onCompletar }: { onCompletar: () => void }) {
  const [q, setQ] = useState<Pregunta | null>(null);
  const [pista, setPista] = useState<string | null>(null);
  const [correcta, setCorrecta] = useState<number | null>(null);
  const [error, setError] = useState<number | null>(null);
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);

  useEffect(() => {
    rpc<Pregunta>('cultura_pregunta_del_dia').then(r => (r.habilitada ? setQ(r) : onCompletar())).catch(() => onCompletar());
  }, [onCompletar]);

  const responder = async (idx: number) => {
    if (bloqueado) return;
    const r = await rpc<{ correcta: boolean; pista: string }>('responder_cultura', { p_indice: idx });
    if (r.correcta) {
      setBloqueado(true);
      setCorrecta(idx);
      try { sessionStorage.setItem(claveCultura(), 'true'); } catch { /* */ }
      window.setTimeout(() => { setDesbloqueado(true); window.setTimeout(onCompletar, 650); }, 450);
    } else {
      setError(idx);
      window.setTimeout(() => setError(null), 600);
      setPista(r.pista);
    }
  };

  if (!q) return <div className="page" style={s('padding-bottom: 30px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 250px;')}><div className="spinner-border text-primary" role="status"></div></div>;

  return (
    <div className="page" style={{ paddingBottom: 30 }}>
      <div className="tcontrol-quiz-container">
        <div className="tcontrol-quiz-card">
          {desbloqueado ? (
            <div className="quiz-success-unlocked">
              <div className="quiz-trophy-icon"><i className="fas fa-utensils"></i></div>
              <h3 style={s('font-size:18px; font-weight:800; color:#0f172a; margin-bottom:6px;')}>¡Cultura Tcontrol Reforzada!</h3>
              <p style={s('font-size:12.5px; color:#64748b; margin:0 0 16px 0; max-width:320px; line-height:1.4;')}>Identidad validada con éxito. Cargando el menú de hoy...</p>
              <div className="spinner-border text-danger" style={s('width:24px; height:24px; border-width:2.5px;')} role="status"></div>
            </div>
          ) : (<>
            <div className="quiz-header-banner">
              <div className="quiz-header-top">
                <div className="quiz-brand-chip"><i className="fas fa-shield-alt" style={{ color: '#ef4444' }}></i> Cultura Tcontrol</div>
                <div className="quiz-step-badge"><i className="fas fa-calendar-day me-1"></i> Pregunta del Día</div>
              </div>
              <h3 className="quiz-header-title">Conoce nuestra Identidad</h3>
              <p className="quiz-header-subtitle">Responde la pregunta del día para ingresar al módulo de Almuerzo.</p>
              <div className="quiz-progress-track"><div className="quiz-progress-fill" style={{ width: '100%' }}></div></div>
            </div>
            <div className="quiz-body" id="quizBodyContainer">
              <div className={`quiz-pillar-pill ${q.clase_pilar || 'quiz-pillar-proposito'}`}>
                <span>{q.icono_pilar || '🎯'}</span><span>{q.pilar || 'Cultura Tcontrol'}</span>
              </div>
              <div className="quiz-question-text">{q.pregunta}</div>
              <div className="quiz-options-grid" id="quizOptionsGrid">
                {(q.opciones || []).map((op, idx) => (
                  <button key={idx} type="button" className={`quiz-option-card ${correcta === idx ? 'correct' : ''} ${error === idx ? 'wrong' : ''}`} onClick={() => responder(idx)}>
                    <div className="quiz-option-letter">{op.letra || String.fromCharCode(65 + idx)}</div>
                    <div className="quiz-option-text">{op.texto}</div>
                  </button>
                ))}
              </div>
              <div id="quizHintContainer">
                {correcta !== null ? (
                  <div className="quiz-hint-box" style={{ background: '#f0fdf4', borderColor: '#86efac' }}>
                    <div className="quiz-hint-icon" style={{ color: '#16a34a' }}><i className="fas fa-check-circle"></i></div>
                    <div className="quiz-hint-text" style={{ color: '#14532d' }}><strong>¡Excelente respuesta!</strong> Has validado la identidad corporativa de hoy.</div>
                  </div>
                ) : pista ? (
                  <div className="quiz-hint-box">
                    <div className="quiz-hint-icon"><i className="fas fa-lightbulb"></i></div>
                    {/* La pista del banco de preguntas trae <strong> (contenido administrado por supervisores) */}
                    <div className="quiz-hint-text" dangerouslySetInnerHTML={{ __html: pista.replace(/<(?!\/?strong>)[^>]*>/g, '') }}></div>
                  </div>
                ) : null}
              </div>
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}

// ───────── Modal de solicitud de invitados (abrirModalSolicitudInvitado) ─────────
function ModalSolicitud({ tipo, onCerrar, onEnviada }: { tipo: 'ALMUERZO_EXTRA' | 'REFRIGERIO'; onCerrar: () => void; onEnviada: () => void }) {
  const { ctx } = useApp();
  const ui = useUi();
  const hoy = hoyStr();
  const cAlm = aMinutos(ctx.invitados.corte_almuerzo_extra) ?? 580;
  const cSan = aMinutos(ctx.invitados.corte_sanduche) ?? 520;
  const almAbierto = minutosDelDia() <= cAlm;
  const sanAbierto = minutosDelDia() <= cSan;
  const isAlm = tipo === 'ALMUERZO_EXTRA';
  const [fecha, setFecha] = useState(isAlm && !almAbierto ? sumarDias(hoy, 1) : hoy);
  const [subtipo, setSubtipo] = useState<'REFRIGERIO_SANDUCHE' | 'REFRIGERIO_GALLETAS'>('REFRIGERIO_SANDUCHE');
  const [cantidad, setCantidad] = useState(1);
  const [empresa, setEmpresa] = useState('');
  const [invitado, setInvitado] = useState('');
  const [horaServ, setHoraServ] = useState('');
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);

  const esHoy = fecha === hoy, esFuturo = fecha > hoy;
  const sanDeshab = !isAlm && esHoy && !sanAbierto;
  useEffect(() => { if (sanDeshab) setSubtipo('REFRIGERIO_GALLETAS'); }, [sanDeshab]);
  const btnDeshab = (!esHoy && !esFuturo) || (isAlm && esHoy && !almAbierto);

  let alerta: { bg: string; color: string; borde: string; html: React.ReactNode } | null = null;
  if (esFuturo) alerta = { bg: '#f0fdf4', color: '#166534', borde: '#bbf7d0', html: <><i className="fas fa-calendar-check"></i> <strong>Solicitud anticipada:</strong> Las restricciones de horario rigen únicamente para solicitudes del mismo día.</> };
  else if (esHoy && isAlm) alerta = almAbierto
    ? { bg: '#eff6ff', color: '#1e40af', borde: '#bfdbfe', html: <><i className="fas fa-clock"></i> <strong>Mismo día:</strong> Solicitudes de hoy habilitadas hasta las 09:40.</> }
    : { bg: '#fef2f2', color: '#991b1b', borde: '#fecaca', html: <><i className="fas fa-exclamation-triangle"></i> <strong>Cerrado para hoy (09:40):</strong> Selecciona mañana o una fecha posterior para registrar tu pedido con anticipación.</> };
  else if (esHoy) alerta = sanAbierto
    ? { bg: '#eff6ff', color: '#1e40af', borde: '#bfdbfe', html: <><i className="fas fa-clock"></i> <strong>Mismo día:</strong> Sánduches disponibles hasta las 08:40.</> }
    : { bg: '#fffbeb', color: '#92400e', borde: '#fde68a', html: <><i className="fas fa-info-circle"></i> Sánduches para hoy cerraron a las 08:40. Para hoy se puede solicitar <strong>Break con Galletas</strong> (disp. TCONTROL) o seleccionar una fecha futura para sánduches.</> };
  else alerta = { bg: '#fef2f2', color: '#991b1b', borde: '#fecaca', html: <><i className="fas fa-ban"></i> No se permiten solicitudes para fechas pasadas.</> };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    ui.cargando(true);
    try {
      await rpc('crear_solicitud_invitado', {
        p_tipo: tipo, p_subtipo: isAlm ? 'ALMUERZO_EXTRA' : subtipo, p_fecha: fecha, p_cantidad: cantidad, p_invitado: invitado.trim(),
        p_empresa: empresa.trim() || 'TCONTROL', p_hora_servicio: horaServ || null, p_observaciones: obs.trim() || null,
      });
      ui.toast('¡Solicitud registrada correctamente!', 'success');
      onEnviada();
    } catch (err) {
      ui.toast('No se pudo registrar: ' + (err as Error).message, 'error');
    } finally { ui.cargando(false); setEnviando(false); }
  };

  const lbl = 'font-size: 11.5px; font-weight: 700; color: #334155; display: block; margin-bottom: 4px;';
  return (
    <div id="modalSolicitudInvitado" className="almuerzo-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="almuerzo-modal-card" style={s('max-width: 390px; text-align: left; padding: 22px 20px;')}>
        <button className="almuerzo-modal-close" onClick={onCerrar}>&times;</button>
        <div style={s('display: flex; align-items: center; gap: 10px; margin-bottom: 14px; border-bottom: 1.5px solid #f1f5f9; padding-bottom: 10px;')}>
          <div style={{ ...s('font-size: 26px; width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center;'), background: isAlm ? '#eff6ff' : '#fff7ed' }}>{isAlm ? '🍱' : '🥪'}</div>
          <div>
            <h6 style={s('font-weight: 800; color: #0f172a; margin: 0; font-size: 15px;')}>{isAlm ? 'Solicitar Almuerzo Extra' : 'Solicitar Refrigerio'}</h6>
            <span style={s('font-size: 11px; color: #64748b;')}>Para tus invitados o visitas en planta</span>
          </div>
        </div>
        <form onSubmit={enviar} style={s('display: flex; flex-direction: column; gap: 12px;')}>
          <div>
            <div style={s('display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;')}>
              <label style={s('font-size: 11.5px; font-weight: 700; color: #334155; margin: 0;')}><i className="fas fa-calendar-alt text-primary"></i> Fecha del Servicio *</label>
              <span style={s('font-size: 10px; font-weight: 700;')}>
                {esFuturo ? <span style={s('color: #15803d; background: #dcfce7; padding: 2px 7px; border-radius: 6px;')}>📅 Anticipado (Sin límite hoy)</span>
                  : esHoy ? <span style={s('color: #0369a1; background: #e0f2fe; padding: 2px 7px; border-radius: 6px;')}>⚡ Para hoy</span> : null}
              </span>
            </div>
            <input type="date" min={hoy} value={fecha} onChange={e => setFecha(e.target.value)} required className="form-control form-control-sm" style={s('font-size: 12.5px; border-radius: 8px; font-weight: 700;')} />
            {alerta && <div style={{ ...s('margin-top: 6px; font-size: 11px; border-radius: 6px; padding: 6px 8px;'), background: alerta.bg, color: alerta.color, border: `1px solid ${alerta.borde}` }}>{alerta.html}</div>}
          </div>
          {!isAlm && (
            <div>
              <label style={s('font-size: 11.5px; font-weight: 700; color: #334155; display: block; margin-bottom: 6px;')}>Tipo de Refrigerio</label>
              <div style={s('display: flex; flex-direction: column; gap: 6px;')}>
                <label style={{ ...s('display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; font-size: 12px; font-weight: 600;'), opacity: sanDeshab ? 0.5 : 1, cursor: sanDeshab ? 'not-allowed' : 'pointer' }}>
                  <input type="radio" name="subtipoRefrigerio" checked={subtipo === 'REFRIGERIO_SANDUCHE'} disabled={sanDeshab} onChange={() => setSubtipo('REFRIGERIO_SANDUCHE')} />
                  <span>🥪 Sánduche / Opción de cocina</span>
                  <span style={{ ...s('margin-left: auto; font-size: 10px; font-weight: 700;'), color: sanDeshab ? '#dc2626' : '#059669' }}>
                    {esFuturo ? 'Disponible anticipado' : sanDeshab ? 'Cerrado 08:40 hoy' : esHoy ? 'Hasta 08:40' : 'Disponible'}
                  </span>
                </label>
                <label style={s('display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; cursor: pointer; font-size: 12px; font-weight: 600;')}>
                  <input type="radio" name="subtipoRefrigerio" checked={subtipo === 'REFRIGERIO_GALLETAS'} onChange={() => setSubtipo('REFRIGERIO_GALLETAS')} />
                  <span>🍪 Break con Galletas TCONTROL</span>
                  <span style={s('margin-left: auto; font-size: 10px; color: #b45309; font-weight: 700;')}>Disponible</span>
                </label>
              </div>
            </div>
          )}
          <div style={s('display: grid; grid-template-columns: 1fr 2fr; gap: 10px;')}>
            <div>
              <label style={s(lbl)}>Cantidad</label>
              <input type="number" min={1} max={50} value={cantidad} onChange={e => setCantidad(parseInt(e.target.value, 10) || 1)} required className="form-control form-control-sm" style={s('font-size: 13px; font-weight: 700; border-radius: 8px; text-align: center;')} />
            </div>
            <div>
              <label style={s(lbl)}>Empresa / Visita</label>
              <input type="text" placeholder="Ej: Cliente / Proveedor" value={empresa} onChange={e => setEmpresa(e.target.value)} className="form-control form-control-sm" style={s('font-size: 12.5px; border-radius: 8px;')} />
            </div>
          </div>
          <div>
            <label style={s(lbl)}>Nombre del Invitado o Motivo *</label>
            <input type="text" required placeholder="Nombre de la persona que asiste" value={invitado} onChange={e => setInvitado(e.target.value)} className="form-control form-control-sm" style={s('font-size: 12.5px; border-radius: 8px;')} />
          </div>
          {!isAlm && (
            <div>
              <label style={s(lbl)}>Hora solicitada para servir</label>
              <input type="time" value={horaServ} onChange={e => setHoraServ(e.target.value)} className="form-control form-control-sm" style={s('font-size: 12.5px; border-radius: 8px;')} />
            </div>
          )}
          <div>
            <label style={s(lbl)}>Observaciones / Preferencias</label>
            <textarea rows={2} placeholder="Restricciones, ubicación en planta, etc." value={obs} onChange={e => setObs(e.target.value)} className="form-control form-control-sm" style={s('font-size: 12px; border-radius: 8px; resize: none;')} />
          </div>
          <div style={s('font-size: 10px; color: #64748b; background: #f8fafc; padding: 6px 8px; border-radius: 6px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 5px;')}>
            <i className="fas fa-file-invoice text-primary"></i>
            <span>Se registrará en el sistema con trazabilidad a tu usuario.</span>
          </div>
          <div style={s('display: flex; gap: 8px; margin-top: 6px;')}>
            <button type="button" onClick={onCerrar} className="btn btn-sm btn-light w-50" style={s('font-weight: 600; border-radius: 8px;')}>Cancelar</button>
            <button type="submit" disabled={btnDeshab || enviando} className={`btn btn-sm ${isAlm ? 'btn-primary' : 'btn-warning'} w-50`}
              style={{ ...s('font-weight: 700; border-radius: 8px;'), ...(isAlm ? {} : { color: 'white', background: '#f97316' }) }}>
              <i className="fas fa-paper-plane"></i> Enviar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ───────── Página de almuerzo (renderAlmuerzoPage) ─────────
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const CLAVES_DIA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

function esUsuarioTaller(area?: string | null, cargo?: string | null) {
  const n = (x?: string | null) => (x || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return n(area).includes('TALLER') || n(cargo).includes('TALLER');
}

export function AlmuerzoPage() {
  const app = useApp();
  const { ctx, emp, hoy } = app;
  const ui = useUi();
  const qc = useQueryClient();
  const cultura = ctx.cultura_habilitada && emp.cultura_habilitada;
  const [quizListo, setQuizListo] = useState(() => { try { return !cultura || sessionStorage.getItem(claveCultura()) === 'true'; } catch { return !cultura; } });
  const menu = useMenuSemanal();
  const fechaHoy = hoyStr();
  const solicitudes = useMisSolicitudes(emp.id, fechaHoy);
  const [modal, setModal] = useState<null | 'ALMUERZO_EXTRA' | 'REFRIGERIO'>(null);
  const [animKey, setAnimKey] = useState(0);
  const completarQuiz = useCallback(() => setQuizListo(true), []);

  if (!quizListo) return <QuizCultura onCompletar={completarQuiz} />;

  const cumple = esCumpleanos(emp.fecha_nacimiento);
  const almuerzo = hoy.almuerzo;
  const minDia = minutosDelDia();
  const limite = aMinutos(ctx.almuerzo.hora_limite) ?? 570;
  const limitePasado = ctx.almuerzo.activo && minDia > limite;
  const idx = partes(ahora()).diaSemana;
  const hoyMenu = menu.data?.[CLAVES_DIA[idx]];

  if (menu.isLoading) {
    return (
      <div className="page" style={s('padding-bottom: 30px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 250px;')}>
        <div className="spinner-border text-primary mb-2" role="status" style={s('width: 28px; height: 28px; border-width: 3px;')}></div>
        <p className="text-muted small" style={{ fontWeight: 500 }}>Cargando planificación de menú...</p>
      </div>
    );
  }
  if (menu.isError) {
    return (
      <div className="page" style={{ paddingBottom: 30 }}>
        <div className="glass-card text-center p-4">
          <div style={s('font-size: 32px; margin-bottom: 10px;')}>⚠️</div>
          <h6 className="fw-bold mb-2">Error al Cargar Menú</h6>
          <p className="text-muted small">{(menu.error as Error)?.message || 'No se pudo conectar con el servidor'}</p>
          <button className="btn btn-sm btn-primary" onClick={() => menu.refetch()} style={{ fontSize: 11 }}>Reintentar</button>
        </div>
      </div>
    );
  }

  const registrar = async (o: 'SI' | 'NO') => {
    ui.cargando(true);
    try {
      await rpc('cambiar_almuerzo', { p_opcion: o });
      ui.toast('Opción de almuerzo guardada', 'success');
      await qc.invalidateQueries({ queryKey: ['registros'] });
      setAnimKey(k => k + 1);
    } catch (e) {
      ui.toast('Error al guardar: ' + (e as Error).message, 'error');
    } finally { ui.cargando(false); }
  };

  const cancelarSolicitud = async (sol: Solicitud) => {
    const m = minutosDelDia();
    if (sol.fecha === fechaHoy) {
      if (sol.subtipo === 'ALMUERZO_EXTRA' && m > (aMinutos(ctx.invitados.corte_almuerzo_extra) ?? 580)) { ui.toast('El horario para modificar almuerzos de hoy expiró a las 09:40.', 'warning'); return; }
      if (sol.subtipo === 'REFRIGERIO_SANDUCHE' && m > (aMinutos(ctx.invitados.corte_sanduche) ?? 520)) { ui.toast('El horario para sánduches de hoy expiró a las 08:40.', 'warning'); return; }
    }
    if (!window.confirm('¿Seguro que deseas cancelar esta solicitud de invitado? Se retirará del pedido y se notificará a los Sup. Admin.')) return;
    ui.cargando(true);
    try {
      await rpc('cancelar_solicitud_invitado', { p_id: sol.id });
      ui.toast('Solicitud cancelada', 'info');
      await qc.invalidateQueries({ queryKey: claves.solicitudes(fechaHoy) });
    } catch (e) {
      ui.toast('Error: ' + (e as Error).message, 'error');
    } finally { ui.cargando(false); }
  };

  const esNo = almuerzo === 'NO' || almuerzo === 'FUERA';
  const isPlanta = almuerzo === 'SI' || almuerzo === 'PLANTA';
  const taller = esUsuarioTaller(emp.area, emp.cargo);
  const almExtraAbierto = minDia <= (aMinutos(ctx.invitados.corte_almuerzo_extra) ?? 580);
  const sanAbierto = minDia <= (aMinutos(ctx.invitados.corte_sanduche) ?? 520);
  const mias = (solicitudes.data || []).filter(x => x.estado !== 'CANCELADO');

  return (
    <div className="page" style={s('padding-bottom: 30px; animation: fadeIn 0.35s ease;')}>
      <div className="glass-card d-flex justify-content-between align-items-center" style={s('padding: 12px 16px; border-radius: 16px; background: rgba(255,255,255,0.9); box-shadow: 0 2px 10px rgba(0,0,0,0.02); border: 1px solid rgba(255,255,255,0.7); flex-shrink: 0; margin-bottom: 12px;')}>
        <h5 className="fw-bold mb-0" style={s('font-size: 15px; color: #0f172a; display: flex; align-items: center; gap: 8px;')}>
          <i className="fas fa-utensils text-primary" style={{ fontSize: 16 }}></i> Planificación de Almuerzo
        </h5>
      </div>

      {esNo ? (
        <div key={animKey} className="lunch-assembly-ad theme-no lunch-popup-entrance" id="lunchAssemblyAd">
          <div className="lunch-ad-ambient-glow"></div>
          <div className="lunch-ad-header"><div className="lunch-ad-status-pill"><span className="lunch-ad-beacon"></span><span>🏠 ALMUERZO FUERA DE PLANTA</span></div></div>
          <div className="outside-assembly-scene">
            <div className="outside-lunchbox-box">
              <div className="outside-item outside-item-1" title="Almuerzo"><div className="outside-icon-wrapper">🥪</div></div>
              <div className="outside-item outside-item-2" title="Bebida"><div className="outside-icon-wrapper">☕</div></div>
              <div className="outside-item outside-item-3" title="Fruta"><div className="outside-icon-wrapper">🍎</div></div>
            </div>
          </div>
          <div className="buen-provecho-banner"><span className="bp-sparkle">✨</span><span className="bp-text">¡Buen Provecho en tu Jornada!</span><span className="bp-sparkle">✨</span></div>
        </div>
      ) : (
        <div key={animKey} className={`lunch-assembly-ad ${cumple ? 'theme-cumple' : isPlanta ? 'theme-si' : 'theme-pendiente'} lunch-popup-entrance`} id="lunchAssemblyAd">
          <div className="lunch-ad-ambient-glow"></div>
          <div className="lunch-ad-header">
            <div className={`lunch-ad-status-pill ${isPlanta ? 'pill-planta-confirmado' : ''}`}>
              <span className="lunch-ad-beacon"></span>
              <span>{cumple ? '🎂 ¡Feliz Cumpleaños!' : isPlanta ? '🍽️ ALMUERZO EN PLANTA CONFIRMADO' : '⏳ RESERVA PENDIENTE'}</span>
            </div>
          </div>
          <div className="chef-kitchen-stage">
            <div className="chef-avatar-wrapper">
              <span className="chef-character">👨‍🍳</span>
              <div className="chef-action-bubble">
                <span className="bubble-act act-1">🥣 Sirviendo la sopa...</span>
                <span className="bubble-act act-2">🍱 Sirviendo el plato fuerte...</span>
                <span className="bubble-act act-3">🧃 Sirviendo la bebida...</span>
                <span className="bubble-act act-4">✨ ¡Listo para disfrutar!</span>
              </div>
            </div>
            <div className="kitchen-counter-tray">
              <div className="counter-station station-soup" title="1. Plato hondo: Sopa">
                <div className="deep-soup-plate">
                  <div className="soup-liquid-pool"><span className="soup-herb">🌿</span></div>
                  <div className="soup-ladle-motion">🥄</div>
                  <div className="soup-steam-waves"><span className="steam-line"></span><span className="steam-line"></span></div>
                </div>
              </div>
              <div className="counter-station station-main" title="2. Plato largo: Plato Fuerte">
                <div className="long-platter-dish">
                  <div className="platter-food food-rice" title="Arroz">🍚</div>
                  <div className="platter-food food-meat" title="Plato Fuerte">🥩</div>
                  <div className="platter-food food-salad" title="Ensalada">🥗</div>
                  <span className="platter-sparkle">✨</span>
                </div>
              </div>
              <div className="counter-station station-juice" title="3. Dispensador y Vaso de Jugo">
                <div className="juice-dispenser-unit">
                  <div className="dispenser-tank"><div className="dispenser-fluid"></div></div>
                  <div className="dispenser-spout"><div className="juice-pour-stream"></div></div>
                </div>
                <div className="dispenser-glass"><div className="glass-liquid-fill"></div><span className="glass-ice-straw">🥤</span></div>
              </div>
            </div>
          </div>
          <div className="buen-provecho-banner">
            <span className="bp-sparkle">✨</span><span className="bp-text">{cumple ? '¡Feliz Cumpleaños y Buen Provecho!' : '¡Buen Provecho!'}</span><span className="bp-sparkle">✨</span>
          </div>
        </div>
      )}

      {!cumple && (!limitePasado ? (
        <div className="glass-card text-center mb-3" style={s('border-radius: 16px; padding: 15px; background: rgba(255,255,255,0.8); border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.02);')}>
          <p className="text-muted small mb-2" style={{ fontWeight: 600 }}>¿Dónde vas a almorzar hoy?</p>
          <div style={s('display: flex; gap: 10px; justify-content: center; max-width: 320px; margin: 0 auto;')}>
            <button className={`btn btn-sm ${isPlanta ? 'btn-success' : 'btn-outline-success'} w-100`} onClick={() => registrar('SI')} style={s('font-size:12.5px; font-weight:700; padding:10px; border-radius:10px;')}>🏢 En Planta</button>
            <button className={`btn btn-sm ${esNo ? 'btn-danger' : 'btn-outline-danger'} w-100`} onClick={() => registrar('NO')} style={s('font-size:12.5px; font-weight:700; padding:10px; border-radius:10px;')}>🏠 Fuera</button>
          </div>
        </div>
      ) : (
        <div style={s('font-size: 11px; text-align: center; color: #64748b; font-weight: 600; margin-bottom: 15px; background: #f8fafc; padding: 8px; border-radius: 10px; border: 1px solid #e2e8f0;')}>
          <i className="fas fa-lock"></i> El tiempo límite para cambios ({ctx.almuerzo.hora_limite}) ha expirado
        </div>
      ))}

      {!taller && (
        <div className="glass-card mb-3" style={s('border-radius: 20px; padding: 16px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.02);')}>
          <div style={s('display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1.5px solid #f1f5f9; padding-bottom: 8px;')}>
            <h6 className="fw-bold mb-0" style={s('color: #0f172a; font-size: 13.5px; display: flex; align-items: center; gap: 7px;')}><span style={{ fontSize: 16 }}>🤝</span> Atención a Invitados y Visitas</h6>
            <span style={s('font-size: 10px; color: #64748b; font-weight: 600; background: #f8fafc; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 12px;')}>Catering</span>
          </div>
          <div style={s('display: grid; grid-template-columns: 1fr 1fr; gap: 10px;')}>
            <div style={{ ...s('background: #f8fafc; border-radius: 14px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; position: relative;'), border: `1px solid ${almExtraAbierto ? '#bfdbfe' : '#e2e8f0'}` }}>
              <div>
                <div style={s('display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;')}>
                  <span style={{ fontSize: 22 }}>🍱</span>
                  <span style={{ ...s('font-size: 9px; font-weight: 750; padding: 2px 6px; border-radius: 6px;'), background: almExtraAbierto ? '#dbeafe' : '#f1f5f9', color: almExtraAbierto ? '#1e40af' : '#64748b' }}>
                    {almExtraAbierto ? 'HOY HASTA 09:40' : 'HOY CERRADO · ANTICIPADO'}
                  </span>
                </div>
                <div style={s('font-weight: 700; font-size: 12.5px; color: #0f172a; line-height: 1.2; margin-bottom: 3px;')}>Almuerzo Extra</div>
                <p style={s('font-size: 10px; color: #64748b; margin: 0 0 8px 0; line-height: 1.3;')}>Para visitas o clientes en planta</p>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => setModal('ALMUERZO_EXTRA')} style={s('font-size: 11px; font-weight: 700; padding: 7px; border-radius: 8px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 5px;')}>
                <i className="fas fa-plus-circle"></i><span>{almExtraAbierto ? 'Solicitar' : 'Solicitar Anticipado'}</span>
              </button>
            </div>
            <div style={s('background: #f8fafc; border: 1px solid #fed7aa; border-radius: 14px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;')}>
              <div>
                <div style={s('display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;')}>
                  <span style={{ fontSize: 22 }}>🥪</span>
                  <span style={{ ...s('font-size: 9px; font-weight: 750; padding: 2px 6px; border-radius: 6px;'), background: sanAbierto ? '#ffedd5' : '#fef3c7', color: sanAbierto ? '#9a3412' : '#b45309' }}>
                    {sanAbierto ? 'SÁNDUCHE HOY 08:40' : 'ANTICIPADO / GALLETAS'}
                  </span>
                </div>
                <div style={s('font-weight: 700; font-size: 12.5px; color: #0f172a; line-height: 1.2; margin-bottom: 3px;')}>Refrigerios</div>
                <p style={s('font-size: 10px; color: #64748b; margin: 0 0 8px 0; line-height: 1.3;')}>{sanAbierto ? 'Sánduches u otras opciones' : 'Anticipados o Break con Galletas'}</p>
              </div>
              <button className="btn btn-sm" onClick={() => setModal('REFRIGERIO')} style={s('background: #f97316; color: white; border: none; font-size: 11px; font-weight: 700; padding: 7px; border-radius: 8px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 5px;')}>
                <i className="fas fa-plus-circle"></i><span>Solicitar</span>
              </button>
            </div>
          </div>
          {mias.length > 0 && (
            <div style={s('margin-top: 14px; border-top: 1px dashed #e2e8f0; padding-top: 12px;')}>
              <div style={s('font-size: 11px; font-weight: 750; color: #475569; text-transform: uppercase; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;')}>
                <span><i className="fas fa-calendar-check text-primary"></i> Mis Solicitudes Programadas ({mias.length})</span>
              </div>
              <div style={s('display: flex; flex-direction: column; gap: 8px;')}>
                {mias.map(x => {
                  const isAlm = x.tipo_solicitud === 'ALMUERZO_EXTRA' || x.subtipo === 'ALMUERZO_EXTRA';
                  const gall = x.subtipo === 'REFRIGERIO_GALLETAS';
                  const mismoDia = x.fecha === fechaHoy;
                  const puede = x.fecha > fechaHoy || (isAlm ? almExtraAbierto : (x.subtipo === 'REFRIGERIO_SANDUCHE' ? sanAbierto : true));
                  return (
                    <div key={x.id} style={s('background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px;')}>
                      <div style={s('flex: 1; min-width: 0;')}>
                        <div style={s('display: flex; align-items: center; gap: 6px; margin-bottom: 3px; flex-wrap: wrap;')}>
                          <span style={{ ...s('font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 6px;'), background: isAlm ? '#eff6ff' : gall ? '#fefce8' : '#ecfdf5', color: isAlm ? '#1d4ed8' : gall ? '#a16207' : '#047857' }}>
                            {isAlm ? '🍱' : gall ? '🍪' : '🥪'} {isAlm ? 'Almuerzo Extra' : gall ? 'Break Galletas' : 'Sánduche'} (x{x.cantidad})
                          </span>
                          <span style={{ ...s('font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 6px;'), background: mismoDia ? '#e0f2fe' : '#fef3c7', color: mismoDia ? '#0369a1' : '#b45309' }}>
                            <i className="fas fa-calendar-day"></i> {mismoDia ? 'Hoy' : x.fecha}
                          </span>
                          <span style={s('font-size: 10px; color: #94a3b8;')}><i className="fas fa-clock"></i> {x.hora || ''}</span>
                        </div>
                        <div style={s('font-size: 12px; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;')}>
                          {x.invitado || 'Invitado'} {x.empresa ? '· ' + x.empresa : ''}
                        </div>
                        {x.hora_servicio && <div style={s('font-size: 10.5px; color: #64748b;')}>Hora req: <strong>{x.hora_servicio}</strong></div>}
                      </div>
                      <div style={s('display: flex; align-items: center; gap: 6px;')}>
                        <span style={{ ...s('font-size: 9.5px; font-weight: 700; padding: 3px 8px; border-radius: 20px;'), background: x.estado === 'CONFIRMADO' ? '#dcfce7' : '#fef9c3', color: x.estado === 'CONFIRMADO' ? '#15803d' : '#854d0e' }}>
                          {x.estado === 'CONFIRMADO' ? '✓ Confirmado' : '⏳ Solicitado'}
                        </span>
                        {puede && (
                          <button onClick={() => cancelarSolicitud(x)} title="Cancelar Solicitud" style={s('border: none; background: #fee2e2; color: #dc2626; border-radius: 8px; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px;')}>
                            <i className="fas fa-times"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="glass-card mb-3" style={s('border-radius: 20px; padding: 18px 16px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.02);')}>
        <h6 className="fw-bold mb-3" style={s('color:#0f172a; font-size:14px; display:flex; align-items:center; gap:6px; border-bottom:1.5px solid #f1f5f9; padding-bottom:6px; margin:0 0 12px 0;')}>
          <i className="fas fa-utensils text-warning"></i> Menú de Hoy ({DIAS[idx]})
        </h6>
        <div style={s('display:flex; flex-direction:column; gap:10px;')}>
          {([['🍜', 'Sopa', hoyMenu?.sopa], ['🥩', 'Plato Fuerte', hoyMenu?.plato], ['🥤', 'Bebida', hoyMenu?.jugo]] as const).map(([ic, et, val]) => (
            <div key={et} style={s('display:flex; gap:10px; align-items:center;')}>
              <span style={s('font-size:22px; width:28px; text-align:center;')}>{ic}</span>
              <div>
                <span style={s('font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase; display:block; line-height:1;')}>{et}</span>
                <span style={s('font-size:13px; font-weight:600; color:#334155;')}>{val || 'No planificado'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card mb-3" style={s('border-radius: 20px; padding: 18px 16px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.02);')}>
        <h6 className="fw-bold mb-3" style={s('color:#0f172a; font-size:14px; display:flex; align-items:center; gap:6px; border-bottom:1.5px solid #f1f5f9; padding-bottom:6px; margin:0 0 12px 0;')}>
          <i className="fas fa-calendar-alt text-primary"></i> Menú de la Semana
        </h6>
        <div style={s('display:flex; flex-direction:column; gap:8px;')}>
          {DIAS.map((nombre, i) => {
            if (i === 0) return null;
            const dm = menu.data?.[CLAVES_DIA[i]];
            const esHoy = i === idx;
            return (
              <div key={nombre} style={{ ...s('padding: 8px 10px; border-radius: 10px;'), background: esHoy ? '#f0f9ff' : '#f8fafc', border: `1px solid ${esHoy ? '#bae6fd' : '#e2e8f0'}` }}>
                <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;')}>
                  <span style={{ ...s('font-size:12.5px; font-weight:700;'), color: esHoy ? '#0284c7' : '#334155' }}>{nombre}</span>
                  {esHoy && <span style={s('font-size:9px; background:#0284c7; color:white; padding:1px 6px; border-radius:6px; font-weight:700;')}>HOY</span>}
                </div>
                <div style={s('font-size:11.5px; color:#64748b; display:flex; flex-direction:column; gap:2px; line-height:1.3; padding-left:2px;')}>
                  <span>🥩 <strong>Plato:</strong> {dm?.plato || 'No planificado'}</span>
                  <span>🍜 <strong>Sopa:</strong> {dm?.sopa || 'No planificado'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modal && <ModalSolicitud tipo={modal} onCerrar={() => setModal(null)}
        onEnviada={async () => { setModal(null); await qc.invalidateQueries({ queryKey: claves.solicitudes(fechaHoy) }); }} />}
    </div>
  );
}
