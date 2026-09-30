import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/500.css';
import '../styles/legacy-supervisor.css';
import '../styles/legacy-supervisor-inline.css';
import '../styles/extra.css';
import { usarClaveSesion } from '../lib/api';
import { SupervisorApp } from './SupervisorApp';
import { iniciarPwa } from '../pwa';

// Sesión propia del panel (SUPERVISOR_SESSION del legado), separada de la app del empleado
usarClaveSesion('TCONTROL_SESION_SUPERVISOR');

createRoot(document.getElementById('root')!).render(<StrictMode><SupervisorApp /></StrictMode>);

iniciarPwa();
