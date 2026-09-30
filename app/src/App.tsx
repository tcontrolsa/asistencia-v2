import { useEffect, useRef, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { alCerrarSesion, sesion } from './lib/api';
import { leerClaims } from './lib/sesion';
import { useContexto, useRegistros } from './lib/datos';
import { esCumpleanos } from './lib/formato';
import { AuthScreen } from './auth/AuthScreen';
import { ActualizarDatos, CambioObligatorio } from './auth/PantallasObligatorias';
import { EstadoAppProvider } from './app/Estado';
import { Layout } from './app/Layout';
import { celebrarCumpleanos, HomePage, IndicadorDistancia } from './pages/HomePage';
import { HistoryPage } from './pages/HistoryPage';
import { AlmuerzoPage } from './pages/AlmuerzoPage';
import { PagosPage } from './pages/PagosPage';
import { ExtrasPage } from './pages/ExtrasPage';
import { EstadoPage } from './pages/EstadoPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { verificarActualizacionForzada } from './pwa';

// Oculta el splash estático tras 2,8 s (hideSplash del legado)
function useOcultarSplash() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      const sp = document.getElementById('initialSplash');
      if (!sp) return;
      sp.classList.add('fade-out');
      window.setTimeout(() => sp.remove(), 650);
    }, 2800);
    return () => clearTimeout(t);
  }, []);
}

function Verificando() {
  return (
    <div className="page">
      <div className="glass-card text-center py-5">
        <div className="spinner-border text-primary mb-3" style={{ width: '3rem', height: '3rem' }} role="status"></div>
        <h5 className="fw-bold">Verificando sesión...</h5>
        <p className="text-muted">Por favor espera un momento</p>
      </div>
    </div>
  );
}

function AppAutenticada({ passwordReciente, onSalir }: { passwordReciente: string | null; onSalir: () => void }) {
  const qc = useQueryClient();
  const ctx = useContexto();
  // El historial muestra el período actual hasta que se piden los anteriores (descargarPeriodosAnteriores)
  const [todo, setTodo] = useState(false);
  const regs = useRegistros(null);
  const [debeCambiar, setDebeCambiar] = useState(() => !!leerClaims()?.debe_cambiar);
  const [datosListos, setDatosListos] = useState(false);
  const celebrado = useRef(false);

  useEffect(() => { if (ctx.data) verificarActualizacionForzada(ctx.data.forzar_actualizacion as number); }, [ctx.data]);
  useEffect(() => {
    if (ctx.data && !celebrado.current && esCumpleanos(ctx.data.empleado.fecha_nacimiento)) {
      celebrado.current = true;
      window.setTimeout(celebrarCumpleanos, 1000);
    }
  }, [ctx.data]);
  useEffect(() => { if (ctx.error && (ctx.error as { estado?: number }).estado === 401) onSalir(); }, [ctx.error, onSalir]);

  if (debeCambiar) {
    return <div className="app-container" style={{ display: 'flex' }}><div className="main-content">
      <CambioObligatorio nombre={leerClaims()?.usuario || ''} passwordActual={passwordReciente}
        onListo={() => { setDebeCambiar(false); qc.invalidateQueries(); }} />
    </div></div>;
  }
  if (!ctx.data) {
    return <div className="app-container" style={{ display: 'flex' }}><div className="main-content">
      {ctx.isError ? (
        <div className="page"><div className="glass-card text-center py-5">
          <h5 className="fw-bold">No se pudo conectar</h5>
          <p className="text-muted">{(ctx.error as Error).message}</p>
          <button className="btn btn-primary" onClick={() => ctx.refetch()}>Reintentar</button>
        </div></div>
      ) : <Verificando />}
    </div></div>;
  }
  if (!ctx.data.empleado.telefono && !datosListos) {
    return <div className="app-container" style={{ display: 'flex' }}><div className="main-content">
      <ActualizarDatos fechaNacimiento={ctx.data.empleado.fecha_nacimiento}
        onListo={async () => { await ctx.refetch(); setDatosListos(true); }} />
    </div></div>;
  }

  return (
    <EstadoAppProvider ctx={ctx.data} registros={regs.data || []} cargandoRegistros={regs.isLoading} passwordReciente={passwordReciente}>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/entrada" element={<Navigate to="/" replace />} />
            <Route path="/almuerzo" element={<AlmuerzoPage />} />
            <Route path="/resumen" element={<HistoryPage todoDescargado={todo} onDescargarTodo={async () => { setTodo(true); await regs.refetch(); }} />} />
            <Route path="/extras" element={ctx.data.empleado.puede_autorizar_extras ? <ExtrasPage /> : <Navigate to="/" replace />} />
            <Route path="/pagos" element={<PagosPage />} />
            <Route path="/estado" element={<EstadoPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="/master" element={ctx.data.empleado.es_admin ? <AdminPage /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </HashRouter>
      <IndicadorDistancia />
    </EstadoAppProvider>
  );
}

export function App() {
  useOcultarSplash();
  const qc = useQueryClient();
  const [autenticado, setAutenticado] = useState(() => !!leerClaims() && leerClaims()!.role !== 'guardia');
  const [passReciente, setPassReciente] = useState<string | null>(null);

  useEffect(() => {
    alCerrarSesion(() => { qc.clear(); setAutenticado(false); });
  }, [qc]);

  const salir = () => { sesion.cerrar(); qc.clear(); setAutenticado(false); };

  if (!autenticado) {
    return (
      <div className="app-container" style={{ display: 'flex' }}>
        <div className="status-bar"></div>
        <div className="main-content" id="mainContent">
          <AuthScreen onIngreso={(_r, pass) => { setPassReciente(pass); setAutenticado(true); }} />
        </div>
      </div>
    );
  }
  return <AppAutenticada passwordReciente={passReciente} onSalir={salir} />;
}
