import { s } from '../lib/estilo';

// Panel Master (renderAdminPage): accesos a los demás módulos
export function AdminPage() {
  const acceso = (url: string, icono: string, color: string, texto: string) => (
    <div className="col-6">
      <div className="glass-card text-center p-3 h-100" onClick={() => window.open(url, '_blank')} style={{ cursor: 'pointer' }}>
        <div className="mb-2"><i className={`fas ${icono} ${color}`} style={{ fontSize: 24 }}></i></div>
        <div className="fw-bold small">{texto}</div>
      </div>
    </div>
  );
  return (
    <div className="page">
      <div className="glass-card mb-4 text-center">
        <div className="admin-icon mb-2"><i className="fas fa-user-shield" style={s('font-size: 40px; color: var(--primary);')}></i></div>
        <h3 className="fw-bold mb-1">Panel Master</h3>
        <p className="text-muted small">Acceso centralizado a todos los módulos</p>
      </div>
      <div className="row g-3">
        {acceso('supervisor.html', 'fa-chart-line', 'text-primary', 'Supervisor')}
        {acceso('catering.html', 'fa-utensils', 'text-success', 'Catering')}
        {acceso('guardia.html', 'fa-shield-alt', 'text-danger', 'Guardia')}
        {acceso('admin_config.html', 'fa-cog', 'text-secondary', 'Configuración')}
        {acceso('diagnostico.html', 'fa-tools', 'text-warning', 'Diagnóstico')}
        {acceso('ubicacion.html', 'fa-map-marked-alt', 'text-info', 'Ubicación')}
      </div>
      <div className="mt-4 text-center"><small className="text-muted">Este panel es visible únicamente para el administrador del sistema.</small></div>
    </div>
  );
}
