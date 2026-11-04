import { describe, it, expect } from 'vitest'
import {
  candadosDeConfiguracion,
  type SenalesDeTorneoEnJuego,
  type ColumnaDeConfiguracion,
} from './tournament-config-locks'

const COLUMNAS: ColumnaDeConfiguracion[] = ['cancha', 'hoyos', 'formato', 'tee']

/** Las tres que congela el torneo en juego: lo que `startTournament` le copia al scorer. */
const DEL_SCORER: ColumnaDeConfiguracion[] = ['cancha', 'hoyos', 'tee']

/** Un borrador recién creado: nadie lo vio, nadie anotó nada. */
const BORRADOR: SenalesDeTorneoEnJuego = { scores: 0, tarjetasCompartidas: 0, status: 'draft' }

describe('candadosDeConfiguracion', () => {
  it('en un borrador sin scores no bloquea nada: el organizador puede arreglar lo que configuró mal', () => {
    expect(candadosDeConfiguracion(BORRADOR)).toEqual({
      cancha: null,
      hoyos: null,
      formato: null,
      tee: null,
    })
  })

  // El formato se congela desde que el torneo sale del borrador, no desde el primer score: los
  // grupos y los equipos ya se armaron con ese formato y los inscritos ya vieron a qué entraban.
  it('con el torneo publicado se congela el formato, pero la cancha, los hoyos y el tee siguen editables', () => {
    const abierto = candadosDeConfiguracion({ ...BORRADOR, status: 'open' })
    expect(abierto.formato).toBe('publicado')
    // Publicar no calculó nada todavía: el organizador puede corregir la cancha que eligió mal.
    for (const c of DEL_SCORER) expect(abierto[c], c).toBeNull()
  })

  it('un status desconocido cuenta como fuera del borrador: no se afirma que sigue privado', () => {
    expect(candadosDeConfiguracion({ ...BORRADOR, status: 'archivado_2027' }).formato).toBe('publicado')
  })

  // El P1 de la 6ª vuelta: el tee no viaja en la tarjeta, entra al CALCULAR el neto
  // (`leaderboard.ts` resuelve el course handicap leyendo `tournaments.tees`), así que moverlo con
  // scores puestos cambia los netos de los hoyos YA jugados en el leaderboard en vivo.
  it('con un solo score se cierran las cuatro columnas, y el motivo son los scores', () => {
    const conScores = candadosDeConfiguracion({ scores: 1, tarjetasCompartidas: 0, status: 'in_progress' })
    for (const c of COLUMNAS) expect(conScores[c], c).toBe('scores')
  })

  // `startTournament` le copia a la tarjeta su propia cancha, sus hoyos y su tee (`rondas_libres`:
  // `course_id`, `holes`, `tees` — issue #698): desde ese momento el board y la tarjeta calcularían
  // cosas distintas para el mismo jugador, aunque todavía no haya ni un score.
  it('la primera tarjeta compartida cierra lo que el scorer se copió, sin un solo score', () => {
    const conTarjeta = candadosDeConfiguracion({ scores: 0, tarjetasCompartidas: 1, status: 'in_progress' })
    for (const c of DEL_SCORER) expect(conTarjeta[c], c).toBe('tarjeta-compartida')
    // El formato tiene su propio motivo y es más viejo: se congeló al publicar, no al crear la tarjeta.
    expect(conTarjeta.formato).toBe('publicado')
  })

  it('con scores Y tarjeta, el motivo del tee son los scores: es el daño más concreto', () => {
    expect(candadosDeConfiguracion({ scores: 5, tarjetasCompartidas: 2, status: 'in_progress' }).tee).toBe('scores')
  })

  // El bug que este módulo vino a cerrar: la consulta de scores filtraba por una columna que
  // `hole_scores` no tiene, PostgREST devolvía error, el conteo venía null y el candado era SIEMPRE
  // false. Un conteo que no se pudo hacer tiene que CERRAR, no abrir.
  it('un conteo de scores que no se pudo hacer cierra las cuatro columnas', () => {
    const sinLeer = candadosDeConfiguracion({ scores: null, tarjetasCompartidas: 0, status: 'draft' })
    for (const c of COLUMNAS) expect(sinLeer[c], c).toBe('indeterminado')
  })

  it('un conteo de tarjetas que no se pudo hacer cierra lo del scorer y no toca el formato', () => {
    const sinLeer = candadosDeConfiguracion({ scores: 0, tarjetasCompartidas: null, status: 'draft' })
    for (const c of DEL_SCORER) expect(sinLeer[c], c).toBe('indeterminado')
    expect(sinLeer.formato).toBeNull()
  })

  // `tournaments.status` es NOT NULL con default 'draft': un null no sale de la base, sale de que
  // no se pudo leer. Tratarlo como borrador abriría el formato de un torneo quizás publicado.
  it('un status que no se pudo leer cierra el formato sin afirmar que fue publicado', () => {
    const sinStatus = candadosDeConfiguracion({ scores: 0, tarjetasCompartidas: 0, status: null })
    expect(sinStatus.formato).toBe('indeterminado')
    for (const c of DEL_SCORER) expect(sinStatus[c], c).toBeNull()
  })

  // Los scores pesan más que el status: con scores puestos el motivo es el score, que es lo que de
  // verdad se rompe. Decirle "no se puede cambiar el formato una vez publicado" a un organizador
  // cuyo torneo está andando es verdad pero más vago.
  it('con scores, el motivo del formato son los scores y no la publicación', () => {
    expect(candadosDeConfiguracion({ scores: 3, tarjetasCompartidas: 0, status: 'published' }).formato).toBe('scores')
  })

  it('nunca devuelve un motivo fuera de los cuatro, para cualquier combinación', () => {
    const valores = [null, 0, 1] as const
    const estados = [null, 'draft', 'open', 'in_progress', 'closed', 'published', 'inventado'] as const
    for (const scores of valores) {
      for (const tarjetasCompartidas of valores) {
        for (const status of estados) {
          const candados = candadosDeConfiguracion({ scores, tarjetasCompartidas, status })
          expect(Object.keys(candados).sort()).toEqual([...COLUMNAS].sort())
          for (const c of COLUMNAS) {
            expect(
              candados[c] == null || ['scores', 'publicado', 'tarjeta-compartida', 'indeterminado'].includes(candados[c]!),
              `${c}=${candados[c]}`,
            ).toBe(true)
          }
        }
      }
    }
  })

  // La propiedad que importa de verdad: si una señal no se pudo leer, NINGUNA columna que dependa
  // de ella queda abierta. Es lo que distingue "fallar cerrado" de "fallar abierto".
  it('ninguna señal sin leer deja una columna abierta', () => {
    for (const senales of [
      { scores: null, tarjetasCompartidas: null, status: null },
      { scores: null, tarjetasCompartidas: 0, status: 'draft' },
      { scores: 0, tarjetasCompartidas: null, status: 'draft' },
      { scores: 0, tarjetasCompartidas: 0, status: null },
    ] satisfies SenalesDeTorneoEnJuego[]) {
      const candados = candadosDeConfiguracion(senales)
      if (senales.scores == null) for (const c of COLUMNAS) expect(candados[c], c).not.toBeNull()
      if (senales.tarjetasCompartidas == null) for (const c of DEL_SCORER) expect(candados[c], c).not.toBeNull()
      if (senales.status == null) expect(candados.formato).not.toBeNull()
    }
  })

  // La cancha es la que más arrastra: mueve el rating, el slope, el par y los stroke index, así que
  // cambiarla recalcula hasta el neto de un hoyo ya jugado. Entró a la enumeración en la 8ª vuelta
  // de revisión; antes era la única columna de las cuatro que se podía cambiar en pleno torneo.
  it('la cancha se cierra con cualquiera de las dos señales de torneo en juego', () => {
    expect(candadosDeConfiguracion({ scores: 1, tarjetasCompartidas: 0, status: 'in_progress' }).cancha).toBe('scores')
    expect(candadosDeConfiguracion({ scores: 0, tarjetasCompartidas: 1, status: 'in_progress' }).cancha).toBe(
      'tarjeta-compartida',
    )
  })

  // Las tres columnas del scorer comparten señal, así que tienen que compartir motivo SIEMPRE: si
  // una se calculara aparte, un cambio en la enumeración dejaría a esa sin candado en silencio.
  it('la cancha, los hoyos y el tee siempre dan el mismo motivo', () => {
    const valores = [null, 0, 1] as const
    const estados = [null, 'draft', 'open', 'in_progress', 'closed', 'published', 'inventado'] as const
    for (const scores of valores) {
      for (const tarjetasCompartidas of valores) {
        for (const status of estados) {
          const candados = candadosDeConfiguracion({ scores, tarjetasCompartidas, status })
          expect([candados.hoyos, candados.tee], `${scores}/${tarjetasCompartidas}/${status}`).toEqual([
            candados.cancha,
            candados.cancha,
          ])
        }
      }
    }
  })
})
