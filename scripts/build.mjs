#!/usr/bin/env node
/**
 * scripts/build.mjs — `next build` con UN reintento, solo ante la falla conocida de
 * Google Fonts.
 *
 * Por qué: `next/font/google` descarga las fuentes en cada build y ~1 de cada 60 veces
 * Google responde URLs `/l/font?kit=` sin extensión → el build falla con un error de
 * `next/font/google` (bug upstream vercel/next.js#99114, abierto desde 23-sep-2026).
 * Pasó el 27-sep (Next 16.3.5) y el 02-oct (16.3.8). Al rebuildear se va.
 *
 * Por qué no auto-hospedar las fuentes (evaluado 02-oct): next/font/local las registra
 * con el nombre de la variable (`dmSans`), no con el real (`DM Sans`), y la app usa el
 * nombre real en ~286 lugares → todo caía a fuentes del sistema (detectado comparando
 * prod vs local a 390px). Migrarlo es un cambio de riesgo medio en todas las pantallas
 * para una falla que el usuario nunca ve (un deploy fallido deja prod en la versión
 * anterior).
 *
 * Cualquier OTRO error falla al primer intento: el reintento no tapa bugs reales.
 * Quitar este wrapper cuando se cierre vercel/next.js#99114.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const GOOGLE_FONTS_FLAKE = /next\/font\/google|fonts\.(googleapis|gstatic)\.com|Failed to fetch .* from Google Fonts/i;

/** ¿La salida de un build fallido corresponde a la falla transitoria de Google Fonts? */
export function isGoogleFontsFlake(output) {
  return GOOGLE_FONTS_FLAKE.test(String(output || ''));
}

function runBuild() {
  const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(process.execPath, [nextBin, 'build', ...process.argv.slice(2)], { stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { output += d; process.stdout.write(d); });
    child.stderr.on('data', (d) => { output += d; process.stderr.write(d); });
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

async function main() {
  const first = await runBuild();
  if (first.code === 0) return 0;
  if (!isGoogleFontsFlake(first.output)) return first.code;

  process.stderr.write('\n[build] Falla transitoria de Google Fonts (vercel/next.js#99114). Reintentando una vez...\n\n');
  const second = await runBuild();
  return second.code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code));
}
