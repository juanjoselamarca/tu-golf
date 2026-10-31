'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { useFormErrors } from '@/hooks/useFormErrors'
import type { CourseOption } from './page'
import { FORMAT_META } from '@/golf/core/rules'
import type { FormatoJuego } from '@/golf/core/rules'
import { opcionesDeTeeDelTorneo } from '@/golf/courses/tee-options-torneo'
import {
  esModoDeTees,
  esModoDeTeesAsignadoAMano,
  etiquetaDeTeesDelTorneo,
  origenDelTeeDelTorneo,
  hayCategoriaSinTee,
} from '@/golf/tournament-tees-mode'
import { useCourseTeeNames } from '@/hooks/useCourseTeeNames'

interface TournamentData {
  id: string; name: string; slug: string; format: string; hole_count: number
  tees: string; use_handicap: boolean; date_start: string | null
  cover_image_url: string | null; courses: { id: string; nombre: string } | null
  has_scores?: boolean
  status?: string
  /** El torneo ya tiene scores o una tarjeta compartida: cambiar el tee movería el hándicap con
   *  el que se está puntuando. Lo decide `page.tsx`. */
  tee_bloqueado?: boolean
  /** Categorías con tee, o null si no se pudo leer. Sin ninguna, los modos que resuelven por
   *  categoría se quedan sin eslabón y el hándicap sale del rating de la cancha. */
  categorias_con_tee?: number | null
  /** Categorías del torneo, con tee o sin él: el motor resuelve por la de CADA jugador. */
  categorias_total?: number
}

interface Props { tournament: TournamentData; courses: CourseOption[] }

/** Formatos derivados de FORMAT_META canónico (regla "un concepto, una fuente"). */
const FORMATS = (Object.entries(FORMAT_META) as [FormatoJuego, typeof FORMAT_META[FormatoJuego]][]).map(
  ([key, meta]) => ({ value: key, label: meta.label, desc: meta.description }),
)
/** Por qué el tee no se toca con el torneo en juego. Sale en los dos caminos del bloque de tees
 *  (el que guarda un modo y el que guarda un color), así que vive en un solo lugar. */
const AVISO_TEE_BLOQUEADO =
  'Este torneo ya tiene tarjetas en juego, así que el tee no se puede cambiar: movería el hándicap con el que se está puntuando.'

