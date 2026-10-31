import { describe, it, expect } from 'vitest'
import {
  TEES_MODE_KEYS,
  esModoDeTees,
  esModoDeTeesAsignadoAMano,
  etiquetaDeTeesDelTorneo,
  origenDelTeeDelTorneo,
  ETIQUETA_MODO_DE_TEES,
  ORIGEN_DEL_TEE_POR_MODO,
  ORIGEN_DEL_TEE_SIN_CATEGORIAS,
  ORIGEN_DEL_TEE_INDETERMINADO,
  ORIGEN_DEL_TEE_SIN_INSCRITOS,
  ORIGEN_DEL_TEE_SIN_WHS,
  origenDelTeeConCategoriasParciales,
  origenDelTeeConJugadoresSinTee,
  hayJugadorSinTeeResoluble,
  type TeeDeCadaJugador,
} from './tournament-tees-mode'

/**
 * Un conteo con el caso normal por default, para que agregar un dato al conteo no obligue a tocar
 * quince fixtures. El default de `elTeeMueveElHandicap` es `true` —el torneo calcula con WHS, que
 * es el default de la columna y 26 de los 45 torneos de prod— y los tests de ese portón lo pasan
 * explícito.
 */
const conteo = (p: Partial<TeeDeCadaJugador> = {}): TeeDeCadaJugador => ({
  jugadoresSinTee: 0,
  categoriasConTee: 2,
  categoriasTotal: 2,
  elTeeMueveElHandicap: true,
  ...p,
})

/** El caso normal: todos los inscritos resuelven su tee y todas las categorías traen tee. */
const TODOS_CON_TEE: TeeDeCadaJugador = conteo()
/**
 * Un borrador sin inscritos todavía y sin ninguna categoría con tee. Medido en prod el
 * 31-oct-2026: de los 9 torneos en un modo por categoría sin ninguna categoría con tee, los de
 * usuarios son 2 borradores y 1 abierto. Nadie está afectado HOY, pero está roto para todos los
 * que lleguen.
 */
const SIN_CATEGORIA_NI_JUGADORES: TeeDeCadaJugador = conteo({ categoriasConTee: 0, categoriasTotal: 3 })
/** `lb-open-2026-padre-e-hijo`, medido en prod: 5 inscritos, 1 categoría y ninguna con tee. */
const JUGADORES_SIN_TEE: TeeDeCadaJugador = conteo({ jugadoresSinTee: 5, categoriasConTee: 0, categoriasTotal: 1 })
/** Todos los inscritos de hoy resuelven, pero quedan categorías vacías sin tee: el hueco es futuro. */
const CATEGORIA_PARCIAL: TeeDeCadaJugador = conteo({ categoriasConTee: 1, categoriasTotal: 3 })
/**
 * El hallazgo de la 7ª vuelta: TODAS las categorías tienen tee y hay un inscrito SIN categoría.
 * `players.category_id` es nullable y el camino está vivo (`enrollPlayer` acepta `categoryId` null).
 * Contando categorías esto daba "conTee === total" y la pantalla le prometía la categoría a un
 * jugador que no tiene ninguna.
 */
const JUGADOR_SIN_CATEGORIA: TeeDeCadaJugador = conteo({ jugadoresSinTee: 1 })
/**
 * Las dos consultas fallaron: no se sabe nada. `elTeeMueveElHandicap` también va en null porque es
 * el caso real de `leerTeeDeCadaJugador`: lo único que tumba los dos conteos a la vez es que falle
 * el contexto del motor, y de ese contexto sale el modo de cálculo.
 */
const SIN_LEER: TeeDeCadaJugador = conteo({
  jugadoresSinTee: null,
  categoriasConTee: null,
  categoriasTotal: 0,
  elTeeMueveElHandicap: null,
})
/**
 * `lb-open-2026-padre-e-hijo-mpleeet7`, medido en prod el 31-oct-2026: los mismos 5 inscritos sin
 * tee y la misma categoría sin tee que `JUGADORES_SIN_TEE`, pero el torneo calcula con
 * `hcp_calc_mode = 'raw'`. Ahí el tee no mueve el hándicap y los 5 puntúan con el hándicap de su
 * inscripción, así que no hay nada que avisar ni nada que un tee global pueda arreglar.
 */
const SIN_WHS: TeeDeCadaJugador = conteo({
  jugadoresSinTee: 5,
  categoriasConTee: 0,
  categoriasTotal: 1,
  elTeeMueveElHandicap: false,
})

