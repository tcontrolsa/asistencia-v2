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

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 5000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <UiProvider>
        <App />
      </UiProvider>
    </QueryClientProvider>
  </StrictMode>,
);

iniciarPwa();
