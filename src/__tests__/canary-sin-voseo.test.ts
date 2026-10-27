// Canario: el copy de Golfers+ va en español chileno (tú), nunca con voseo
// argentino ("Copiá", "ejecutá", "podés"). Nació escaneando solo el panel del
// organizador y el flujo de torneos (auditoría 26-oct-2026), y eso dejó fuera
// justo donde más dolía: el 27-oct-2026 apareció el corpus del coach
// (`scripts/cerebro-v3/data/coaching/*.json`) redactado ENTERO en voseo, con
// 9 chunks ya vivos en producción, más prompts de sistema, descripciones de
// tools y un `aria-label` de la app en vos. Desde entonces escanea TODO el
// código productivo de `src/` y el corpus que el coach cita textualmente.
//
// Tres cosas que este canario aprendió a la mala y no hay que deshacer:
//  1. Los tests quedan fuera: un test del detector tiene que contener voseo
//     para probar que lo caza.
//  2. Qué queda fuera a propósito, medido con un barrido del repo completo el
//     27-oct-2026: los scripts de CLI (`scripts/*.mjs`), que le hablan al
//     desarrollador y no al golfista; los smokes del coach, donde el voseo es
//     la respuesta SIMULADA del modelo; `tests/regression/`, donde es el
//     `user_message` del jugador o el patrón que caza voseo en la salida del
//     modelo (mismo caso que number-guard, abajo); y los .md. Nada de eso se
//     publica como copy. Si alguno llega a la app, entra acá.
//  3. El voseo CITADO a propósito (los prompts que lo prohíben nombrando las
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
  // Toda la data del Cerebro V3, para que una carpeta nueva con prosa entre
  // sola al escaneo. El piso son los 5 JSON que hay hoy: 2 del corpus de
  // coaching + 3 de priors.
  { raiz: join('scripts', 'cerebro-v3', 'data'), ext: /\.json$/, minArchivos: 5 },
]

/**
 * El corpus que el coach CITA textualmente — su registro es el registro del
 * coach, porque es el texto que el modelo imita. Se exige por nombre y no solo
 * por el piso de la raíz: los 3 JSON de `priors` (números, sin una sola frase)
 * alcanzan para satisfacer ese piso, así que el corpus podía desaparecer del
 * escaneo —renombrado, movido, con otra extensión— sin poner nada rojo.
 */
const CORPUS_DEL_COACH = join('scripts', 'cerebro-v3', 'data', 'coaching')

/**
 * Voseo citado a propósito. Cada entrada permite SOLO esas formas, SOLO en ese
 * archivo, SOLO esa cantidad de veces y SOLO donde dice `ancla`, y el test exige
 * que el conteo calce exacto en los dos sentidos:
 *  - una de más es un hallazgo con su línea (el permiso no es barra libre en
 *    los 8 archivos más expuestos del coach: ahí viven los prompts, y un
 *    "tenés" nuevo colado en una instrucción al modelo se publica tal cual);
 *  - una de menos es deuda: o el archivo cambió de registro y la entrada sobra,
 *    o se movió y la excepción está tapando a otro archivo.
 * Los números se miden, no se estiman: salen del propio detector.
 *
 * `ancla` es lo que hace que el permiso sea del CONTEXTO y no del archivo: el
 * voseo permitido tiene que estar a la vista del texto que lo justifica (la
 * línea que prohíbe el voseo, el `userMessage` del jugador simulado). Sin
 * ancla, "tenés: 2" en un archivo de 900 líneas autoriza dos "tenés" en
 * cualquier parte, y en un archivo de prompts cualquier parte es una
 * instrucción que se publica. Se busca en la línea de la ocurrencia y las dos
 * anteriores, porque Prettier parte los template literals largos.
 */