describe('esModoDeTees', () => {
  it('reconoce los modos que escribe el wizard', () => {
    expect(esModoDeTees('per_player')).toBe(true)
    expect(esModoDeTees('manual')).toBe(true)
    expect(esModoDeTees('mixed')).toBe(true)
  })

  it('reconoce per_category (histórico: deriveTees ya no lo escribe)', () => {
    expect(esModoDeTees('per_category')).toBe(true)
  })

  it('un nombre de tee NO es un modo', () => {
    for (const tee of ['blanco', 'azul', 'negras', 'dorado', 'rojo', 'azul · norte / sur']) {
      expect(esModoDeTees(tee), tee).toBe(false)
    }
  })

  it('tolera espacios y mayúsculas (la columna es texto libre)', () => {
    expect(esModoDeTees('  Per_Player ')).toBe(true)
    expect(esModoDeTees('MANUAL')).toBe(true)
  })

  it('null, undefined y vacío no son un modo', () => {
    expect(esModoDeTees(null)).toBe(false)
    expect(esModoDeTees(undefined)).toBe(false)
    expect(esModoDeTees('')).toBe(false)
    expect(esModoDeTees('   ')).toBe(false)
  })

  it('no se cuelga de un valor raro que parezca un modo', () => {
    expect(esModoDeTees('per_playerx')).toBe(false)
    expect(esModoDeTees('tee manual')).toBe(false)
  })
})

describe('etiquetaDeTeesDelTorneo', () => {
  it('traduce cada modo', () => {
    expect(etiquetaDeTeesDelTorneo('per_player')).toBe('por jugador')
    expect(etiquetaDeTeesDelTorneo('per_category')).toBe('por categoría')
    expect(etiquetaDeTeesDelTorneo('manual')).toBe('asignación manual')
    expect(etiquetaDeTeesDelTorneo('mixed')).toBe('mixtos')
  })

  it('un nombre de tee sale con mayúscula inicial', () => {
    expect(etiquetaDeTeesDelTorneo('blanco')).toBe('Blanco')
    expect(etiquetaDeTeesDelTorneo('dorado')).toBe('Dorado')
  })

  it('hay etiqueta para TODOS los modos (no queda ninguno sin traducir)', () => {
    for (const k of TEES_MODE_KEYS) {
      expect(ETIQUETA_MODO_DE_TEES[k], k).toBeTruthy()
      expect(etiquetaDeTeesDelTorneo(k), k).toBe(ETIQUETA_MODO_DE_TEES[k])
    }
  })
})

describe('esModoDeTeesAsignadoAMano', () => {
  // El panel de jugadores solo renderiza `TeesAssignmentSection` en 'manual'.
  // Si esto dijera true para otro modo, "editar torneo" ofrecería un link a una
  // pantalla sin asignador: le prometeríamos al organizador algo que no existe.
  it('solo manual se asigna a mano', () => {
    expect(esModoDeTeesAsignadoAMano('manual')).toBe(true)
    expect(esModoDeTeesAsignadoAMano('per_player')).toBe(false)
    expect(esModoDeTeesAsignadoAMano('mixed')).toBe(false)
    expect(esModoDeTeesAsignadoAMano('per_category')).toBe(false)
  })

  it('un nombre de tee, null y vacío tampoco', () => {
    expect(esModoDeTeesAsignadoAMano('blanco')).toBe(false)
    expect(esModoDeTeesAsignadoAMano(null)).toBe(false)
    expect(esModoDeTeesAsignadoAMano(undefined)).toBe(false)
    expect(esModoDeTeesAsignadoAMano('')).toBe(false)
  })

  it('tolera espacios y mayúsculas, como la columna', () => {
    expect(esModoDeTeesAsignadoAMano('  Manual ')).toBe(true)
  })

  it('es un subconjunto estricto de los modos', () => {
    const aMano = TEES_MODE_KEYS.filter(k => esModoDeTeesAsignadoAMano(k))
    expect(aMano).toEqual(['manual'])
  })
})

