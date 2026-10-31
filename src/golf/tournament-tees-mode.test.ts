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
  origenDelTeeConCategoriasParciales,
  hayCategoriaSinTee,
} from './tournament-tees-mode'

/** El caso normal: TODAS las categorías del torneo tienen tee. */
const CON_CATEGORIA = { conTee: 2, total: 2 }
/** El caso medido en prod el 30-oct-2026: 9 torneos en un modo por categoría, sin ninguna con tee. */
const SIN_CATEGORIA = { conTee: 0, total: 3 }
/** Ni todas ni ninguna: el motor resuelve por la categoría DE CADA JUGADOR. */
const CATEGORIA_PARCIAL = { conTee: 1, total: 3 }
/** La consulta de categorías falló: no se sabe. */
const CATEGORIA_SIN_LEER = { conTee: null, total: 0 }

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
      expect(origenDelTeeDelTorneo(k, CON_CATEGORIA), k).toBe(ORIGEN_DEL_TEE_POR_MODO[k])
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
    expect(origenDelTeeDelTorneo('blanco', CON_CATEGORIA)).toBeNull()
    expect(origenDelTeeDelTorneo(null, CON_CATEGORIA)).toBeNull()
    expect(origenDelTeeDelTorneo('', CON_CATEGORIA)).toBeNull()
    // Sin categorías tampoco: un nombre de tee NO depende de ellas.
    expect(origenDelTeeDelTorneo('blanco', SIN_CATEGORIA)).toBeNull()
  })

  // Lo que de verdad pasa en esos 6 torneos: `resolvePlayerTee` encadena `players.tee_id` →
  // `categories.default_tee_color` → `tournaments.tees`, y en estos modos la última guarda el
  // MODO, que no matchea ningún nombre de tee. Devuelve `source:'none'` y
  // `compute-player-course-hcp` cae al rating de la CANCHA. Decirles "el tee sale de la categoría
  // de cada jugador" es prometer una categoría que no existe.
  it('sin ninguna categoría con tee, los modos por categoría avisan que el hándicap sale del rating de la cancha', () => {
    const porCategoria = TEES_MODE_KEYS.filter(k => !esModoDeTeesAsignadoAMano(k))
    expect(porCategoria.length).toBeGreaterThan(1)
    for (const k of porCategoria) {
      expect(origenDelTeeDelTorneo(k, SIN_CATEGORIA), k).toBe(ORIGEN_DEL_TEE_SIN_CATEGORIAS)
      expect(origenDelTeeDelTorneo(k, SIN_CATEGORIA), k).not.toMatch(/categoría de cada jugador/)
    }
  })

  it('el modo manual no depende de categorías: el tee lo escribe el panel en players.tee_id', () => {
    expect(origenDelTeeDelTorneo('manual', SIN_CATEGORIA)).toBe(ORIGEN_DEL_TEE_POR_MODO.manual)
    expect(origenDelTeeDelTorneo('manual', CON_CATEGORIA)).toBe(ORIGEN_DEL_TEE_POR_MODO.manual)
  })

  it('la prosa sin categorías no promete ni categoría ni panel: nombra el rating de la cancha', () => {
    expect(ORIGEN_DEL_TEE_SIN_CATEGORIAS).toMatch(/rating/i)
    expect(ORIGEN_DEL_TEE_SIN_CATEGORIAS).not.toMatch(/panel/i)
    expect(ORIGEN_DEL_TEE_SIN_CATEGORIAS).not.toMatch(/perfil/i)
  })

  // El hallazgo de la 6ª vuelta: la pantalla contaba "¿hay ALGUNA categoría con tee?" y con eso le
  // prometía la categoría a TODO el torneo. El motor no mira eso: `resolvePlayerTee` resuelve por la
  // categoría de cada jugador, así que con 1 categoría con tee y 2 sin él, los jugadores de esas 2
  // caen igual al rating de la cancha.
  it('con algunas categorías sin tee lo dice con los números, no promete la categoría a todos', () => {
    const prosa = origenDelTeeDelTorneo('per_player', CATEGORIA_PARCIAL)
    expect(prosa).toBe(origenDelTeeConCategoriasParciales(2, 3))
    expect(prosa).toMatch(/2 de las 3 categorías no tienen tee/)
    expect(prosa).toMatch(/rating general de la cancha/)
    // No es ninguna de las otras dos prosas: son tres estados distintos, no dos.
    expect(prosa).not.toBe(ORIGEN_DEL_TEE_POR_MODO.per_player)
    expect(prosa).not.toBe(ORIGEN_DEL_TEE_SIN_CATEGORIAS)
  })

  it('una sola categoría sin tee va en singular', () => {
    expect(origenDelTeeDelTorneo('mixed', { conTee: 2, total: 3 })).toMatch(/1 de las 3 categorías no tiene tee/)
  })

  it('el modo manual no mira el conteo ni en el caso parcial', () => {
    expect(origenDelTeeDelTorneo('manual', CATEGORIA_PARCIAL)).toBe(ORIGEN_DEL_TEE_POR_MODO.manual)
  })

  it('si no se pudo leer el conteo, no afirma nada: ni la categoría ni el rating', () => {
    const prosa = origenDelTeeDelTorneo('per_player', CATEGORIA_SIN_LEER)
    expect(prosa).toBe(ORIGEN_DEL_TEE_INDETERMINADO)
    expect(prosa).not.toMatch(/categoría de cada jugador/)
    expect(prosa).not.toBe(ORIGEN_DEL_TEE_SIN_CATEGORIAS)
  })
})

describe('hayCategoriaSinTee', () => {
  // El tee global es el ÚLTIMO eslabón de la cadena (`players.tee_id` → `categories.default_tee_color`
  // → `tournaments.tees`), así que rescata al que no tiene tee de categoría SIN pisarle el suyo al
  // que sí lo tiene: por eso la salida se ofrece también en el caso parcial.
  it('se ofrece el tee global cuando queda alguna categoría sin tee', () => {
    expect(hayCategoriaSinTee(SIN_CATEGORIA)).toBe(true)
    expect(hayCategoriaSinTee(CATEGORIA_PARCIAL)).toBe(true)
    expect(hayCategoriaSinTee({ conTee: 0, total: 0 })).toBe(true)
  })

  it('no se ofrece cuando todas tienen tee', () => {
    expect(hayCategoriaSinTee(CON_CATEGORIA)).toBe(false)
    expect(hayCategoriaSinTee({ conTee: 1, total: 1 })).toBe(false)
  })

  it('no se ofrece el arreglo de un problema que no se pudo confirmar', () => {
    expect(hayCategoriaSinTee(CATEGORIA_SIN_LEER)).toBe(false)
  })
})