const MENCIONES: {
  archivo: string
  formas: Record<string, number>
  ancla?: RegExp
  razon: string
}[] = [
  {
    archivo: 'src/golf/coach/number-guard.ts',
    formas: { tirás: 1, bajás: 1, hacés: 1, apuntá: 3, terminás: 1 },
    // Sin ancla a propósito, y es el único caso: acá el voseo no está citado
    // junto a una prohibición, está dentro de las listas de keywords y de los
    // comentarios del matcher, repartido por todo el archivo. No hay un texto
    // estable que lo justifique, así que lo que lo acota es el conteo exacto.
    razon:
      'El guard busca keywords de score en el texto que DEVUELVE el modelo. Si el ' +
      'modelo se va al voseo, el número hay que cazarlo igual, así que las dos ' +
      'variantes son parte del patrón.',
  },
  {
    archivo: 'src/golf/coach/prompts/identidad.ts',
    formas: { vos: 1, tenés: 1, mirá: 1, hacé: 1, podés: 1, jugás: 1 },
    ancla: /nunca de vos/i,
    razon: 'Es la línea del prompt que PROHÍBE el voseo, y lo prohíbe nombrando las formas.',
  },
  {
    archivo: 'src/golf/coach/v3/prompts/sections/conocer.ts',
    formas: { vos: 1, tenés: 1, mirá: 1, hacé: 1 },
    ancla: /nunca de vos|voseo/i,
    razon: 'Ídem: la instrucción de voz cita las formas prohibidas.',
  },
  {
    archivo: 'src/golf/coach/v3/prompts/sections/engagement.ts',
    formas: { vos: 1, tenés: 1, mirá: 1, hacé: 1, fijate: 1 },
    ancla: /nunca de vos|voseo/i,
    razon: 'Ídem: la instrucción de voz cita las formas prohibidas.',
  },
  {
    archivo: 'src/golf/coach/v3/onboarding.ts',
    formas: { vos: 1 },
    ancla: /nunca de vos/i,
    razon: '"háblale SIEMPRE de TÚ …, nunca de vos": la prohibición nombra el pronombre.',
  },
  {
    archivo: 'src/golf/coach/tools.ts',
    formas: { tenés: 1 },
    ancla: /bug P0 de campo/i,
    razon:
      'Comentario que cita el copy viejo del bug P0 de campo ("no tenés rondas", inbox ' +
      '09-jun): reescribirlo borraría el rastro de qué se arregló.',
  },
  {
    archivo: 'src/golf/coach/followups.ts',
    formas: { entrenás: 1 },
    ancla: /nunca voseo/i,
    razon:
      'El prompt de follow-ups prohíbe el voseo con un ejemplo: escribe "¿Cómo entreno…?", ' +
      'jamás "¿Cómo entrenás…?".',
  },
  {
    archivo: 'src/golf/coach/v3/exam/fixtures.ts',
    formas: { podés: 1, tenés: 2, decís: 1, vos: 1, sos: 1, sabés: 1, garantizás: 1, decime: 1 },
    ancla: /userMessage/,
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

/**
 * La línea de la ocurrencia y las dos anteriores. Dos y no una porque Prettier
 * parte los template literals largos, y el texto que justifica el voseo (la
 * prohibición, el `userMessage:`) queda arriba de la línea que lo contiene.
 */
function ventana(lineas: string[], linea: number): string {
  return lineas.slice(Math.max(0, linea - 3), linea).join('\n')
}

/** Rutas con `/` en los dos sistemas operativos, para poder compararlas. */
function normalizar(ruta: string): string {
  return ruta.split(sep).join('/')
}

describe('canario: el copy de Golfers+ no usa voseo', () => {
  it('ningún archivo productivo ni el corpus del coach usa voseo', () => {
    const hallazgos: string[] = []
    // `archivo|forma` → cuántas veces aparece de verdad, para contrastarlo con
    // lo declarado en MENCIONES cuando termine el escaneo.
    const conteos = new Map<string, number>()

    expect(
      archivos(CORPUS_DEL_COACH, /\.json$/).length,
      `el corpus que cita el coach (${CORPUS_DEL_COACH}) tiene que estar en el escaneo`,
    ).toBeGreaterThanOrEqual(2)

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
        const lineas = texto.split('\n')
        const rel = normalizar(ruta)
        const mencion = MENCIONES.find((m) => m.archivo === rel)
        const declaradas = mencion?.formas ?? {}
        for (const { forma, indice } of buscarVoseoDetallado(texto)) {
          const clave = forma.toLowerCase()
          const linea = lineaDe(texto, indice)
          // Fuera del contexto que la justifica, una forma declarada NO consume
          // cuota: es un hallazgo igual que una no declarada, y la cuota sigue
          // disponible para la ocurrencia legítima.
          if (mencion?.ancla && !mencion.ancla.test(ventana(lineas, linea))) {
            hallazgos.push(
              `${rel}:${linea} "${forma}" (declarada, pero lejos de ${mencion.ancla})`,
            )
            continue
          }
          const vez = (conteos.get(`${rel}|${clave}`) ?? 0) + 1
          conteos.set(`${rel}|${clave}`, vez)
          if (vez <= (declaradas[clave] ?? 0)) continue
          // La línea apunta a la ocurrencia que SOBRA, no a la primera: si
          // alguien agrega un "apuntá" nuevo, el canario señala el nuevo.
          hallazgos.push(
            `${rel}:${linea} "${forma}"` +
              (declaradas[clave] ? ` (${vez}ª vez; MENCIONES declara ${declaradas[clave]})` : ''),
          )
        }
      }
    }

    expect(hallazgos).toEqual([])

    const desajustadas = MENCIONES.flatMap(({ archivo, formas }) =>
      Object.entries(formas)
        .map(([forma, declaradas]) => {
          const reales = conteos.get(`${archivo}|${forma.toLowerCase()}`) ?? 0
          return reales === declaradas
            ? null
            : `${archivo} "${forma}": MENCIONES declara ${declaradas}, el escaneo encontró ${reales}`
        })
        .filter((d): d is string => d !== null),
    )
    expect(
      desajustadas,
      'el conteo de MENCIONES no calza: ajustar el número o borrar la entrada',
    ).toEqual([])
  })
})