describe('origenDelTeeDelTorneo', () => {
  it('explica de dónde sale el tee en cada modo', () => {
    for (const k of TEES_MODE_KEYS) {
      expect(ORIGEN_DEL_TEE_POR_MODO[k], k).toBeTruthy()
      expect(origenDelTeeDelTorneo(k, TODOS_CON_TEE), k).toBe(ORIGEN_DEL_TEE_POR_MODO[k])
    }
  })

  it('solo el modo manual manda al panel de jugadores', () => {
    const mencionanElPanel = TEES_MODE_KEYS.filter(k =>
      ORIGEN_DEL_TEE_POR_MODO[k].includes('panel de jugadores'),
    )
    expect(mencionanElPanel).toEqual(['manual'])
  })


  // Los dos canarios de la 3ª vuelta de revisión: la prosa decía "cada jugador juega
  // desde el tee de su perfil". El campo `profiles.default_tee_color` SÍ existe (lo
  // escribe `/api/perfil/default-tee` y lo leen la importación de tarjetas y el coach),
  // pero el motor del torneo NO lo mira: `resolve-player-tee.ts` deja `profiles` afuera
  // a propósito, porque anon no puede leer esa tabla y el handicap con que se puntúa no
  // puede depender de quién esté mirando la pantalla. Prometer en el torneo un mecanismo
  // que el motor no ejecuta es el mismo bug que este módulo vino a cerrar.
  // Si algún día se implementa 'per_player' (issue abierto), el tee del perfil se congela
  // en `players` al inscribirse — como ya se hace con `players.genero` — y la cadena sigue
  // sin leer `profiles`; recién entonces esta prosa puede cambiar.
  it('ninguna prosa promete un tee del perfil: el motor del torneo no lee profiles', () => {
    for (const k of TEES_MODE_KEYS) {
      expect(ORIGEN_DEL_TEE_POR_MODO[k], k).not.toMatch(/perfil/i)
    }
  })

  it('los modos sin asignación manual explican lo MISMO, porque el motor los resuelve igual', () => {
    // `resolvePlayerTee` no conoce el modo: siempre encadena `players.tee_id` →
    // `categories.default_tee_color` → `tournaments.tees`, y `tee_id` solo lo escribe
    // el panel del organizador (modo manual). Si alguien quiere prometerle algo
    // distinto a 'per_player', primero tiene que implementarlo.
    const sinAsignar = TEES_MODE_KEYS.filter(k => !esModoDeTeesAsignadoAMano(k))
    expect(sinAsignar.length).toBeGreaterThan(1)
    expect(new Set(sinAsignar.map(k => ORIGEN_DEL_TEE_POR_MODO[k])).size).toBe(1)
  })

  it('null si lo guardado es un nombre de tee y no un modo', () => {
    expect(origenDelTeeDelTorneo('blanco', TODOS_CON_TEE)).toBeNull()
    expect(origenDelTeeDelTorneo(null, TODOS_CON_TEE)).toBeNull()
    expect(origenDelTeeDelTorneo('', TODOS_CON_TEE)).toBeNull()
    // Sin categorías tampoco: un nombre de tee NO depende de ellas.
    expect(origenDelTeeDelTorneo('blanco', SIN_CATEGORIA_NI_JUGADORES)).toBeNull()
  })

  // Lo que de verdad pasa en esos torneos: `resolvePlayerTee` encadena `players.tee_id` →
  // `categories.default_tee_color` → `tournaments.tees`, y en estos modos la última guarda el
  // MODO, que no matchea ningún nombre de tee. Devuelve `source:'none'` y
  // `compute-player-course-hcp` cae al rating de la CANCHA. Decirles "el tee sale de la categoría
  // de cada jugador" es prometer una categoría que no existe.
  it('sin ninguna categoría con tee, los modos por categoría avisan que el hándicap sale del rating de la cancha', () => {
    const porCategoria = TEES_MODE_KEYS.filter(k => !esModoDeTeesAsignadoAMano(k))
    expect(porCategoria.length).toBeGreaterThan(1)
    for (const k of porCategoria) {
      expect(origenDelTeeDelTorneo(k, SIN_CATEGORIA_NI_JUGADORES), k).toBe(ORIGEN_DEL_TEE_SIN_CATEGORIAS)
      expect(origenDelTeeDelTorneo(k, SIN_CATEGORIA_NI_JUGADORES), k).not.toMatch(/categoría de cada jugador/)
    }
  })

  it('el modo manual no depende de categorías: el tee lo escribe el panel en players.tee_id', () => {
    expect(origenDelTeeDelTorneo('manual', SIN_CATEGORIA_NI_JUGADORES)).toBe(ORIGEN_DEL_TEE_POR_MODO.manual)
    expect(origenDelTeeDelTorneo('manual', TODOS_CON_TEE)).toBe(ORIGEN_DEL_TEE_POR_MODO.manual)
  })

  it('la prosa sin categorías no promete ni categoría ni panel: nombra el rating de la cancha', () => {
    expect(ORIGEN_DEL_TEE_SIN_CATEGORIAS).toMatch(/rating/i)
    expect(ORIGEN_DEL_TEE_SIN_CATEGORIAS).not.toMatch(/panel/i)
    expect(ORIGEN_DEL_TEE_SIN_CATEGORIAS).not.toMatch(/perfil/i)
  })

  // El hallazgo de la 8ª vuelta: esta prosa estaba en PRESENTE ("el hándicap sale del rating
  // general de la cancha") y a este caso se llega solo con `jugadoresSinTee === 0` —si hubiera
  // alguno sin tee gana `origenDelTeeConJugadoresSinTee`, que es más concreto—. O sea que afirmaba
  // un daño con CERO afectados: el mismo falso positivo que el aviso de las categorías parciales
  // vino a evitar, nada más que al revés.
  it('la prosa sin categorías habla de quien se inscriba, no de un daño que hoy no le pasa a nadie', () => {
    expect(ORIGEN_DEL_TEE_SIN_CATEGORIAS).toMatch(/quien se inscriba/)
    expect(ORIGEN_DEL_TEE_SIN_CATEGORIAS).toMatch(/sacará/)
    expect(ORIGEN_DEL_TEE_SIN_CATEGORIAS).not.toMatch(/\bsale\b|\bsaca\b|\bsacan\b/)
    expect(ORIGEN_DEL_TEE_SIN_CATEGORIAS).not.toMatch(/jugadores inscritos/)
  })

  // Y la razón de que vaya en futuro es estructural, no de gusto: la única forma de llegar a esta
  // prosa es con 0 jugadores afectados. Si algún día el orden de los casos cambiara y se pudiera
  // llegar con jugadores sin tee, esta prosa pasaría a quedarse corta y el test lo dice acá.
  it('a la prosa sin categorías solo se llega sin ningún jugador afectado', () => {
    for (const jugadoresSinTee of [0, 1, 5]) {
      const prosa = origenDelTeeDelTorneo('per_category', conteo({ jugadoresSinTee, categoriasConTee: 0, categoriasTotal: 2 }))
      if (jugadoresSinTee > 0) expect(prosa, String(jugadoresSinTee)).not.toBe(ORIGEN_DEL_TEE_SIN_CATEGORIAS)
      else expect(prosa).toBe(ORIGEN_DEL_TEE_SIN_CATEGORIAS)
    }
  })

  // El hallazgo de la 7ª vuelta, que es el de la 6ª un nivel más abajo: la unidad es el JUGADOR.
  // `players.category_id` es nullable, así que un inscrito sin categoría se queda sin tee aunque
  // TODAS las categorías del torneo tengan uno — y contando categorías la pantalla le prometía
  // justamente la categoría que no tiene.
  it('un jugador sin tee resoluble se avisa aunque todas las categorías tengan tee', () => {
    const prosa = origenDelTeeDelTorneo('per_category', JUGADOR_SIN_CATEGORIA)
    expect(prosa).toBe(origenDelTeeConJugadoresSinTee(1))
    expect(prosa).toMatch(/1 jugador inscrito no tiene tee/)
    expect(prosa).toMatch(/rating general de la cancha/)
    expect(prosa).not.toBe(ORIGEN_DEL_TEE_POR_MODO.per_category)
  })

  it('con varios jugadores sin tee el número y el verbo van en plural', () => {
    const prosa = origenDelTeeDelTorneo('per_player', JUGADORES_SIN_TEE)
    expect(prosa).toBe(origenDelTeeConJugadoresSinTee(5))
    expect(prosa).toMatch(/5 jugadores inscritos no tienen tee/)
    expect(prosa).toMatch(/sacan el hándicap/)
  })

  // Los jugadores pesan más que las categorías porque el daño es concreto: ya hay gente inscrita a
  // la que el motor no le resuelve el tee. Con 0 categorías con tee Y jugadores afectados, decir
  // "este torneo no tiene categorías con tee" es verdad pero más vago que decir cuántos son.
  it('el daño concreto le gana al hueco futuro: primero los jugadores, después las categorías', () => {
    expect(origenDelTeeDelTorneo('per_player', JUGADORES_SIN_TEE)).toBe(origenDelTeeConJugadoresSinTee(5))
    expect(origenDelTeeDelTorneo('per_player', JUGADORES_SIN_TEE)).not.toBe(ORIGEN_DEL_TEE_SIN_CATEGORIAS)
  })

  // El otro lado del mismo hallazgo: una categoría sin tee y sin ningún inscrito no le quita el tee
  // a nadie HOY, así que el aviso va en futuro. Decirle que hay jugadores sacando el hándicap del
  // rating de la cancha cuando no hay ninguno es un falso positivo.
  it('con todos los inscritos resueltos y categorías sin tee, el aviso habla de quien se inscriba', () => {
    const prosa = origenDelTeeDelTorneo('per_player', CATEGORIA_PARCIAL)
    expect(prosa).toBe(origenDelTeeConCategoriasParciales(2, 3))
    expect(prosa).toMatch(/2 de las 3 categorías no tienen tee/)
    expect(prosa).toMatch(/quien se inscriba/)
    // No afirma que haya jugadores afectados, porque no hay ninguno.
    expect(prosa).not.toMatch(/jugadores inscritos no tienen tee/)
    expect(prosa).not.toBe(ORIGEN_DEL_TEE_POR_MODO.per_player)
    expect(prosa).not.toBe(ORIGEN_DEL_TEE_SIN_CATEGORIAS)
  })

  it('una sola categoría sin tee va en singular', () => {
    const una: TeeDeCadaJugador = conteo({ categoriasTotal: 3 })
    expect(origenDelTeeDelTorneo('mixed', una)).toMatch(/1 de las 3 categorías no tiene tee/)
  })

  it('el modo manual no mira ningún conteo', () => {
    expect(origenDelTeeDelTorneo('manual', CATEGORIA_PARCIAL)).toBe(ORIGEN_DEL_TEE_POR_MODO.manual)
    expect(origenDelTeeDelTorneo('manual', JUGADOR_SIN_CATEGORIA)).toBe(ORIGEN_DEL_TEE_POR_MODO.manual)
    expect(origenDelTeeDelTorneo('manual', SIN_LEER)).toBe(ORIGEN_DEL_TEE_POR_MODO.manual)
  })

  // La asimetría del hallazgo de la 9ª vuelta: el daño CONTADO se avisa aunque el otro conteo
  // falle. "5 inscritos no tienen tee" es verdad sin saber una palabra de las categorías.
  it('con los jugadores contados, el aviso sale aunque las categorías no se hayan podido leer', () => {
    const prosa = origenDelTeeDelTorneo('per_player', { ...JUGADORES_SIN_TEE, categoriasConTee: null })
    expect(prosa).toBe(origenDelTeeConJugadoresSinTee(5))
    expect(prosa).not.toBe(ORIGEN_DEL_TEE_INDETERMINADO)
  })

  it('si no se pudo leer, no afirma nada: ni la categoría ni el rating', () => {
    const prosa = origenDelTeeDelTorneo('per_player', SIN_LEER)
    expect(prosa).toBe(ORIGEN_DEL_TEE_INDETERMINADO)
    expect(prosa).not.toMatch(/categoría de cada jugador/)
    expect(prosa).not.toBe(ORIGEN_DEL_TEE_SIN_CATEGORIAS)
  })

  // Una de las dos consultas basta para no poder afirmar: con los jugadores sin leer no se sabe si
  // alguno quedó sin tee, y con las categorías sin leer no se sabe qué le espera a quien se inscriba.
  // Pero el aviso nombra la consulta que FALLÓ, no la otra: mandar al organizador a mirar las
  // categorías cuando las categorías contestaron perfecto es mandarlo a donde no hay nada roto.
  it('alcanza con que falle UNA de las dos consultas, y se nombra la que falló', () => {
    expect(origenDelTeeDelTorneo('per_player', { ...TODOS_CON_TEE, jugadoresSinTee: null })).toBe(ORIGEN_DEL_TEE_SIN_INSCRITOS)
    expect(origenDelTeeDelTorneo('per_player', { ...TODOS_CON_TEE, categoriasConTee: null })).toBe(ORIGEN_DEL_TEE_INDETERMINADO)
    expect(ORIGEN_DEL_TEE_SIN_INSCRITOS).toMatch(/inscritos/)
    expect(ORIGEN_DEL_TEE_SIN_INSCRITOS).not.toMatch(/categorías/)
  })

  // La asimetría INVERSA a la de la 9ª vuelta, que esa vuelta no cerró: el hueco de las categorías
  // está CONFIRMADO y habla en futuro ("quien se inscriba"), así que es verdad sin saber nada de
  // los inscritos de hoy. Cortar por el conteo que falta lo escondía y encima culpaba a la consulta
  // que había respondido.
  it('con las categorías leídas, el hueco se avisa aunque los inscritos no se hayan podido contar', () => {
    const sinNinguna = origenDelTeeDelTorneo('per_player', { ...JUGADORES_SIN_TEE, jugadoresSinTee: null })
    expect(sinNinguna).toBe(ORIGEN_DEL_TEE_SIN_CATEGORIAS)
    const parcial = origenDelTeeDelTorneo('per_player', { ...CATEGORIA_PARCIAL, jugadoresSinTee: null })
    expect(parcial).toBe(origenDelTeeConCategoriasParciales(2, 3))
    // Y ninguna de las dos afirma nada de los inscritos, que es justo lo que no se pudo leer.
    for (const prosa of [sinNinguna, parcial]) {
      expect(prosa).not.toMatch(/inscritos no tienen tee/)
      expect(prosa).not.toBe(ORIGEN_DEL_TEE_INDETERMINADO)
    }
  })

  // El portón del modo de cálculo, que es el PRIMERO de la cadena del motor y este conteo tiraba:
  // `resolveScoringCourseHcp` solo aplica la fórmula WHS en 'whs'. Con 'raw' el neto sale de
  // `handicap_at_registration` sin mirar un rating, así que decirle al organizador que sus 5
  // inscritos "sacan el hándicap del rating general de la cancha" es falso. Vivo en prod el
  // 31-oct-2026: 19 torneos en 'raw', 2 de ellos en un modo de asignación.
  it('sin WHS no afirma que el tee mueva el hándicap, aunque haya 5 inscritos sin tee', () => {
    const prosa = origenDelTeeDelTorneo('per_player', SIN_WHS)
    expect(prosa).toBe(ORIGEN_DEL_TEE_SIN_WHS)
    expect(prosa).not.toMatch(/rating general de la cancha/)
    expect(prosa).not.toBe(origenDelTeeConJugadoresSinTee(5))
    // El mismo conteo CON WHS sí lo avisa: el portón es lo único que cambia el veredicto.
    expect(origenDelTeeDelTorneo('per_player', { ...SIN_WHS, elTeeMueveElHandicap: true }))
      .toBe(origenDelTeeConJugadoresSinTee(5))
  })

  // Y el portón no se traga los otros casos: con el modo sin leer la prosa sigue siendo la de
  // siempre. Un `elTeeMueveElHandicap` null no es un "no mueve".
  it('con el modo de cálculo sin leer, el conteo manda igual', () => {
    expect(origenDelTeeDelTorneo('per_player', { ...JUGADORES_SIN_TEE, elTeeMueveElHandicap: null }))
      .toBe(origenDelTeeConJugadoresSinTee(5))
  })
})

