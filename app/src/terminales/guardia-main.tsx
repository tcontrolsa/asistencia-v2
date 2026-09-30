import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../styles/legacy-guardia.css';
import '../styles/extra.css';
import { usarClaveSesion } from '../lib/api';
import { GuardiaApp } from './GuardiaApp';
import { iniciarPwa } from '../pwa';

usarClaveSesion('TCONTROL_SESION_GUARDIA');

createRoot(document.getElementById('root')!).render(<StrictMode><GuardiaApp /></StrictMode>);

iniciarPwa();
