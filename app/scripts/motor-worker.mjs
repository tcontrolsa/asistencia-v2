// Empaqueta el motor de cálculo del legado (D-24, src/supervisor/legado) para el worker de la Fase 7.
// Salida versionada: worker/src/generado/motor-legado.mjs. Volver a ejecutar si cambia el motor:
//   npm run motor:worker
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({
  stdin: {
    contents: `export * from './src/supervisor/legado/util';
               export * from './src/supervisor/legado/reportes';
               export { armarEmpleados } from './src/supervisor/store';`,
    resolveDir: app, loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', target: 'node18', logLevel: 'error',
  outfile: path.join(app, '..', 'worker', 'src', 'generado', 'motor-legado.mjs'),
  banner: { js: '// GENERADO por app/scripts/motor-worker.mjs desde app/src/supervisor/legado — no editar a mano.' },
  define: { 'import.meta.env.VITE_POSTGREST_URL': 'undefined', 'process.env.NODE_ENV': '"production"' },
});
console.log('Motor del legado generado en worker/src/generado/motor-legado.mjs');