describe('hayJugadorSinTeeResoluble', () => {
  // El tee global es el ÚLTIMO eslabón de la cadena (`players.tee_id` → `categories.default_tee_color`
  // → `tournaments.tees`), así que rescata al que no tiene tee SIN pisarle el suyo al que sí lo
  // tiene: por eso la salida se ofrece también en los casos parciales.
  it('se ofrece el tee global cuando queda alguien sin tee, hoy o mañana', () => {
    expect(hayJugadorSinTeeResoluble(SIN_CATEGORIA_NI_JUGADORES)).toBe(true)
    expect(hayJugadorSinTeeResoluble(JUGADORES_SIN_TEE)).toBe(true)
    expect(hayJugadorSinTeeResoluble(CATEGORIA_PARCIAL)).toBe(true)
    expect(hayJugadorSinTeeResoluble(JUGADOR_SIN_CATEGORIA)).toBe(true)
    expect(hayJugadorSinTeeResoluble(conteo({ categoriasConTee: 0, categoriasTotal: 0 }))).toBe(true)
  })

  it('no se ofrece cuando la cadena resuelve el tee de todos', () => {
    expect(hayJugadorSinTeeResoluble(TODOS_CON_TEE)).toBe(false)
    expect(hayJugadorSinTeeResoluble(conteo({ categoriasConTee: 1, categoriasTotal: 1 }))).toBe(false)
  })

  it('no se ofrece el arreglo de un problema que no se pudo confirmar', () => {
    expect(hayJugadorSinTeeResoluble(SIN_LEER)).toBe(false)
    // Con los jugadores leídos y 0 sin tee, lo que falta es el futuro: no se afirma un hueco que
    // no se pudo contar.
    expect(hayJugadorSinTeeResoluble({ ...TODOS_CON_TEE, categoriasConTee: null })).toBe(false)
    // Y con las categorías leídas y todas con tee, lo que falta son los inscritos.
    expect(hayJugadorSinTeeResoluble({ ...TODOS_CON_TEE, jugadoresSinTee: null })).toBe(false)
  })

  // Sin WHS el tee no mueve ningún neto: ofrecer un tee para todo el torneo sería ofrecer un
  // arreglo que no arregla nada, con 5 inscritos sin tee y todo.
  it('no se ofrece cuando el tee no mueve el hándicap', () => {
    expect(hayJugadorSinTeeResoluble(SIN_WHS)).toBe(false)
    expect(hayJugadorSinTeeResoluble({ ...SIN_WHS, elTeeMueveElHandicap: true })).toBe(true)
  })

  // El hallazgo de la 9ª vuelta: las dos consultas son independientes y la que SÍ se leyó manda.
  // Cortar por "no pudimos leer las categorías" escondía 5 jugadores contados sin tee y le quitaba
  // al organizador el botón que los rescata — y el tee global no necesita saber nada de categorías.
  it('se ofrece con los jugadores contados aunque las categorías no se hayan podido leer', () => {
    expect(hayJugadorSinTeeResoluble({ ...JUGADORES_SIN_TEE, categoriasConTee: null })).toBe(true)
  })

  // Y al revés, que es el hallazgo de la 10ª: el hueco de las categorías alcanza aunque los
  // inscritos no se hayan podido contar. Antes se cortaba por el dato que falta y la pantalla
  // quedaba avisando un hueco sin el botón que lo arregla.
  it('se ofrece con las categorías leídas aunque los inscritos no se hayan podido contar', () => {
    expect(hayJugadorSinTeeResoluble({ ...JUGADORES_SIN_TEE, jugadoresSinTee: null })).toBe(true)
    expect(hayJugadorSinTeeResoluble({ ...CATEGORIA_PARCIAL, jugadoresSinTee: null })).toBe(true)
  })

  // La prosa y la salida tienen que coincidir: si la pantalla avisa que alguien se queda sin tee,
  // el botón que lo arregla tiene que estar ahí, y si no avisa nada no debe aparecer. Que los dos
  // salgan del mismo dato no garantiza que concuerden — los predicados son distintos.
  it('la salida se ofrece exactamente cuando la prosa avisa un problema', () => {
    const casos: TeeDeCadaJugador[] = [
      TODOS_CON_TEE,
      SIN_CATEGORIA_NI_JUGADORES,
      JUGADORES_SIN_TEE,
      CATEGORIA_PARCIAL,
      JUGADOR_SIN_CATEGORIA,
      SIN_LEER,
      SIN_WHS,
      // Los casos asimétricos: una consulta leída y la otra no, de los dos lados.
      { ...JUGADORES_SIN_TEE, categoriasConTee: null },
      { ...TODOS_CON_TEE, categoriasConTee: null },
      { ...JUGADORES_SIN_TEE, jugadoresSinTee: null },
      { ...CATEGORIA_PARCIAL, jugadoresSinTee: null },
      { ...TODOS_CON_TEE, jugadoresSinTee: null },
      { ...SIN_WHS, elTeeMueveElHandicap: true },
    ]
    // Las prosas que NO piden arreglo: la del modo cuando todo resuelve, las dos de "no pudimos
    // leer" y la del torneo que no calcula con WHS.
    const noPideArreglo = [
      ORIGEN_DEL_TEE_POR_MODO.per_player,
      ORIGEN_DEL_TEE_INDETERMINADO,
      ORIGEN_DEL_TEE_SIN_INSCRITOS,
      ORIGEN_DEL_TEE_SIN_WHS,
    ]
    for (const caso of casos) {
      const prosa = origenDelTeeDelTorneo('per_player', caso)
      const avisaProblema = !noPideArreglo.includes(prosa as string)
      expect(hayJugadorSinTeeResoluble(caso), JSON.stringify(caso)).toBe(avisaProblema)
    }
  })
})