function FieldErr({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p style={{ color: 'var(--error-fg)', fontSize: '12px', marginTop: '4px' }}>{msg}</p>
}

export default function EditTorneoForm({ tournament, courses }: Props) {
  const router = useRouter()
  const { showError, showSuccess } = useToast()
  const { fieldError, setFieldError, clearAll } = useFormErrors()
  const dropdownRef = useRef<HTMLDivElement>(null)


  const [name,           setName]           = useState(tournament.name)
  const [courseSearch,   setCourseSearch]   = useState(tournament.courses?.nombre || '')
  const [selectedCourse, setSelectedCourse] = useState<CourseOption | null>(
    tournament.courses ? { id: tournament.courses.id, nombre: tournament.courses.nombre, ciudad: null } : null
  )
  const [showCourses,    setShowCourses]    = useState(false)
  const [format,         setFormat]         = useState(tournament.format)
  const [holeCount,      setHoleCount]      = useState(tournament.hole_count)
  const [tees,           setTees]           = useState(tournament.tees)
  const [useHandicap,    setUseHandicap]    = useState(tournament.use_handicap)
  const [dateValue,      setDateValue]      = useState(tournament.date_start ?? '')
  const [coverUrl,       setCoverUrl]       = useState(tournament.cover_image_url || '')
  const [loading,        setLoading]        = useState(false)

  // Los tees que se ofrecen son los de la cancha elegida (regla "un concepto,
  // una fuente"): `tournaments.tees` se matchea contra `course_tees.nombre`.
  const teeNames = useCourseTeeNames([selectedCourse?.id])
  const teeOptions = opcionesDeTeeDelTorneo(
    teeNames.status === 'ready' ? teeNames.courses : [],
    tees,
  )
  // Si la columna guarda un MODO de asignación, no hay un tee del torneo que
  // editar acá: el de cada jugador vive en `players.tee_id`.
  const teesEsModo = esModoDeTees(tees)
  const teesSeAsignanAMano = esModoDeTeesAsignadoAMano(tees)
  const teesCargando = teeNames.status === 'loading'
  // Los tres candados de la configuración viven acá y no sueltos en el JSX: la pantalla los usa
  // para apagar los controles y `handleSubmit` para no escribir la columna igual. El form le
  // escribe a `tournaments` directo desde el cliente, así que hasta que ese UPDATE viva en un route
  // el candado de la UI es el único que hay.
  //
  // Son TRES predicados distintos a propósito, porque lo que cada columna rompe es distinto:
  // - hoyos: solo con scores. Antes del primer score, 9↔18 no invalida ninguna fila (el par de la
  //   ronda se recalcula) y el organizador que lo configuró mal tiene que poder arreglarlo.
  // - formato: desde que se publica. Los grupos y los equipos ya se armaron con ese formato.
  // - tee: desde el primer score o la primera tarjeta compartida (`tee_bloqueado`, ver `page.tsx`).
  //   El tee no se guarda en la tarjeta: entra al CALCULAR el neto, así que cambiarlo con scores
  //   puestos mueve los netos de los hoyos ya jugados en el leaderboard en vivo.
  const hoyosBloqueados = !!tournament.has_scores
  const formatoBloqueado = !!tournament.has_scores || (tournament.status != null && tournament.status !== 'draft')
  const teeBloqueado = !!tournament.tee_bloqueado

  // Las categorías con tee son lo que de verdad decide el tee en los modos que no asignan a mano, y
  // el motor resuelve por la categoría de CADA jugador: con una con tee y dos sin él, los de esas
  // dos caen al rating de la cancha. `?? null` y no `?? 0`: sin el dato no se afirma que no hay
  // ninguna.
  const categorias = { conTee: tournament.categorias_con_tee ?? null, total: tournament.categorias_total ?? 0 }
  // Un torneo en un modo que resuelve por categoría, con alguna categoría sin tee, deja a esos
  // jugadores sin de dónde sacarlo: el hándicap les sale del rating de la cancha. Medido en prod el
  // 30-oct-2026: 9 torneos así (6 son fixtures `gate-scorer-*`; los de usuarios son 2 borradores y
  // 1 abierto, todos con 0 scores) y hasta acá no tenían salida — el modo no se puede cambiar desde
  // esta pantalla y las categorías solo se crean en el wizard. Elegir un tee para todo el torneo es
  // el único arreglo que existe hoy, así que se le ofrece justo donde se le avisa el problema: ese
  // tee es el ÚLTIMO eslabón de la cadena, así que rescata al que no tiene tee de categoría sin
  // pisarle el suyo al que ya lo tiene.
  const [eligiendoTeeGlobal, setEligiendoTeeGlobal] = useState(false)
  const sinTeeDeDondeSacar = teesEsModo && !teesSeAsignanAMano && !teeBloqueado && hayCategoriaSinTee(categorias)

  const filteredCourses = courses.filter(
    (c) => courseSearch === '' ||
      c.nombre.toLowerCase().includes(courseSearch.toLowerCase()) ||
      (c.ciudad || '').toLowerCase().includes(courseSearch.toLowerCase())
  )

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowCourses(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const dateISO = dateValue

  const inputStyle = (field: string): React.CSSProperties => ({
    background: 'var(--input-bg)', border: `1px solid ${fieldError(field) ? 'var(--error-border)' : 'var(--input-border)'}`,
    color: 'var(--text)', borderRadius: '8px', padding: '12px', width: '100%',
    fontSize: '15px', outline: 'none', transition: 'border-color 200ms', boxSizing: 'border-box' as const,
  })
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearAll()
    let hasErrors = false
    if (!name.trim()) { setFieldError('name', 'El nombre es obligatorio.'); hasErrors = true }
    if (!selectedCourse) { setFieldError('course', 'Debes seleccionar una cancha.'); hasErrors = true }
    if (!dateISO) { setFieldError('date', 'La fecha es obligatoria.'); hasErrors = true }
    if (hasErrors) return

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('tournaments')
      .update({
        name: name.trim(),
        course_id: selectedCourse!.id,
        // El valor viejo cuando la columna está bloqueada: el candado no puede vivir solo en el
        // `disabled` de un botón si el UPDATE sale del mismo cliente.
        format: formatoBloqueado ? tournament.format : format,
        hole_count: hoyosBloqueados ? tournament.hole_count : holeCount,
        tees: teeBloqueado ? tournament.tees : tees,
        use_handicap: useHandicap,
        cover_image_url: coverUrl.trim() || null,
        date_start: dateISO,
      })
      .eq('id', tournament.id)

    if (error) {
      showError('Error al guardar', 'No pudimos guardar los cambios. Intenta nuevamente.')
      setLoading(false)
      return
    }

    showSuccess('¡Torneo actualizado!', 'Los cambios fueron guardados correctamente.')
    router.push(`/organizador/${tournament.slug}/jugadores`)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', backgroundImage: 'url(https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=1920&q=80)', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', padding: '40px 16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,13,24,0.85)' }} />
      {/* La card es un hero oscuro intencional (foto de cancha + overlay navy). Los
          tokens de texto (var(--text), var(--text-2)…) resuelven al tema del usuario;
          en tema claro se volvían oscuros e ilegibles sobre el navy. data-theme="dark"
          fuerza que TODOS los tokens hijos resuelvan a la paleta dark, coherente con el
          diseño hero. Fix sistémico (sin hardcodear colores). Reporte inbox e637b979. */}
      <div data-theme="dark" style={{ position: 'relative', zIndex: 10, background: 'rgba(14,28,47,0.94)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(196,153,42,0.25)', borderRadius: '16px', padding: '40px', maxWidth: '600px', width: '100%' }}>
        <Link href={`/organizador/${tournament.slug}/jugadores`} style={{ color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none', display: 'block', marginBottom: '20px' }}>← Volver al torneo</Link>
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '13px', color: 'var(--brand-on-bg)', marginBottom: '6px' }}>Golfers+</div>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: 'var(--text)', margin: 0 }}>Editar torneo</h1>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Nombre */}
          <div>
            <label style={labelStyle}>Nombre del torneo</label>
            <input type="text" value={name} onChange={(e) => { setName(e.target.value); if (fieldError('name')) clearAll() }}
              style={inputStyle('name')}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--brand)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('name') ? 'var(--error-border)' : 'rgba(122,143,168,0.3)' }} />
            <FieldErr msg={fieldError('name')} />
          </div>

          {/* Cancha */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <label style={labelStyle}>Cancha</label>
            <input type="text" placeholder="Buscar cancha..." value={courseSearch}
              onChange={(e) => { setCourseSearch(e.target.value); setSelectedCourse(null); setShowCourses(true) }}
              onFocus={() => setShowCourses(true)}
              style={{ ...inputStyle('course'), borderColor: fieldError('course') ? 'var(--error-border)' : selectedCourse ? 'var(--brand)' : 'rgba(122,143,168,0.3)' }} />
            {selectedCourse && <div style={{ fontSize: '12px', color: 'var(--brand-on-bg)', marginTop: '4px' }}>✓ {selectedCourse.nombre}</div>}
            <FieldErr msg={fieldError('course')} />
            {showCourses && filteredCourses.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-md)', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', zIndex: 50 }}>
                {filteredCourses.slice(0, 15).map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => { setSelectedCourse(c); setCourseSearch(c.nombre); setShowCourses(false); clearAll() }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: '14px', borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,153,42,0.08)')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}>
                    {c.nombre}{c.ciudad && <span style={{ color: 'var(--text-2)', fontSize: '12px', marginLeft: '8px' }}>— {c.ciudad}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Formato */}
          <div>
            <label style={labelStyle}>Formato</label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {FORMATS.map((f) => {
                const formatLocked = formatoBloqueado
                return (
                  <button key={f.value} type="button" onClick={() => setFormat(f.value)} disabled={formatLocked}
                    style={{ flex: '1 1 calc(50% - 6px)', minWidth: '140px', padding: '14px', border: format === f.value ? '2px solid var(--brand)' : '1px solid rgba(122,143,168,0.3)', borderRadius: '10px', background: format === f.value ? 'rgba(196,153,42,0.08)' : 'rgba(7,13,24,0.4)', cursor: formatLocked ? 'not-allowed' : 'pointer', textAlign: 'left', transition: 'all 200ms', opacity: formatLocked ? 0.5 : 1 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '14px' }}>{f.label}</div>
                    <div style={{ color: 'var(--text-2)', fontSize: '12px', marginTop: '4px' }}>{f.desc}</div>
                  </button>
                )
              })}
            </div>
            {tournament.has_scores && (
              <p style={{ fontSize: '12px', color: 'var(--error-fg)', marginTop: '8px' }}>No se puede cambiar el formato después de que los jugadores comenzaron a scorear.</p>
            )}
            {!tournament.has_scores && tournament.status != null && tournament.status !== 'draft' && (
              <p style={{ fontSize: '12px', color: 'var(--error-fg)', marginTop: '8px' }}>No se puede cambiar el formato una vez que el torneo fue publicado.</p>
            )}
          </div>

          {/* Hoyos + Tees: en una fila cuando caben los dos a 200px y apilados si no. Medido a 390px
              con la pantalla real, la columna del tee quedaba de 122px y la prosa del modo se
              partía en siete líneas. */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={labelStyle}>Hoyos</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[18, 9].map((n) => (
                  <button key={n} type="button" onClick={() => setHoleCount(n)} disabled={hoyosBloqueados}
                    style={{ flex: 1, padding: '10px', minHeight: '44px', border: holeCount === n ? '2px solid var(--brand)' : '1px solid var(--border)', borderRadius: '8px', background: holeCount === n ? 'rgba(196,153,42,0.08)' : 'var(--input-bg)', color: holeCount === n ? 'var(--text)' : 'var(--text-2)', cursor: hoyosBloqueados ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: holeCount === n ? 600 : 400, opacity: hoyosBloqueados ? 0.5 : 1 }}>
                    {n} hoyos
                  </button>
                ))}
              </div>
              {hoyosBloqueados && (
                <p style={{ fontSize: '12px', color: 'var(--error-fg)', marginTop: '8px' }}>No se puede cambiar el número de hoyos después de que los jugadores comenzaron a scorear.</p>
              )}
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label style={labelStyle}>Tee</label>
              {teesEsModo && !eligiendoTeeGlobal ? (
                <div style={{ padding: '10px 12px', background: 'rgba(7,13,24,0.4)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text)', margin: 0 }}>
                    Tees <strong>{etiquetaDeTeesDelTorneo(tees)}</strong> —{' '}
                    {origenDelTeeDelTorneo(tees, categorias)}.
                  </p>
                  {/* El link solo en 'manual': es el único modo con asignador de tees en el panel
                      de jugadores. En los otros, mandarlo allá era prometerle un control que no existe. */}
                  {teesSeAsignanAMano && (
                    <Link href={`/organizador/${tournament.slug}/jugadores`} style={{ fontSize: '13px', color: 'var(--brand-on-bg)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
                      Asignarlos en el panel de jugadores →
                    </Link>
                  )}
                  {/* Sin categoría con tee no hay nada que resolver: se le ofrece el único arreglo
                      que existe hoy, en vez de dejarlo mirando el problema sin salida. */}
                  {sinTeeDeDondeSacar && (
                    <button type="button" onClick={() => setEligiendoTeeGlobal(true)}
                      style={{ background: 'none', border: 'none', padding: '12px 0', minHeight: '44px', color: 'var(--brand-on-bg)', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline', display: 'block', textAlign: 'left' }}>
                      Elegir un tee para todo el torneo →
                    </button>
                  )}
                  {/* Con el torneo en juego no se ofrece la salida y se dice por qué: elegir un tee
                      ahora movería el hándicap con que se está puntuando. */}
                  {teeBloqueado && !teesSeAsignanAMano && (
                    <p style={{ fontSize: '12px', color: 'var(--error-fg)', margin: '6px 0 0' }}>{AVISO_TEE_BLOQUEADO}</p>
                  )}
                </div>
              ) : (
                <>
                  {/* La condición es `eligiendoTeeGlobal` SOLO: al tocar un color, `tees` deja de
                      guardar el modo y `teesEsModo` pasa a false, así que un `teesEsModo &&` acá
                      borraba el aviso y la vuelta atrás justo en el paso donde hacen falta —con el
                      tee elegido y sin guardar todavía. El modo original se lee de `tournament.tees`,
                      que no cambia con el estado. */}
                  {eligiendoTeeGlobal && (
                    <p style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>
                      {/* Con alguna categoría CON tee, "todos juegan desde este" sería falso: la
                          categoría le gana al tee del torneo en la cadena de `resolvePlayerTee`. */}
                      {(categorias.conTee ?? 0) > 0
                        ? <>Los jugadores de las categorías sin tee juegan desde este; las que ya tienen tee mantienen el suyo.</>
                        : <>Todos juegan desde este tee.</>}{' '}
                      Reemplaza el modo <strong>{etiquetaDeTeesDelTorneo(tournament.tees)}</strong> al guardar.
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {teeOptions.map((t) => (
                      <button key={t.value} type="button" onClick={() => setTees(t.value)} disabled={teesCargando || teeBloqueado}
                        title={t.delCatalogo ? undefined : 'Esta cancha no publica este tee: los jugadores caerán al rating de la cancha.'}
                        style={{ padding: '10px 14px', minHeight: '44px', border: tees === t.value ? '2px solid var(--brand)' : '1px solid var(--border)', borderRadius: '6px', background: tees === t.value ? 'rgba(196,153,42,0.08)' : 'var(--input-bg)', color: tees === t.value ? 'var(--text)' : 'var(--text-2)', cursor: teeBloqueado ? 'not-allowed' : teesCargando ? 'wait' : 'pointer', opacity: teesCargando || teeBloqueado ? 0.5 : 1, fontSize: '13px', fontWeight: tees === t.value ? 600 : 400 }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {/* El torneo guarda un COLOR y ya está en juego: el selector se muestra (es lo que
                      hay guardado) pero no se toca. Sin esto, cambiarlo movía los netos de los
                      hoyos ya jugados —es el camino que de verdad existe en prod, porque 27 de los
                      45 torneos guardan un color. */}
                  {teeBloqueado && (
                    <p style={{ fontSize: '12px', color: 'var(--error-fg)', marginTop: '6px' }}>{AVISO_TEE_BLOQUEADO}</p>
                  )}
                  {teesCargando && (
                    <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '6px' }}>Cargando los tees de la cancha…</p>
                  )}
                  {teeNames.status === 'ready' && !teeOptions.some(t => t.delCatalogo) && (
                    <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '6px' }}>
                      Esta cancha todavía no tiene tees cargados: el hándicap sale del rating de la cancha.
                    </p>
                  )}
                  {teeNames.status === 'error' && (
                    <p style={{ fontSize: '12px', color: 'var(--error-fg)', marginTop: '6px' }}>
                      No pudimos cargar los tees de la cancha.{' '}
                      <button type="button" onClick={teeNames.retry} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-on-bg)', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}>Reintentar</button>
                    </p>
                  )}
                  {eligiendoTeeGlobal && (
                    <button type="button" onClick={() => { setEligiendoTeeGlobal(false); setTees(tournament.tees) }}
                      style={{ background: 'none', border: 'none', padding: '12px 0', minHeight: '44px', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline', display: 'block', textAlign: 'left' }}>
                      Dejar el modo como está
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Handicap */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(7,13,24,0.4)', borderRadius: '10px', border: '1px solid rgba(122,143,168,0.15)' }}>
            <div>
              <div style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 500 }}>Aplicar hándicap WHS</div>
              <div style={{ color: 'var(--text-2)', fontSize: '12px', marginTop: '2px' }}>Ajusta los scores según el índice de cada jugador</div>
            </div>
            <button type="button" onClick={() => setUseHandicap(!useHandicap)}
              style={{ width: '48px', height: '26px', borderRadius: '13px', background: useHandicap ? 'var(--brand)' : 'rgba(122,143,168,0.3)', position: 'relative', transition: 'background 200ms', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: '3px', left: useHandicap ? '25px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left 200ms' }} />
            </button>
          </div>

          {/* Fecha */}
          <div>
            <label style={labelStyle}>Fecha del torneo</label>
            <input
              type="date"
              value={dateValue}
              onChange={(e) => { setDateValue(e.target.value); if (fieldError('date')) clearAll() }}
              style={inputStyle('date')}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--brand)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = fieldError('date') ? 'var(--error-border)' : 'rgba(122,143,168,0.3)' }}
            />
            <FieldErr msg={fieldError('date')} />
          </div>

          {/* Foto */}
          <div>
            <label style={labelStyle}>Foto de portada (opcional)</label>
            <input type="url" placeholder="URL de imagen" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)}
              style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', padding: '12px', width: '100%', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--brand)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')} />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <Link href={`/organizador/${tournament.slug}/jugadores`}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '13px', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: '15px', textDecoration: 'none', fontWeight: 500, textAlign: 'center' }}>
              Cancelar
            </Link>
            <button type="submit" disabled={loading}
              style={{ flex: 2, background: 'var(--brand)', color: 'var(--brand-dark)', fontWeight: 700, fontSize: '15px', borderRadius: '8px', padding: '13px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: loading ? 0.5 : 1, transition: 'filter 200ms' }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.08)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)' }}>
              {loading ? 'Guardando...' : 'Guardar cambios →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
