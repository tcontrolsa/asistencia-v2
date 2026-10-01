// Configuración del worker. Todo sale de variables de entorno (.env en el servidor, nunca en el repositorio).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: process.env.WORKER_ENV || path.join(RAIZ, '.env'), quiet: true });

const env = (k, def = '') => (process.env[k] ?? def).toString().trim();

export const config = {
  // Rol tcontrol_worker (migración 018): solo ejecuta private.worker_*
  dbUri: env('WORKER_DB_URI'),
  // 'simulacion' (por defecto): no llama a OpenWA, registra el envío como simulado. 'real': envía.
  modo: env('WHATSAPP_MODO', 'simulacion') === 'real' ? 'real' : 'simulacion',
  openwa: {
    url: env('OPENWA_URL'),                 // si falta, se usa la URL guardada en el panel
    apiKey: env('OPENWA_API_KEY'),
    sesion: env('OPENWA_SESION'),           // si falta, se toma la sesión lista de /api/sessions
  },
  // Lista opcional de números permitidos (pruebas): los demás se descartan sin enviar
  soloNumeros: env('WHATSAPP_SOLO_NUMEROS').split(',').map(x => x.replace(/\D/g, '')).filter(Boolean),
  pausaMs: Number(env('WHATSAPP_PAUSA_MS', '1200')),   // enviarNotificacionesMasivas: 1.2 s entre envíos
  sheets: {
    credenciales: env('GOOGLE_CREDENCIALES'),          // ruta al JSON de la cuenta de servicio
    hojaId: env('SHEETS_ID'),                           // ID del archivo de Google Sheets compartido con la cuenta
  },
  // Fase 7: proyecto Firebase del legado (lectura pública de registros y empleados)
  firestoreProyecto: env('FIRESTORE_PROYECTO', 'tcontrol-asistencia'),
  intervaloColaMs: Number(env('WORKER_INTERVALO_COLA_MS', '5000')),
  intervaloTareasMs: 60_000,
};
