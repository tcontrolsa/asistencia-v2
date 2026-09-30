import { useEffect, useState } from 'react';
import { s } from '../lib/estilo';
import { hoyStr } from '../lib/reloj';
import { useUi } from './Ui';

// ───────── Foto ampliada (showPhotoModal) ─────────
export function ModalFoto({ url, onCerrar }: { url: string; onCerrar: () => void }) {
  const [error, setError] = useState(false);
  return (
    <div className="photo-modal" onClick={onCerrar}>
      {error
        ? <div style={{ color: 'white', textAlign: 'center' }}><i className="fas fa-image fa-4x mb-3"></i><br />No se pudo cargar la imagen</div>
        : <img src={url} onError={() => setError(true)} alt="" />}
    </div>
  );
}

// ───────── Detalle de insignia (mostrarDetalleInsignia) ─────────
export function ModalInsignia({ titulo, descripcion, icono, fondo, borde, onCerrar }:
  { titulo: string; descripcion: string; icono: string; fondo: string; borde: string; onCerrar: () => void }) {
  return (
    <div id="insigniaModal" className="almuerzo-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="almuerzo-modal-card" style={{ border: `2px solid ${borde}` }}>
        <button className="almuerzo-modal-close" onClick={onCerrar}>&times;</button>
        <div className="almuerzo-modal-header" style={{ marginTop: 10 }}>
          <div style={{ ...s('width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36px; margin: 0 auto 16px auto; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);'), background: fondo, border: `2.5px solid ${borde}` }}>
            {icono}
          </div>
          <h3 style={s('font-size: 20px; color: #0f172a; font-weight: 800; margin-bottom: 8px;')}>{titulo}</h3>
          <p style={s('font-size: 13.5px; color: #475569; line-height: 1.6; margin-bottom: 20px; padding: 0 10px;')}>{descripcion}</p>
        </div>
        <button className="btn btn-primary" onClick={onCerrar} style={s('font-size: 14px; padding: 10px 24px; border-radius: 12px; font-weight: 700; width: 100%;')}>
          Aceptar
        </button>
      </div>
    </div>
  );
}

