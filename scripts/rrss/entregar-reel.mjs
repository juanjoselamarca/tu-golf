#!/usr/bin/env node
// Entrega un reel para subirlo a Instagram: el único camino por el que el MP4 llega a Juanjo.
//
//   node scripts/rrss/entregar-reel.mjs <reel.mp4> <destino.mp4>
//
// Por qué existe: los reels hechos en Remotion (piezas 1 a 3, carpeta rrss-video, fuera del
// repo) no pasan por publicar.mjs ni por el expediente. Se renderizaban, se copiaban al
// Escritorio a mano y Juanjo los subía desde Chrome. En esa copia a mano nadie miraba la voz,
// y las piezas 2 y 3 salieron mudas (20 y 21-nov-2026). Ahora el archivo que se sube sale de
// acá o no sale: primero se mide la voz contra su manifiesto (`<reel>.voz.json`, ver
// voz-en-reel.mjs), después se copia y se comprueba que la copia tiene el mismo sha256 que lo
// medido. La hoja que va a Juanjo cita ese sha256; el revisor-rrss la contrasta.
import { copyFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { exigirVozEnReel, huellaArchivo } from './voz-en-reel.mjs'

/** Mide, copia y verifica. Revienta si el reel no lleva su voz o si la copia no es idéntica. */
export function entregarReel(origen, destino) {
  const informe = exigirVozEnReel(path.resolve(origen))
  copyFileSync(origen, destino)
  const copia = huellaArchivo(destino)
  if (copia !== informe.sha256)
    throw new Error(`La copia en ${destino} no es idéntica a lo medido (${copia} ≠ ${informe.sha256}).`)
  const registro = {
    entregado: new Date().toISOString(),
    origen: path.resolve(origen),
    destino: path.resolve(destino),
    sha256: informe.sha256,
    medicion: informe.lineas,
  }
  writeFileSync(path.resolve(origen).replace(/\.mp4$/i, '') + '.entrega.json', JSON.stringify(registro, null, 1))
  return registro
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [origen, destino] = process.argv.slice(2)
  if (!origen || !destino || !/\.mp4$/i.test(destino)) {
    console.error('uso: node scripts/rrss/entregar-reel.mjs <reel.mp4> <destino.mp4>')
    process.exit(2)
  }
  try {
    const r = entregarReel(origen, destino)
    console.log(r.medicion.join('\n'))
    console.log(`\nENTREGADO: ${r.destino}\nsha256: ${r.sha256} (cítalo en la hoja que va a Juanjo)`)
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}
