import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../styles/legacy-admin-config.css';
import { usarClaveSesion } from '../lib/api';
import { AdminConfigApp } from './AdminConfigApp';
import { iniciarPwa } from '../pwa';

// Exclusivo de Sup. Admin / Administrador con sesión del panel (SUPERVISOR_SESSION del legado)
usarClaveSesion('TCONTROL_SESION_SUPERVISOR');

createRoot(document.getElementById('root')!).render(<StrictMode><AdminConfigApp /></StrictMode>);

iniciarPwa();
