import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'
import { KNOWN_FORMAT_KEYS, TEAM_FORMAT_KEYS, isSharedBallFormat } from '@/golf/formats'
import { esFormatoPersonalizado } from '@/golf/formats/personalizado'
import type { FormatoJuego } from '@/golf/core/rules'
import { prepararJuegoDeRondaNueva } from '@/golf/ronda-libre/juego-de-ronda-nueva'
import { puedeCrearJuegoPersonalizado } from '@/lib/auth/juego-personalizado'
import { handicapsDeEquipoDeRondaNueva } from '@/lib/data/ronda-libre-equipos'
import { validarNuevaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import { parseFechaISO } from '@/golf/tournament-fechas'
import { evaluarRondaLibre } from '@/lib/data/course-aptitud'
import { bloqueaRondaLibre, seArreglaJugandoGross } from '@/golf/courses/aptitud-torneo'
import { captureError } from '@/lib/error-tracking'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { HANDICAP_INDEX_MIN, HANDICAP_INDEX_MAX, MENSAJE_INDICE_FUERA_DE_RANGO } from '@/golf/handicap-index-range'
import { checkModoAccess } from '@/golf/billing/require-feature'
import { perfilesQueExisten } from '@/lib/data/perfiles-existentes'

export const dynamic = 'force-dynamic'

const MODOS = ['gross', 'neto'] as const

/**
 * Errores del INSERT de jugadores que la sugerencia `perfil_sugerido_id` PUEDE
 * causar: columna inexistente (PGRST204 en el caché de PostgREST, 42703 en
 * Postgres), FK a una cuenta que se borró (23503) y permiso de columna revocado
 * (42501). Se filtra solo por código, a propósito: si la causa es otra (p. ej.
 * otra FK o la policy), el reintento sin la sugerencia falla igual y queda como
 * error en `insert-jugadores`, con `reintentoSinSugerencia` para cruzarlos.
 */
const CODIGOS_SUGERENCIA_DESCARTABLE = new Set(['PGRST204', '42703', '23503', '42501'])

const playerSchema = z.object({
  nombre: z.string().min(1).max(100),
  // Lo ignora el servidor: el creador entra con su sesión y los rivales con null (#581).
  user_id: z.string().uuid().nullable(),
  // Cuenta que el creador eligió para un rival. Se graba en `perfil_sugerido_id`,
  // que no da ningún poder sobre la ronda (ver más abajo).
  perfil_sugerido_id: z.string().uuid().nullable().optional(),
  handicap: z.number().min(HANDICAP_INDEX_MIN, MENSAJE_INDICE_FUERA_DE_RANGO).max(HANDICAP_INDEX_MAX, MENSAJE_INDICE_FUERA_DE_RANGO).nullable(),
  tees: z.string().max(50).nullable(),
  is_guest: z.boolean().optional(),
  telefono_invitado: z.string().max(30).optional(),
  nombre_invitado: z.string().max(100).optional(),
})

const equipoSchema = z.object({
  nombre: z.string().min(1).max(50),
  jugadorIndices: z.array(z.number().int().min(0)),
})

const createSchema = z.object({
  course_id: z.string().uuid().nullable(),
  course_name: z.string().min(1).max(200),
  tees: z.string().min(1).max(50),
  holes: z.number().int().refine(n => [9, 18, 27].includes(n), 'Holes must be 9, 18, or 27'),
  // Fecha de calendario real: `2026-02-30` pasaba el regex y moría en Postgres
  // como un 500 con el mensaje crudo de la base.
  fecha: z.string().refine(f => parseFechaISO(f) !== null, 'Fecha inválida'),
  hoyo_inicio: z.number().int().min(1).max(18),
  // Formatos del registro canónico + Timba libre (`personalizado`, solo admins: se chequea más abajo).
  formato_juego: z.string().refine(f => KNOWN_FORMAT_KEYS.includes(f) || esFormatoPersonalizado(f), 'Formato inválido'),
  modo_juego: z.enum(MODOS),
  admin_mode: z.boolean(),
  recorridos: z.array(z.string()).optional(),
  jugadores: z.array(playerSchema).min(1).max(4),
  equipos: z.array(equipoSchema).optional(),
  /** Timba libre: config del juego (la valida `validarJuegoPersonalizado`). Solo con formato `personalizado`. */
  reglas_juego: z.unknown().optional(),
})

/**
 * Cuenta elegida para un rival, o null. El creador (posición 0) entra con su
 * sesión y un invitado no tiene cuenta: en esos casos se ignora lo que mande el
 * cliente. Una fila con datos de invitado (teléfono o nombre de invitado, que se
 * graban si son no vacíos) tampoco la lleva aunque `is_guest` venga en false: la
 * sugerencia nunca convive con datos de contacto de un invitado.
 */
function perfilSugerido(j: z.infer<typeof playerSchema>, i: number): string | null {
  if (i === 0 || j.is_guest || j.telefono_invitado || j.nombre_invitado) return null
  return j.perfil_sugerido_id ?? null
}

/** Generate a crypto-safe 6-char code and verify uniqueness */
async function generarCodigoUnico(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const bytes = new Uint8Array(4)
    crypto.getRandomValues(bytes)
    const codigo = Array.from(bytes).map(b => b.toString(36)).join('').substring(0, 6).toUpperCase()
    const { data } = await supabase.from('rondas_libres').select('id').eq('codigo', codigo).maybeSingle()
    if (!data) return codigo
  }
  // Fallback: UUID prefix
  return crypto.randomUUID().substring(0, 8).toUpperCase()
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })
    }

    // Rate limit: 10 per minute (round creation)
    const rl = checkRateLimit(`create-ronda:${user.id}`, 10, 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo más tarde.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    const rawBody = await req.json()
    const parsed = createSchema.safeParse(rawBody)
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || 'Datos inválidos'
      return NextResponse.json({ error: msg, details: parsed.error.issues }, { status: 400 })
    }

    const body = parsed.data
    const esTimba = esFormatoPersonalizado(body.formato_juego)

    // Timba libre: solo admins (fuente única `puedeCrearJuegoPersonalizado`; la base lo repite con una guarda
    // RESTRICTIVE para el PATCH directo).
    if (esTimba && !(await puedeCrearJuegoPersonalizado(user.id))) {
      return NextResponse.json({ error: 'Timba libre todavía no está disponible para tu cuenta.' }, { status: 403 })
    }
    if (!esTimba && body.reglas_juego !== undefined) {
      return NextResponse.json({ error: 'Las reglas de juego son solo para Timba libre.' }, { status: 400 })
    }

    // Reglas de formato, cantidad, equipos e índices: el MISMO validador que
    // corre la UI antes de habilitar "Crear ronda" (fuente única). Antes el
    // servidor tenía su propia copia, más corta: no miraba las posiciones de
    // `equipos`, así que un índice fuera de rango tiraba un 500 con la ronda y
    // sus jugadores ya creados, y `[0,0] + [1,1]` dejaba a dos jugadores sin equipo.
    const isTeamFormat = TEAM_FORMAT_KEYS.includes(body.formato_juego)
    const problema = validarNuevaRonda({
      cancha: body.course_name,
      formato: body.formato_juego as FormatoJuego,
      modo: body.modo_juego,
      jugadores: body.jugadores.map((j, i) => ({ nombre: j.nombre, indice: j.handicap, perfilId: perfilSugerido(j, i) })),
      equipos: isTeamFormat ? body.equipos ?? [] : [],
      creadorId: user.id,
    })
    if (problema) {
      return NextResponse.json({ error: problema.detalle }, { status: 400 })
    }

    // Timba libre: el mismo validador que la UI + ids de los jugadores generados acá (cláusula 2).
    const timba = esTimba
      ? prepararJuegoDeRondaNueva({
          reglasJuego: body.reglas_juego,
          modoDeLaRonda: body.modo_juego,
          jugadores: body.jugadores.map(j => ({ nombre: j.nombre, indice: j.handicap })),
          holes: body.holes,
          courseId: body.course_id,
          nuevoId: () => crypto.randomUUID(),
        })
      : null
    if (timba && !timba.ok) {
      return NextResponse.json({ error: timba.error }, { status: 400 })
    }

    // La cuenta elegida para un rival tiene que existir: un id inventado rompería
    // la FK en el INSERT (500 con la ronda a medio crear). Si la base no responde
    // se graba sin la sugerencia — es una referencia para aprender del uso, no
    // puede ser el motivo de que el grupo no pueda empezar a jugar.
    const pedidos = body.jugadores.map(perfilSugerido).filter((id): id is string => !!id)
    const perfilesValidos = pedidos.length === 0
      ? new Set<string>()
      : await perfilesQueExisten(pedidos).catch((err) => {
          void captureError(err, { context: 'ronda-libre.create.perfil-sugerido', userId: user.id, level: 'warning' })
          return null
        })
    const inexistente = perfilesValidos && body.jugadores.find((j, i) => {
      const id = perfilSugerido(j, i)
      return !!id && !perfilesValidos.has(id)
    })
    if (inexistente) {
      return NextResponse.json({
        error: `No encontramos la cuenta de ${inexistente.nombre.trim()}. Vuelve a buscar su cuenta o elige «Invitado».`,
      }, { status: 400 })
    }

    // Gate de plan: neto de Match Play / Best Ball / Stableford es Pro. El
    // asistente ya no deja elegirlo sin plan, pero el servidor es la autoridad
    // (repetir una ronda vieja, un body armado a mano, el plan que venció).
    const proRequerido = await checkModoAccess(supabase, user.id, body.formato_juego, body.modo_juego)
    if (proRequerido) {
      return NextResponse.json(proRequerido.body, { status: proRequerido.status })
    }

    // Guardarrail de datos de cancha. Dos preguntas que NO aplican en el mismo
    // momento, y por eso el gate vive FUERA del bloque de modo neto:
    //
    // - El par hoyo por hoyo hace falta SIEMPRE. Sin él no hay vs-par ni birdie
    //   en el scorer y el coach analiza una ronda sin referencia. Hasta el
    //   09-ago-2026 nadie lo preguntaba, y en producción quedaron 4 rondas
    //   finalizadas (12 jugadores) sobre el club PADRE de un complejo de 27
    //   hoyos con `recorridos` en null: el par no existía por ningún lado.
    // - El rating sólo hace falta en NETO: en gross no entra en ningún cálculo
    //   y bloquear por él sería un falso bloqueo.
    //
    // Falla ABIERTO, al revés que el gate de creación de torneos. Ese gate se
    // usa desde un escritorio y se puede reintentar; este corre con el jugador
    // parado en el tee 1. Un hipo de PostgREST no puede ser el motivo de que
    // no pueda empezar a jugar — y el guardarrail de `resolverCourseHandicap`
    // ya evita el número absurdo que este aviso sólo se adelanta a contar.
    if (body.course_id) {
      const veredicto = await evaluarRondaLibre(
        supabase,
        body.course_id,
        body.holes,
        body.recorridos ?? null,
        { requiereRating: body.modo_juego === 'neto' },
      ).catch((err) => {
        // Se reporta SIEMPRE: este catch no distingue "se cayó PostgREST" de
        // "nuestro código está roto", y sin rastro el guardarrail se apaga en
        // silencio — que es peor que no tenerlo.
        captureError(err, {
          context: 'ronda-libre.gate-aptitud',
          meta: { courseId: body.course_id },
        })
        return null
      })
      if (bloqueaRondaLibre(veredicto)) {
        // Sólo se ofrece el gross como salida cuando de verdad la destraba.
        const salida = seArreglaJugandoGross(veredicto)
          ? ' Mientras tanto puedes jugarla en modo Gross (sin handicap).'
          : ''
        return NextResponse.json({ error: `${veredicto.mensaje}${salida}` }, { status: 400 })
      }
    }

    // Handicap de equipo (scramble/foursome): fuente canónica sobre el course
    // handicap sin redondear de cada jugador con su tee (src/lib/data/ronda-libre-equipos.ts).
    // Best ball: null (cada jugador juega con el suyo). Se calcula ANTES de crear
    // la ronda: lee la base, y si falla no puede dejar una ronda sin sus equipos.
    const handicaps = isTeamFormat && body.equipos && body.equipos.length > 0
      ? await handicapsDeEquipoDeRondaNueva(
          supabase,
          { formato: body.formato_juego, courseId: body.course_id, holes: body.holes, recorridos: body.recorridos ?? null },
          body.equipos.map(equipo => equipo.jugadorIndices.map(idx => ({
            indice: body.jugadores[idx]?.handicap ?? null,
            tee: body.jugadores[idx]?.tees || body.tees,
          }))),
        )
      : []
    // Un equipo de bola compartida sin handicap jugaría con 0. Hoy el validador
    // sólo deja equipos de 2 (todos con tabla); si eso cambia, se rechaza acá.
    if (isSharedBallFormat(body.formato_juego) && handicaps.some(h => h.juego == null)) {
      return NextResponse.json({ error: 'No hay handicap de equipo para equipos de ese tamaño. Arma equipos de un tamaño permitido para este formato.' }, { status: 400 })
    }

    // Generate unique code
    const codigo = await generarCodigoUnico(supabase)

    // Normalizar course_name: si tenemos course_id, buscar el nombre más usado
    // en rondas anteriores del mismo course_id para evitar variantes
    // ("Lomas de La Dehesa" vs "Club de Golf Lomas de La Dehesa").
    // Bug 30-ago-2026: usuario abandonó ronda por nombres duplicados en En Vivo.
    // NO usamos courses.nombre (es el formato largo de FedeGolf, peor para UX).
    let normalizedCourseName = body.course_name
    if (body.course_id) {
      const { data: prevRondas } = await supabase
        .from('rondas_libres')
        .select('course_name')
        .eq('course_id', body.course_id)
        .not('course_name', 'is', null)
        .limit(20)
      if (prevRondas && prevRondas.length > 0) {
        // Usar el nombre más frecuente entre las rondas anteriores
        const counts: Record<string, number> = {}
        for (const r of prevRondas) {
          counts[r.course_name] = (counts[r.course_name] ?? 0) + 1
        }
        let maxName = body.course_name
        let maxCount = 0
        for (const name of Object.keys(counts)) {
          if (counts[name] > maxCount) { maxCount = counts[name]; maxName = name }
        }
        normalizedCourseName = maxName
      }
    }

    // B1: Atomic insert — ronda + jugadores in one transaction-like flow
    // Supabase JS doesn't support real transactions, but we can:
    // 1. Insert ronda
    // 2. Batch-insert all players at once (not one-by-one)
    // 3. If players fail, delete the ronda (compensating transaction)

    const rondaData: Record<string, unknown> = {
      codigo,
      creador_id: user.id,
      course_id: body.course_id,
      course_name: normalizedCourseName,
      tees: body.tees,
      holes: body.holes,
      fecha: body.fecha,
      estado: 'en_curso',
      hoyo_inicio: body.hoyo_inicio,
      modo_juego: body.modo_juego,
      formato_juego: body.formato_juego,
    }

    if (body.admin_mode) {
      rondaData.admin_mode = true
      rondaData.admin_user_id = user.id
    }

    if (body.recorridos && body.recorridos.length > 0) {
      rondaData.recorridos = body.recorridos
    }

    if (timba?.ok) {
      rondaData.reglas_juego = timba.reglas
    }

    const { data: ronda, error: rondaErr } = await supabase
      .from('rondas_libres')
      .insert(rondaData)
      .select('id')
      .single()

    if (rondaErr || !ronda) {
      void captureError(rondaErr ?? new Error('insert de ronda sin fila'), { context: 'ronda-libre.create.insert-ronda', userId: user.id })
      return NextResponse.json({ error: 'No se pudo crear la ronda. Intenta de nuevo.' }, { status: 500 })
    }

    /** Deshace la ronda a medio crear (cascada: jugadores, equipos y miembros). */
    const deshacerRonda = async () => {
      // RLS que no deja borrar devuelve 0 filas SIN error: se cuenta lo borrado
      // para que una ronda a medio crear que sobrevive no pase en silencio.
      const { data, error } = await supabase.from('rondas_libres').delete().eq('id', ronda.id).select('id')
      if (error || !data?.length) {
        void captureError(error ?? new Error('deshacer ronda borró 0 filas'), { context: 'ronda-libre.create.deshacer', userId: user.id, meta: { rondaId: ronda.id } })
      }
    }

    // Batch insert all players at once (atomic per Supabase)
    const playerRows = body.jugadores.map((j, i) => {
      const perfil = perfilSugerido(j, i)
      return {
        // Timba libre: el id que `reglas_juego.jugadorIds` ya le asignó a esta posición.
        ...(timba?.ok ? { id: timba.jugadorIds[i] } : {}),
        ronda_id: ronda.id,
        nombre: j.nombre.trim(),
        // Sólo el creador entra con cuenta. El creador NO puede escribir el
        // user_id de un rival: eso le metía la ronda (y sus avisos push, el
        // permiso de anotar, su historial y su índice) a cualquier usuario sin su
        // permiso (#581).
        user_id: i === 0 ? user.id : null,
        // La cuenta que el creador eligió para el rival va aparte y sin poderes:
        // ninguna policy, función, push ni historial lee esta columna
        // (perfil-sugerido-sin-poderes / -lectores en src/__tests__). Sólo se manda
        // cuando hay una, así una ronda sin rivales con cuenta no la nombra.
        ...(perfil && perfilesValidos?.has(perfil) ? { perfil_sugerido_id: perfil } : {}),
        scores: {},
        handicap: j.handicap,
        tees: j.tees || body.tees,
        is_guest: j.is_guest || false,
        telefono_invitado: j.telefono_invitado || null,
        nombre_invitado: j.nombre_invitado || null,
      }
    })

    const insertarJugadores = (filas: typeof playerRows) => supabase
      .from('ronda_libre_jugadores')
      .insert(filas)
      .select('id, nombre')

    let { data: insertedPlayers, error: playersErr } = await insertarJugadores(playerRows)

    // La sugerencia nunca impide jugar: si el INSERT (una sola sentencia, nada
    // quedó grabado) falla por la columna `perfil_sugerido_id` — aún no aplicada
    // o deshecha en prod, una cuenta borrada entre la validación y el INSERT, o
    // permisos — se registra y se reintenta UNA vez sin ella.
    const conSugerencia = playerRows.some(f => 'perfil_sugerido_id' in f)
    let reintentoSinSugerencia = false
    if (playersErr && conSugerencia && CODIGOS_SUGERENCIA_DESCARTABLE.has(playersErr.code ?? '')) {
      void captureError(playersErr, {
        context: 'ronda-libre.create.perfil-sugerido-insert',
        userId: user.id,
        level: 'warning',
        meta: { rondaId: ronda.id, code: playersErr.code },
      })
      reintentoSinSugerencia = true
      const sinSugerencia = playerRows.map(({ perfil_sugerido_id: _descartada, ...resto }) => resto)
      ;({ data: insertedPlayers, error: playersErr } = await insertarJugadores(sinSugerencia))
    }

    // Timba libre: las filas tienen que ser exactamente las de `jugadorIds`, o las parejas quedarían corridas.
    const timbaDescuadrada = !!timba?.ok && !!insertedPlayers &&
      !timba.jugadorIds.every(id => insertedPlayers!.some(p => p.id === id))
    if (playersErr || !insertedPlayers || insertedPlayers.length !== playerRows.length || timbaDescuadrada) {
      void captureError(playersErr ?? new Error('insert de jugadores incompleto'), {
        context: 'ronda-libre.create.insert-jugadores',
        userId: user.id,
        meta: { rondaId: ronda.id, reintentoSinSugerencia },
      })
      await deshacerRonda()
      return NextResponse.json({
        error: 'Error al registrar jugadores. La ronda no fue creada.',
      }, { status: 500 })
    }

    // Team format: insert equipos + members
    if (isTeamFormat && body.equipos && body.equipos.length > 0) {
      for (const [i, equipo] of body.equipos.entries()) {
        const jugadoresEquipo = equipo.jugadorIndices.map(idx => ({ dbRecord: insertedPlayers[idx] }))

        const { data: equipoDB, error: equipoErr } = await supabase
          .from('ronda_equipos')
          .insert({
            ronda_id: ronda.id,
            nombre: equipo.nombre,
            // Ya redondeados (WHS): las dos columnas son smallint.
            handicap_equipo: handicaps[i].completo,
            handicap_equipo_juego: handicaps[i].juego,
            scores: {},
          })
          .select('id')
          .single()

        // Antes un equipo que no se grababa se saltaba en silencio y la ronda
        // por equipos quedaba en juego sin equipos: el scorer no tenía a quién
        // sumarle. Una ronda por equipos sin sus equipos no se entrega.
        const members = equipoDB
          ? jugadoresEquipo.map((j, idx) => ({ equipo_id: equipoDB.id, jugador_id: j.dbRecord.id, orden: idx }))
          : []
        const { error: miembrosErr } = equipoDB
          ? await supabase.from('ronda_equipo_jugadores').insert(members)
          : { error: null }
        if (!equipoDB || equipoErr || miembrosErr) {
          void captureError(equipoErr ?? miembrosErr ?? new Error('insert de equipo sin fila'), { context: 'ronda-libre.create.insert-equipos', userId: user.id })
          await deshacerRonda()
          return NextResponse.json({ error: 'Error al armar los equipos. La ronda no fue creada.' }, { status: 500 })
        }
      }
    }

    // Course snapshot (non-blocking)
    if (body.course_id && ronda.id) {
      try {
        const { saveCourseSnapshot } = await import('@/lib/save-course-snapshot')
        await saveCourseSnapshot(supabase, 'rondas_libres', ronda.id, body.course_id, null, body.tees)
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({
      ok: true,
      ronda_id: ronda.id,
      codigo,
    })
  } catch (err) {
    void captureError(err, { context: 'ronda-libre.create' })
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
