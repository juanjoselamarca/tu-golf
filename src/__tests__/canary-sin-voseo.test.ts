// Canario: el copy de Golfers+ va en español chileno (tú), nunca con voseo
// argentino ("Copiá", "ejecutá", "podés"). Nació escaneando solo el panel del
// organizador y el flujo de torneos (auditoría 26-oct-2026), y eso dejó fuera
// justo donde más dolía: el 27-oct-2026 apareció el corpus del coach
// (`scripts/cerebro-v3/data/coaching/*.json`) redactado ENTERO en voseo, con
// 9 chunks ya vivos en producción, más prompts de sistema, descripciones de
// tools y un `aria-label` de la app en vos. Desde entonces escanea TODO el
// código productivo de `src/` y el corpus que el coach cita textualmente.
//
// Dos cosas que este canario aprendió a la mala y no hay que deshacer:
//  1. Los tests quedan fuera: un test del detector tiene que contener voseo
//     para probar que lo caza.
//  2. El voseo CITADO a propósito (los prompts que lo prohíben nombrando las
//     formas, los keywords del number-guard, los mensajes del jugador
//     simulado) va en MENCIONES, no en un comentario `voseo-ok` en la línea:
//     esas líneas viven dentro de template literals que se le envían al
//     modelo, así que un comentario ahí se publicaría como parte del prompt.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
// La lista canónica de voseo vive en un .mjs que comparten los scripts y los tests.
import { buscarVoseoDetallado, lineaDe } from '../../scripts/lib/voseo.mjs'

/**
 * Qué se escanea. El mínimo por raíz existe para que el canario no pueda pasar
 * en vacío: si alguien mueve una carpeta o cambia una extensión, el escaneo
 * devolvería 0 archivos y 0 hallazgos, que es exactamente igual a "todo bien".
 */
const RAICES: { raiz: string; ext: RegExp; minArchivos: number }[] = [
  // Todo el código productivo. El voseo en un comentario también cuenta: la
  // última vez, un comentario con "vos hacés Y" era el EJEMPLO de cómo debía
  // hablarle el coach al jugador.
  { raiz: 'src', ext: /\.(tsx?|jsx?)$/, minArchivos: 800 },
  // El corpus del Cerebro V3. El coach lo cita textualmente, así que su
  // registro es el registro del coach: es la fuente que el modelo imita.
  { raiz: join('scripts', 'cerebro-v3', 'data'), ext: /\.json$/, minArchivos: 2 },
]

/**
 * Voseo citado a propósito. Cada entrada permite SOLO esas formas y SOLO en
 * ese archivo, y el test exige que siga encontrándolas: una excepción que dejó
 * de hacer falta pone el canario rojo en vez de quedarse para siempre.
 */
const MENCIONES: { archivo: string; formas: string[]; razon: string }[] = [
  {
    archivo: 'src/golf/coach/number-guard.ts',
    formas: ['tirás', 'bajás', 'hacés', 'apuntá', 'terminás'],
    razon:
      'El guard busca keywords de score en el texto que DEVUELVE el modelo. Si el ' +
      'modelo se va al voseo, el número hay que cazarlo igual, así que las dos ' +
      'variantes son parte del patrón.',
  },
  {
    archivo: 'src/golf/coach/prompts/identidad.ts',
    formas: ['vos', 'tenés', 'mirá', 'hacé', 'podés', 'jugás'],
    razon: 'Es la línea del prompt que PROHÍBE el voseo, y lo prohíbe nombrando las formas.',
  },
  {
    archivo: 'src/golf/coach/v3/prompts/sections/conocer.ts',
    formas: ['vos', 'tenés', 'mirá', 'hacé'],
    razon: 'Ídem: la instrucción de voz cita las formas prohibidas.',
  },
  {
    archivo: 'src/golf/coach/v3/prompts/sections/engagement.ts',
    formas: ['vos', 'tenés', 'mirá', 'hacé', 'fijate'],
    razon: 'Ídem: la instrucción de voz cita las formas prohibidas.',
  },
  {
    archivo: 'src/golf/coach/v3/onboarding.ts',
    formas: ['vos'],
    razon: '"háblale SIEMPRE de TÚ …, nunca de vos": la prohibición nombra el pronombre.',
  },
  {
    archivo: 'src/golf/coach/tools.ts',
    formas: ['tenés'],
    razon:
      'Comentario que cita el copy viejo del bug P0 de campo ("no tenés rondas", inbox ' +
      '09-jun): reescribirlo borraría el rastro de qué se arregló.',
  },
  {
    archivo: 'src/golf/coach/followups.ts',
    formas: ['entrenás'],
    razon:
      'El prompt de follow-ups prohíbe el voseo con un ejemplo: escribe "¿Cómo entreno…?", ' +
      'jamás "¿Cómo entrenás…?".',
  },
  {
    archivo: 'src/golf/coach/v3/exam/fixtures.ts',
    formas: ['podés', 'tenés', 'decís', 'vos', 'sos', 'sabés', 'garantizás'],
    razon:
      'Son los `userMessage` del examen: lo que ESCRIBE un jugador simulado, incluidos ' +
      'los casos hostiles. El jugador escribe como quiere; el coach es el que responde ' +
      'en chileno.',
  },
]

function archivos(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return nombre === '__tests__' ? [] : archivos(ruta, ext)
    const esTest = /\.(test|spec)\./.test(nombre)
    return ext.test(nombre) && !esTest ? [ruta] : []
  })
}

/** Rutas con `/` en los dos sistemas operativos, para poder compararlas. */
function normalizar(ruta: string): string {
  return ruta.split(sep).join('/')
}

describe('canario: el copy de Golfers+ no usa voseo', () => {
  it('ningún archivo productivo ni el corpus del coach usa voseo', () => {
    const hallazgos: string[] = []
    const mencionesVistas = new Set<string>()

    for (const { raiz, ext, minArchivos } of RAICES) {
      const revisados = archivos(raiz, ext)
      expect(revisados.length, `el escaneo de ${raiz} no puede pasar en vacío`).toBeGreaterThanOrEqual(
        minArchivos,
      )
      for (const ruta of revisados) {
        // El archivo ENTERO de una vez, y la línea se deriva del índice. Partirlo
        // en líneas y consultar línea por línea rompía las formas ambiguas: si
        // Prettier envuelve el JSX entre el clítico y el verbo ("…\n  Te\n
        // compartí la tarjeta"), la línea arranca en "compartí" sin su "te"
        // delante y el canario se ponía rojo con copy chileno impecable.
        const texto = readFileSync(ruta, 'utf8')
        const rel = normalizar(ruta)
        const permitidas = MENCIONES.find((m) => m.archivo === rel)?.formas.map((f) =>
          f.toLowerCase(),
        )
        for (const { forma, indice } of buscarVoseoDetallado(texto)) {
          if (permitidas?.includes(forma.toLowerCase())) {
            mencionesVistas.add(`${rel}|${forma.toLowerCase()}`)
            continue
          }
          hallazgos.push(`${rel}:${lineaDe(texto, indice)} "${forma}"`)
        }
      }
    }

    expect(hallazgos).toEqual([])

    // Una excepción que ya no se usa es deuda: o el archivo cambió de registro y
    // la entrada sobra, o se movió y la excepción está tapando otro archivo.
    const huerfanas = MENCIONES.flatMap(({ archivo, formas }) =>
      formas
        .filter((f) => !mencionesVistas.has(`${archivo}|${f.toLowerCase()}`))
        .map((f) => `${archivo} "${f}"`),
    )
    expect(huerfanas, 'menciones declaradas que ya no existen: borrar la entrada').toEqual([])
  })
})
