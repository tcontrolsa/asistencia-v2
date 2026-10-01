import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/800.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/fira-code/400.css';
import '../styles/legacy-visor.css';
import { usarClaveSesion } from '../lib/api';
import { VisorApp } from './VisorApp';

// Exclusivo de Sup. Admin / Administrador con la sesión del panel (SUPERVISOR_SESSION del legado)
usarClaveSesion('TCONTROL_SESION_SUPERVISOR');

createRoot(document.getElementById('root')!).render(<StrictMode><VisorApp /></StrictMode>);
