import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../styles/legacy-catering.css';
import '../styles/extra.css';
import { usarClaveSesion } from '../lib/api';
import { CateringApp } from './CateringApp';
import { iniciarPwa } from '../pwa';

usarClaveSesion('TCONTROL_SESION_CATERING');

createRoot(document.getElementById('root')!).render(<StrictMode><CateringApp /></StrictMode>);

iniciarPwa();
