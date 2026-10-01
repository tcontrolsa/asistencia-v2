import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles/legacy-index.css';
import './styles/extra.css';
import { App } from './App';
import { UiProvider } from './ui/Ui';
import { iniciarPwa } from './pwa';
import { usarSesionSimulada } from './lib/api';

// Vista simulada desde visor_empleado.html: token de solo lectura en el fragmento (no llega al servidor ni se guarda)
const simulada = window.location.hash.match(/^#simular=(.+)$/);
if (simulada) {
  usarSesionSimulada(decodeURIComponent(simulada[1]));
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 5000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <UiProvider>
        {simulada && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999, background: '#f59e0b', color: '#1f2937', fontSize: 11,
            fontWeight: 700, textAlign: 'center', padding: '3px 6px' }}>
            <i className="fas fa-eye"></i> VISTA SIMULADA · SOLO LECTURA
          </div>
        )}
        <App />
      </UiProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// La vista simulada no registra el service worker (evita recargas forzadas dentro del simulador)
if (!simulada) iniciarPwa();
