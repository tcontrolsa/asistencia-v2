import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import '@fontsource/outfit/900.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import '../styles/legacy-ubicacion.css';
import { usarClaveSesion } from '../lib/api';
import { UbicacionApp } from './UbicacionApp';
import { iniciarPwa } from '../pwa';

// Página exclusiva del supervisor: usa la sesión del panel (SUPERVISOR_SESSION del legado)
usarClaveSesion('TCONTROL_SESION_SUPERVISOR');

createRoot(document.getElementById('root')!).render(<StrictMode><UbicacionApp /></StrictMode>);

iniciarPwa();
