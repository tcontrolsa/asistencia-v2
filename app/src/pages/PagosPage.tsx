import { useState } from 'react';
import { s } from '../lib/estilo';
import { useApp } from '../app/Estado';

// Roles de pago: enlace del empleado (D-10, antes en empleados.id_dispositivo) — renderPagosPage
export function PagosPage() {
  const { emp } = useApp();
  const [cargado, setCargado] = useState(false);
  const url = (emp.url_rol_pagos || '').trim();
  const tarjeta = 'background: white; border-radius: 24px; padding: 40px 20px; box-shadow: 0 12px 40px rgba(0,0,0,0.06); border: 1px solid rgba(255, 255, 255, 0.7);';

  if (!url) {
    return (
      <div className="page" style={s('padding-bottom: 30px; animation: fadeIn 0.35s ease;')}>
        <div className="glass-card text-center" style={s(tarjeta)}>
          <div style={s('font-size: 60px; margin-bottom: 20px;')}>📄</div>
          <h4 className="fw-bold mb-2" style={{ color: '#0f172a' }}>Roles de Pago</h4>
          <p className="text-muted" style={s('font-size: 14px; max-width: 320px; margin: 0 auto 24px; line-height: 1.5;')}>No se ha configurado su enlace de roles de pago en el sistema.</p>
          <div className="alert alert-info" style={s('font-size: 13px; max-width: 360px; margin: 0 auto; border-radius: 12px; background: rgba(59,130,246,0.05); border: 1px solid rgba(59,130,246,0.1); color: #1e3a8a;')}>
            <i className="fas fa-info-circle me-1"></i> Por favor, contacte con el departamento de Administración para vincular su cuenta.
          </div>
        </div>
      </div>
    );
  }

  const u = url.toLowerCase();
  const bloquea = ['sharepoint.com', 'onedrive.live.com', 'microsoft', 'office.com', 'login.microsoftonline.com'].some(x => u.includes(x));
  if (bloquea) {
    return (
      <div className="page" style={s('padding-bottom: 30px; animation: fadeIn 0.35s ease;')}>
        <div className="glass-card text-center" style={s(tarjeta)}>
          <div style={s('font-size: 60px; margin-bottom: 20px;')}>🔒</div>
          <h4 className="fw-bold mb-2" style={{ color: '#0f172a' }}>Rol de Pagos Protegido</h4>
          <p className="text-muted" style={s('font-size: 13.5px; max-width: 340px; margin: 0 auto 20px; line-height: 1.5;')}>El enlace configurado requiere iniciar sesión en Microsoft (OneDrive/SharePoint) y no permite mostrarse dentro de la aplicación debido a políticas de seguridad corporativas.</p>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-100 mb-3"
            style={s('max-width: 320px; margin: 0 auto; font-size: 14px; padding: 12px; border-radius: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(59,130,246,0.2); text-decoration: none; color: white;')}>
            <i className="fas fa-external-link-alt"></i> Ver Rol de Pagos
          </a>
          <div className="alert alert-warning text-start" style={s('font-size: 12px; max-width: 360px; margin: 0 auto; border-radius: 12px; line-height: 1.4; background: rgba(245,158,11,0.05); border: 1px solid rgba(245,158,11,0.15); color: #92400e;')}>
            <i className="fas fa-exclamation-triangle me-1"></i> <strong>Nota:</strong> Si se le solicita, ingrese sus credenciales corporativas para abrir y descargar el documento de forma segura.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={s('height: calc(100vh - 140px); display: flex; flex-direction: column; animation: fadeIn 0.35s ease; padding-bottom: 10px;')}>
      <div className="glass-card mb-2 d-flex justify-content-between align-items-center" style={s('padding: 12px 16px; border-radius: 16px; background: rgba(255,255,255,0.9); box-shadow: 0 2px 10px rgba(0,0,0,0.02); border: 1px solid rgba(255,255,255,0.7); flex-shrink: 0;')}>
        <h5 className="fw-bold mb-0" style={s('font-size: 15px; color: #0f172a; display: flex; align-items: center; gap: 8px;')}><i className="fas fa-file-invoice-dollar text-primary" style={{ fontSize: 16 }}></i> Roles de Pago</h5>
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={s('font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 8px; border: 1.5px solid #cbd5e1; color: #475569; background: white; transition: all 0.2s;')}>
          <i className="fas fa-external-link-alt me-1"></i> Abrir Externamente
        </a>
      </div>
      <div style={s('font-size: 11px; color: #854d0e; background: #fef9c3; border: 1px solid #fef08a; padding: 8px 12px; border-radius: 10px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; flex-shrink: 0; font-weight: 500;')}>
        <i className="fas fa-info-circle" style={s('font-size: 13px; color: #ca8a04;')}></i>
        <span>Si la pantalla se muestra en blanco o requiere iniciar sesión, usa el botón <strong>"Abrir Externamente"</strong>.</span>
      </div>
      <div style={s('flex: 1; position: relative; border-radius: 20px; overflow: hidden; background: #ffffff; border: 1px solid #e2e8f0; box-shadow: 0 8px 30px rgba(0,0,0,0.04);')}>
        {!cargado && (
          <div style={s('position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 10;')}>
            <div className="spinner-border text-primary" role="status" style={s('width: 30px; height: 30px; border-width: 3px;')}></div>
            <p className="text-muted mt-2 small" style={{ fontWeight: 500 }}>Cargando documento...</p>
          </div>
        )}
        <iframe src={url} title="Rol de pagos" style={s('width: 100%; height: 100%; border: none;')} onLoad={() => setCargado(true)}></iframe>
      </div>
    </div>
  );
}