// ───────── Aviso legal LOPDP (tcontrol_core.js → abrirModalAvisoPrivacidad, texto íntegro) ─────────
export function ModalAvisoPrivacidad({ onCerrar }: { onCerrar: () => void }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  const clausula = (n: number, fondo: string, color: string, titulo: string, texto: React.ReactNode) => (
    <div style={s('border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; background:#ffffff;')}>
      <h4 style={s('margin:0 0 8px; font-size:13px; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:8px;')}>
        <span style={{ ...s('width:22px; height:22px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; font-size:11px;'), background: fondo, color }}>{n}</span>
        {titulo}
      </h4>
      <p style={s('margin:0; font-size:12px; color:#475569;')}>{texto}</p>
    </div>
  );
  return (
    <div id="modalAvisoPrivacidadTcontrol" className="tcontrol-legal-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}
      style={s('position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.72); backdrop-filter:blur(4px); z-index:99999; display:flex; align-items:center; justify-content:center; padding:16px; box-sizing:border-box; animation:fadeIn 0.2s ease-out;')}>
      <div style={s("background:#ffffff; border-radius:20px; width:100%; max-width:680px; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); border:1px solid #e2e8f0; overflow:hidden; font-family:'Outfit',system-ui,-apple-system,sans-serif;")}>
        <div style={s('padding:18px 24px; background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#ffffff; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); flex-shrink:0;')}>
          <div style={s('display:flex; align-items:center; gap:12px;')}>
            <div style={s('width:40px; height:40px; border-radius:10px; background:linear-gradient(135deg, #dc2626 0%, #ef4444 100%); display:flex; align-items:center; justify-content:center; font-size:18px; color:#ffffff; box-shadow:0 4px 12px rgba(220,38,38,0.35);')}>
              <i className="fas fa-shield-halved"></i>
            </div>
            <div>
              <h3 style={s('margin:0; font-size:16px; font-weight:800; letter-spacing:-0.2px; color:#ffffff;')}>Aviso Legal y Protección de Datos</h3>
              <div style={s('font-size:11px; color:#94a3b8; margin-top:2px;')}>TCONTROL S.A. • Ley Orgánica de Protección de Datos Personales (Ecuador)</div>
            </div>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={s('background:rgba(255,255,255,0.1); border:none; color:#cbd5e1; width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:15px; transition:background 0.2s;')}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div style={s('padding:8px 24px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; gap:12px; flex-wrap:wrap; font-size:11px; font-weight:700; color:#475569; flex-shrink:0;')}>
          <span style={s('display:inline-flex; align-items:center; gap:5px; color:#0369a1;')}><i className="fas fa-gavel"></i> LOPDP Registro Oficial Sup. 459</span>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <span style={s('display:inline-flex; align-items:center; gap:5px; color:#15803d;')}><i className="fas fa-briefcase"></i> Código del Trabajo</span>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <span style={s('display:inline-flex; align-items:center; gap:5px; color:#7c3aed;')}><i className="fas fa-lock"></i> Uso Exclusivamente Laboral</span>
        </div>
        <div style={s('padding:20px 24px; overflow-y:auto; font-size:12.5px; line-height:1.6; color:#334155; display:flex; flex-direction:column; gap:16px;')}>
          <div style={s('background:#eff6ff; border-left:4px solid #3b82f6; padding:12px 16px; border-radius:8px; font-size:12px; color:#1e40af;')}>
            <strong>Declaración Institucional:</strong> TCONTROL S.A. garantiza la confidencialidad, integridad y uso estrictamente laboral de los datos personales de sus colaboradores, contratistas y usuarios, en estricto acatamiento a los principios de <em>Juridicidad, Finalidad, Proporcionalidad y Seguridad</em> establecidos en la legislación ecuatoriana.
          </div>
          {clausula(1, '#dbeafe', '#1d4ed8', 'Responsable del Tratamiento y Finalidad', <>
            El responsable del tratamiento de los datos es <strong>TCONTROL S.A.</strong>, domiciliada en la ciudad de Quito, Ecuador. Los datos personales recabados (nombres, cédula/ID, área, cargo, teléfono institucional, correos y registros de tiempo) son tratados de forma legítima bajo el Art. 7 (numerales 2 y 8) de la LOPDP para el cumplimiento del contrato individual de trabajo, verificación de jornada laboral ordinaria y suplementaria, cálculo de haberes y presentación de informes ante el Ministerio del Trabajo y el IESS.
          </>)}
          {clausula(2, '#fef3c7', '#b45309', 'Fotografía de Perfil (Sin Captura Biométrica)', <>
            La fotografía de perfil es cargada voluntariamente por el colaborador y se utiliza únicamente para identificarlo en su credencial digital y en los módulos internos de control (guardia, comedor y supervisión). <strong>El sistema no captura fotografías, selfies ni datos biométricos al momento de la marcación</strong>; la asistencia se valida con las credenciales personales, el dispositivo vinculado y la geolocalización puntual. <strong>TCONTROL S.A. no comercializa, no cede ni somete estos datos a algoritmos de perfilamiento con fines ajenos a la relación de trabajo.</strong>
          </>)}
          {clausula(3, '#dcfce7', '#15803d', 'Geolocalización GPS Puntual (Sin Rastreo Continuo)', <>
            Las coordenadas de latitud y longitud son leídas <em>únicamente en el segundo preciso en que el colaborador presiona el botón de marcación</em> (entrada, salida o retorno de campo) para validar que se encuentre dentro del radio de la empresa o en el perímetro del proyecto asignado. <strong>El sistema NO efectúa rastreo continuo, ni monitorea los desplazamientos del colaborador en tiempo real, ni recopila ubicaciones fuera del acto voluntario de registro.</strong>
          </>)}
          {clausula(4, '#f3e8ff', '#7e22ce', 'Conservación de Datos y Módulo de Desvinculaciones', <>
            Al concluir la relación laboral por cualquier causa, los datos personales e históricos de marcaciones, saldos de vacaciones y liquidaciones del colaborador son trasladados de las bases operativas activas al archivo pasivo de <strong>"DESVINCULADOS"</strong>. Esta custodia se realiza amparada en el Artículo 21 de la LOPDP para satisfacer exigencias de auditoría patronal, fiscal (SRI), previsional (IESS) y defensa jurídica por el plazo de prescripción legal contemplado en las leyes de la República del Ecuador.
          </>)}
          {clausula(5, '#fee2e2', '#b91c1c', 'Derechos del Titular (Derechos ARCO)', <>
            El titular de los datos personales podrá ejercer en cualquier momento sus derechos de <strong>Acceso, Rectificación, Actualización, Eliminación y Oposición</strong> contemplados en la LOPDP mediante comunicación dirigida al departamento de Talento Humano o a través de los canales institucionales de TCONTROL S.A., salvaguardando los límites temporales que la ley laboral y tributaria obligue a conservar.
          </>)}
        </div>
        <div style={s('padding:14px 24px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;')}>
          <span style={s('font-size:11px; color:#64748b;')}><i className="fas fa-lock" style={{ color: '#0284c7' }}></i> Tratamiento confidencial • TCONTROL 2026</span>
          <button type="button" onClick={onCerrar} style={s('padding:8px 20px; border-radius:10px; font-size:12px; font-weight:800; background:#0f172a; color:#ffffff; border:none; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1);')}>
            Entendido y Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────── Soporte por WhatsApp (abrirWhatsAppSoporte) ─────────
export function ModalSoporte({ nombre, id, area, numero, onCerrar }:
  { nombre: string; id: string; area?: string | null; numero: string; onCerrar: () => void }) {
  const ui = useUi();
  const [fecha, setFecha] = useState(hoyStr());
  const [detalle, setDetalle] = useState('');
  const enviar = () => {
    if (!detalle.trim()) { ui.toast('Por favor describe el incidente', 'warning'); return; }
    if (!fecha) { ui.toast('Por favor selecciona una fecha', 'warning'); return; }
    const [y, m, d] = fecha.split('-');
    let texto = '⚠️REPORTE DE INCIDENCIA ⚠️\nDATOS DEL COLABORADOR\n';
    texto += `• Nombre: ${nombre || 'No identificado'}\n• ID Empleado: ${id || '---'}\n`;
    if (area) texto += `• Área: ${area}\n`;
    texto += `\nDETALLE DEL CASO\n• Fecha: ${d}/${m}/${y}\n• Descripción: ${detalle.trim()}`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank');
    onCerrar();
  };
  return (
    <div id="support-modal" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}
      style={s('position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(15, 23, 42, 0.55); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 3000; padding: 15px; animation: fadeIn 0.25s ease;')}>
      <div style={s('background-color: white; border-radius: 20px; width: 100%; max-width: 390px; padding: 22px; box-shadow: 0 20px 40px rgba(15,23,42,0.15); border: 1px solid rgba(226, 232, 240, 0.8); display: flex; flex-direction: column; gap: 14px; animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);')}>
        <div style={s('display: flex; align-items: center; gap: 12px;')}>
          <div style={s('width: 42px; height: 42px; background: #e0f2fe; color: #0284c7; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;')}>
            <i className="fas fa-headset"></i>
          </div>
          <div style={{ textAlign: 'left' }}>
            <h6 style={s('margin: 0; font-weight: 800; color: #0f172a; font-size: 14.5px;')}>Soporte Técnico</h6>
            <span style={s('font-size: 11px; color: #64748b; font-weight: 600; display: block;')}>Reporte de Incidente / Ayuda</span>
          </div>
        </div>
        <div style={s('background: #f8fafc; border: 1.5px solid #f1f5f9; border-radius: 12px; padding: 10px 14px; font-size: 12px; color: #334155; text-align: left;')}>
          <div style={{ marginBottom: 2 }}><strong>Usuario:</strong> {nombre || 'No identificado'}</div>
          <div><strong>ID Empleado:</strong> {id || '---'}</div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <label style={s('font-weight: 700; font-size: 12px; color: #475569; margin-bottom: 6px; display: block;')}>Fecha del Incidente o Solicitud:</label>
          <input type="date" className="form-control" value={fecha} onChange={e => setFecha(e.target.value)}
            style={s('font-size: 13px; border-radius: 10px; border: 1.5px solid #cbd5e1; padding: 8px 10px; width: 100%; box-sizing: border-box;')} />
        </div>
        <div style={{ textAlign: 'left' }}>
          <label style={s('font-weight: 700; font-size: 12px; color: #475569; margin-bottom: 6px; display: block;')}>¿En qué te podemos ayudar?</label>
          <textarea id="soporte-detalle" autoFocus className="form-control" placeholder="Describe brevemente el inconveniente o solicitud..." value={detalle}
            onChange={e => setDetalle(e.target.value)}
            style={s('font-size: 13px; border-radius: 10px; border: 1.5px solid #cbd5e1; padding: 10px; min-height: 90px; width: 100%; box-sizing: border-box; resize: none;')} />
        </div>
        <div style={s('display: flex; gap: 10px;')}>
          <button className="btn btn-outline-secondary" onClick={onCerrar} style={s('flex: 1; font-size: 13px; padding: 10px; font-weight: 700; border-radius: 10px;')}>Cancelar</button>
          <button className="btn btn-success" onClick={enviar}
            style={s('flex: 1.3; font-size: 13px; padding: 10px; font-weight: 700; border-radius: 10px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; display: flex; align-items: center; justify-content: center; gap: 6px;')}>
            <i className="fab fa-whatsapp"></i> Enviar a WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
