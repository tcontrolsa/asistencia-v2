import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/diagnostico.css';
import { usarClaveSesion } from '../lib/api';
import { DiagnosticoApp } from './DiagnosticoApp';
import { iniciarPwa } from '../pwa';

usarClaveSesion('TCONTROL_SESION_SUPERVISOR');

createRoot(document.getElementById('root')!).render(<StrictMode><DiagnosticoApp /></StrictMode>);

iniciarPwa();
