'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { BrandedLoading } from '@/components/ronda/BrandedLoading'
import { ScorerMessageScreen } from '@/components/ronda/ScorerMessageScreen'
import { AvisoNoMolestar } from '@/components/ronda/AvisoNoMolestar'
import { AvisoTarjetaCompleta } from '@/components/ronda/AvisoTarjetaCompleta'
import { ConfirmarFinalizarHoja } from '@/components/ronda/ConfirmarFinalizarHoja'
import { hojaFinalizarSkins, hojaFinalizarTimba, textoConfirmarFinalizar, textoTarjetaCompleta } from '@/components/ronda/finalizar-copy'
import { useScorerPageView } from '@/hooks/ronda/useScorerPageView'
import { claveAvisoRondaLibre } from '@/hooks/ronda/useAvisoNoMolestar'
import { SCORER_THEME as theme } from '@/components/ronda/scorer-theme'
import { useRefreshOnResume } from '@/hooks/ronda/useRefreshOnResume'
import { useHoleNavigation } from '@/hooks/ronda/useHoleNavigation'
import { useBeforeUnloadWarning } from '@/hooks/ronda/useBeforeUnloadWarning'
import { getYardajeForTee, type Jugador } from '@/types/ronda'
import { isTeamFormat, isSharedBallFormat } from '@/golf/formats'
import { puedeDescartarRonda } from '@/golf/ronda-libre/permisos'
import { jugadoresQueSiguienteRellena } from '@/golf/ronda-libre/hoyos-sin-rellenar'
import { cierraLaRonda, equipoLiberadoSinElHoyo, equiposQueNoConfirmanElHoyo, equiposSinParAutomatico, nombreDelCreador } from '@/golf/ronda-libre/anotador-de-equipo'
import { haptic } from '@/lib/ronda/helpers'
import { saveGroupScores, hayPendientes } from '@/lib/ronda/score-storage'
import { BestBallTeamCard } from './components/BestBallTeamCard'
import { GrupoScorerHeader } from './components/GrupoScorerHeader'
import { HoleProgressRow } from './components/HoleProgressRow'
import { GrupoHoleInfoRow } from './components/GrupoHoleInfoRow'
import { CompartirEnJuego } from '@/components/ronda/CompartirEnJuego'
import { enlacesDeRondaLibre } from '@/components/ronda/OpcionesParaCompartir'
import { SharedBallTeamCard } from './components/SharedBallTeamCard'
import { PlayerScoreCard } from './components/PlayerScoreCard'
import { GrupoNavBar, envioDelHoyo } from './components/GrupoNavBar'
import { DiscardRoundModal } from './components/DiscardRoundModal'
import { ConexionScorerBanner } from './components/ConexionScorerBanner'
import { ElegirEquipo } from './components/ElegirEquipo'
import { EquiposDeOtroCelular } from './components/EquiposDeOtroCelular'
import { DejarEsteEquipo } from './components/DejarEsteEquipo'
import { useRondaGrupoData } from './hooks/useRondaGrupoData'
import { useAnotadorDeEquipo } from './hooks/useAnotadorDeEquipo'
import { useGrupoScoreSave } from './hooks/useGrupoScoreSave'
import { useTeamScoreSave } from './hooks/useTeamScoreSave'
import { useFinalizeGrupo } from './hooks/useFinalizeGrupo'
import { useIrAlResultadoSiCerrada } from './hooks/useIrAlResultadoSiCerrada'
import { useMatchPlayState } from '../hooks/useMatchPlayState'
import { useGrupoScoreboard } from './hooks/useGrupoScoreboard'
import { accionesDeLaTarjeta, tarjetaCongelada } from './hooks/tarjeta-congelada'
import { teeDelJugador } from '@/golf/ronda-libre/tee-del-jugador'
import { esFormatoPersonalizado } from '@/golf/formats/personalizado'
import { esFormatoSkins } from '@/golf/formats/skins/clave'
import { esJuegoConPlata } from '@/golf/formats/juegos-con-plata'
import { FUERA_DEL_HOYO } from '@/golf/formats/skins/motor'
import { useValorDelHoyoSkins } from './hooks/useValorDelHoyoSkins'
import { useTimbaDelScorer } from './hooks/useTimbaDelScorer'
import { EditarSkinsDelScorer } from './components/EditarSkinsDelScorer'
import { PestanasDeLaTimba, PANEL_DE_PESTANA, type PestanaDeLaTimba } from '../components/timba/PestanasDeLaTimba'
import { PanelDelJuego } from '../components/timba/PanelDelJuego'
import { PuntosEspecialesDelHoyo } from '../components/PuntosEspecialesDelHoyo'
import { RetiroDeJugadores } from '../components/timba/RetiroDeJugadores'
import { HojaDeRetiro } from '../components/timba/HojaDeRetiro'
import { useRetomarConLosRetiros } from './hooks/useRetomarConLosRetiros'
import { AvisoMarcasRechazadas } from '../components/timba/AvisoMarcasRechazadas'

const SIN_JUGADORES: Jugador[] = []
/** Padding superior del panel Juego: el encabezado fijo de la tabla sube lo mismo para pegarse al borde. */
const PADDING_PANEL_JUEGO_PX = 16

/* ── Main ── */
/**
 * Un scorer por ronda: con otro `codigo` se monta de cero (key). Sin la key, refs y estado de la ronda anterior
 * (cargada, eligiendo, golpes, equipos) sobrevivirían al cambio y la carga nueva mezclaría golpes entre rondas.
 */
export default function ScoreGrupoPage() {
  const codigo = useParams().codigo as string
  return <ScorerDeGrupo key={codigo} />
}

function ScorerDeGrupo() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string
  useScorerPageView('/score-grupo', codigo)

  const {
    ronda, loading, loadError, currentHole, setCurrentHole,
    scores, setScores, scoresRef, fuera, setFuera, fueraRef, parMap, holeDataMap, playerHcp, playerDisplayHcp,
    teamEquipos, setTeamEquipos, anotadorNombre, authUserId, conexion, golpesSinSubir,
    unCelularPorEquipo, equiposDeOtroCelular, eleccion, recargar, recargarTrasDejarEquipo,
  } = useRondaGrupoData(codigo)
  // Un celular por equipo: elegir equipo, liberar uno de otro celular y no pisar nunca lo suyo.
  const anotador = useAnotadorDeEquipo({ codigo, recargar, recargarTrasDejarEquipo })
  const porCelular = useMemo(
    () => unCelularPorEquipo ? { ajenos: equiposDeOtroCelular, alPerderEquipo: () => { void recargar() } } : undefined,
    [unCelularPorEquipo, equiposDeOtroCelular, recargar],
  )
  // Un celular por equipo: solo el creador cierra la ronda y libera equipos. En cualquier otra ronda, sin cambio.
  const cierraEsteCelular = !ronda || cierraLaRonda(ronda, [...teamEquipos, ...equiposDeOtroCelular], authUserId)

  // Al volver de background (WhatsApp, etc.), forzar re-render para que la UI
  // no se quede frozen por WebSockets muertos (post-mortem 30-ago-2026).
  const [, forceUpdate] = useState(0)
  useRefreshOnResume(useCallback(() => forceUpdate(n => n + 1), []))

  // Hoyos de la ronda en orden de juego (fuente única: hoyosDeLaRonda) + navegación.
  const nav = useHoleNavigation({
    hoyoInicio: ronda?.hoyo_inicio ?? 1,
    totalHoles: ronda?.holes ?? 18,
    currentHole,
    setCurrentHole,
  })
  const { ordenHoyos, currentHoleIdx, isLastHole } = nav

  // Skins: la X («Fuera del hoyo») vive aparte de los golpes. Fuera del skins no hay tecla ni mapa.
  const esSkins = esFormatoSkins(ronda?.formato_juego)
  const fueraDelHoyo = useMemo(() => (esSkins ? { setFuera, fueraRef } : undefined), [esSkins, setFuera, fueraRef])
  const fueraSkins = esSkins ? fuera : undefined
  const { saveStatus, guardados, hasUnsaved, setHasUnsaved, pendingScoreConfirm, handleScoreChange, saveAllScores, programarEnvio, enviarYa, pendienteDeEnvio, rondaCerrada, rondaNoExiste, sesionPerdida } =
    useGrupoScoreSave({ ronda, codigo, currentHole, setScores, scoresRef, parMap, teamEquipos, unCelularPorEquipo: porCelular, fueraDelHoyo })
  // La ronda se borró mientras se anotaba: el guardado ya avisó y limpió la copia local.
  useEffect(() => {
    if (rondaNoExiste) router.push('/dashboard')
  }, [rondaNoExiste, router])
  // Con servidor (al abrir o al reconectar), enviar lo que quedó sólo en el teléfono.
  const saveAllRef = useRef(saveAllScores)
  useEffect(() => { saveAllRef.current = saveAllScores }, [saveAllScores])
  useEffect(() => {
    if (!loading && conexion === 'ok' && (hasUnsaved || golpesSinSubir)) void saveAllRef.current()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo al cambiar la conexión / terminar la carga
  }, [conexion, golpesSinSubir, loading])
  // Un celular por equipo: el par al pasar de hoyo y al cerrar solo va al equipo que este celular reclamó; los de otro
  // celular y los sin reclamar se editan a mano (un par inventado se vería en la tabla en vivo).
  const sinParAutomatico = useMemo(
    () => unCelularPorEquipo && ronda ? equiposSinParAutomatico(ronda, [...teamEquipos, ...equiposDeOtroCelular], authUserId) : undefined,
    [unCelularPorEquipo, ronda, teamEquipos, equiposDeOtroCelular, authUserId],
  )
  // El par gris del hoyo en pantalla (Siguiente / «Guardar hoyo N»): `equiposQueConfirmanElHoyo`, que además del suyo
  // incluye el equipo sin reclamar que el creador ya anota (uno que liberó).
  const noConfirmanElHoyo = useMemo(
    () => unCelularPorEquipo && ronda ? equiposQueNoConfirmanElHoyo(ronda, [...teamEquipos, ...equiposDeOtroCelular], authUserId) : undefined,
    [unCelularPorEquipo, ronda, teamEquipos, equiposDeOtroCelular, authUserId],
  )
  const { handleTeamScoreChange, confirmarHoyo, completarEquiposConPar, foursomeInvertido, toggleFoursomeInvertido } =
    useTeamScoreSave({ codigo, parMap, teamEquipos, setTeamEquipos, setHasUnsaved, programarEnvio, enviarYa, sinParAutomatico, noConfirmanElHoyo })
  // Match play: mismo cálculo que el scorer individual y el historial (`matchDeLaRonda`).
  const { matchResult } = useMatchPlayState({ ronda, scores, holeDataMap, playerHcp })
  const jugadores = ronda?.ronda_libre_jugadores ?? SIN_JUGADORES
  // Timba libre: puntos, marcas y retiros (todo de GET /juego). En un skins, solo sus puntos especiales. Fuera de
  // los dos no pide nada.
  const esTimba = esFormatoPersonalizado(ronda?.formato_juego)
  // Timba y Skins (`esJuegoConPlata`): puntos especiales, retiros y cierre sin pares inventados. Una sola fuente.
  const conPuntosEspeciales = esJuegoConPlata(ronda?.formato_juego)
  const [pestana, setPestana] = useState<PestanaDeLaTimba>('tarjeta')
  // Retiro pedido (desde Juego o desde la tarjeta del jugador): la misma hoja para los dos.
  const [retiroPedido, setRetiroPedido] = useState<string | null>(null)
  const timba = useTimbaDelScorer({
    codigo, activo: conPuntosEspeciales, conexion, jugadores, scores, firma: String(guardados),
    // Sin par conocido no se inventa: el greenie (solo par 3) no se ofrece.
    currentHole, ordenHoyos, par: parMap[currentHole], fuera: fueraSkins,
  })
  // «Vale N skins»: el mismo cálculo que la tabla en vivo, con los mismos retiros.
  const valorSkins = useValorDelHoyoSkins({ ronda: esSkins ? ronda : null, scores, fuera: fueraSkins, retiros: esSkins ? timba.retiros : undefined, currentHole })
  // Con un retirado, el hoyo de la carga no sabe del retiro: al llegar los retiros, el scorer va al hoyo que falta.
  // Abrir "Finalizar" a propósito NO cuenta como interacción: si el salto llega con la hoja abierta, la hoja se
  // recalcula con el mismo estado que usará finalizeRound (el hoyo que de verdad falta), que es lo correcto.
  const { marcarInteraccion } = useRetomarConLosRetiros({
    ronda, listo: !loading, scores, equipos: teamEquipos, retiros: conPuntosEspeciales && timba.juego.estado === 'ok' ? timba.retiros : null,
    currentHole, setCurrentHole,
  })
  const { finalizeRound, finalizing, confirmFinalize, setConfirmFinalize, discardRound, discarding, descarteCerrado, showDiscardConfirm, setShowDiscardConfirm } =
    useFinalizeGrupo({
      ronda, codigo, hoyos: ordenHoyos, scores, setScores, parMap, teamEquipos, completarEquiposConPar, matchResult,
      authUserId, enviarPendientes: saveAllScores, fuera: fueraSkins,
      // Timba y Skins: al cerrar no se inventan pares (solo el hoyo en pantalla, si alguien lo anotó) ni desde un retiro.
      timba: conPuntosEspeciales ? { retiros: timba.retiros, enviarMarcas: timba.marcas.enviarPendientes, hoyoEnPantalla: currentHole } : undefined,
      unCelularPorEquipo: unCelularPorEquipo ? { recargar } : undefined,
    })
  useIrAlResultadoSiCerrada({ rondaCerrada, finalizing, codigo })
  // Con el aviso de sesión, "Iniciar sesión" navega a propósito y los golpes quedan en el teléfono: sin advertencia.
  useBeforeUnloadWarning(hasUnsaved && !sesionPerdida)
  // Mientras se finaliza o se descarta, o mientras cambia quién anota un equipo: ni golpes, ni finalizar, ni descartar (`tarjetaCongelada`).
  const congelada = tarjetaCongelada({ finalizing, discarding, anotadorEnCurso: anotador.enCurso })

  const board = useGrupoScoreboard({
    ronda, jugadores, scores, parMap, holeDataMap, playerHcp, equipos: teamEquipos, ordenHoyos, currentHole, isLastHole, matchResult,
    retiros: conPuntosEspeciales ? timba.retiros : undefined, sinParAutomatico, fuera: fueraSkins,
  })
  const {
    totalHoles, par, holeData, modoJuego, formatoJuego, modoLabel, showNetStableford,
    siAllocByHole, getDotHcp, holesWithScores, maxThru, canFinalize, hoyosPorMarcar, hoyosSinAnotar, hoyosSinJugarTimba, hoyosNadieJugoTimba, parEnPantallaTimba, getPlayerTotal, maxStrokesOnHole,
    hoyoCompleto, hoyoConGolpe, totalesDeEquipo,
  } = board


  const pasarAlSiguienteHoyo = async () => {
    if (!ronda) return
    haptic(30)
    // Hoyo fuera de la ronda: sólo se mueve al primero de la ronda, sin rellenar ni guardar.
    if (currentHoleIdx < 0) { nav.advanceHole(); return }

    if (isSharedBallFormat(formatoJuego)) {
      // Confirma el valor en pantalla (`confirmarHoyo`): los equipos que este celular confirma sin golpes en el hoyo → par.
      await confirmarHoyo(currentHole, par)
    } else {
      // Auto-fill ALL players who don't have a score for the current hole with par
      const updatedScores = { ...scores }
      const aRellenar = jugadoresQueSiguienteRellena({
        formato: formatoJuego, jugadores, scores: updatedScores, hoyo: currentHole, retiros: timba.retiros, ordenHoyos, fuera: fueraSkins,
      })
      for (const id of aRellenar) updatedScores[id] = { ...(updatedScores[id] ?? {}), [currentHole]: par }
      setScores(updatedScores)
      setHasUnsaved(true)
      saveGroupScores(codigo, updatedScores)

      // Respaldo local ya hecho (arriba): se avanza SIN esperar al servidor. Caída
      // del 04-oct-2026: con la base respondiendo en 20-80 s, "Siguiente" quedaba
      // congelado minutos. El envío sigue en segundo plano y se reintenta solo.
      void saveAllScores(updatedScores)
    }

    // NOW advance
    nav.advanceHole()
  }
  // Golpes y «Siguiente» pasan por la tarjeta congelada (finalizando o cambiando quién anota): ver `accionesDeLaTarjeta`.
  // Último hoyo sin Siguiente: «Guardar hoyo N» confirma el valor en pantalla con la misma regla que Siguiente
  // (`confirmarHoyo`) y lo envía YA. Lo usa (a) quien no cierra la ronda (un celular por equipo): no tiene Finalizar
  // y su par gris quedaba sin guardar (ensayo 25-nov: su equipo 17/18 y el creador sin poder cerrar); (b) el creador
  // con un equipo liberado sin golpes en el hoyo: el cierre no le rellena hoyos (P1-a) y Finalizar lo frenaría.
  const liberadoSinElHoyo = isLastHole && equipoLiberadoSinElHoyo({
    equipos: teamEquipos, sinParAutomatico: sinParAutomatico ?? [], noConfirmanElHoyo: noConfirmanElHoyo ?? [], hoyo: currentHole,
  })
  // Golpes de este celular que el servidor todavía no tiene (envío fallido o sin señal) o en viaje: la pantalla no
  // afirma «anotado» ni «tu equipo terminó» mientras tanto (Fable PR A: offline decía terminado y el creador seguía
  // viendo el equipo 17/18).
  const envioDelUltimoHoyo = envioDelHoyo({ enviando: saveStatus === 'saving', fallo: pendienteDeEnvio, colaConPendientes: hayPendientes(codigo) })
  const ultimoHoyoSinSubir = envioDelUltimoHoyo !== 'al_dia'
  const guardaElUltimoHoyo = isLastHole && isSharedBallFormat(formatoJuego) && (!cierraEsteCelular || liberadoSinElHoyo)
  const { anotar, anotarEquipo, siguiente: goToNextHole, guardarHoyo } = accionesDeLaTarjeta({
    congelada, marcarInteraccion, pasarAlSiguienteHoyo,
    confirmarHoyo: async () => { haptic(30); await confirmarHoyo(currentHole, par, { inmediato: true }) },
    anotarJugador: (jugadorId, delta) => handleScoreChange(jugadorId, currentHole, delta),
    anotarEquipo: (equipoId, delta) => handleTeamScoreChange(equipoId, currentHole, delta),
  })

  /* ── Render ── */
  if (loading) return <BrandedLoading message="Preparando scorer" variant="dark" />
  if (loadError) return <ScorerMessageScreen message={loadError} codigo={codigo} reload />
  if (eleccion) {
    return (
      <ElegirEquipo
        codigo={codigo}
        courseName={eleccion.ronda.course_name}
        equipos={eleccion.equipos}
        enCurso={anotador.enCurso}
        aviso={anotador.aviso}
        onElegir={(id) => { void anotador.reclamar(id) }}
        conexion={conexion}
      />
    )
  }
  if (!ronda) return <ScorerMessageScreen message="No se pudo cargar la ronda" codigo={codigo} />

  // Admin es quien opera la UI. Si admin es jugador de la ronda, usar su tee.
  // Sino fallback al tee default de la ronda (r.tees).
  const adminPlayer = ronda.ronda_libre_jugadores?.find(p => p.user_id === ronda.admin_user_id)
  const yardaje = getYardajeForTee(holeData, teeDelJugador(adminPlayer, ronda))

  return (
    <div style={{ background: theme.bg, height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>

      {/* Aviso "No molestar": una vez por ronda (misma clave que el scorer individual). */}
      <AvisoNoMolestar claveRonda={claveAvisoRondaLibre(codigo)} />

      {/* Save indicator */}
      {saveStatus !== 'idle' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20,
          height: '3px', transition: 'opacity 0.3s',
          background: saveStatus === 'saving' ? '#C4992A' : saveStatus === 'saved' ? '#00e676' : '#ff4444',
          opacity: saveStatus === 'saved' ? 0.6 : 1,
          animation: saveStatus === 'saving' ? 'savePulse 1s ease infinite' : 'none',
        }} />
      )}

      <ConexionScorerBanner conexion={conexion} pendienteDeEnvio={pendienteDeEnvio} codigo={codigo} sesionPerdida={sesionPerdida} />

      <GrupoScorerHeader
        currentHole={currentHole}
        modoLabel={modoLabel}
        courseName={ronda.course_name}
        anotadorNombre={anotadorNombre}
        maxThru={maxThru}
        totalHoles={totalHoles}
        onExit={() => router.push(`/ronda-libre/${codigo}`)}
        theme={theme}
      />

      {conPuntosEspeciales && <AvisoMarcasRechazadas lineas={timba.lineasRechazadas} onEntendido={timba.marcas.descartarRechazadas} />}
      {esTimba && (
        <div style={{ padding: '8px 8px 0' }}>
          <PestanasDeLaTimba activa={pestana} onCambiar={setPestana} />
        </div>
      )}

      {esTimba && pestana === 'juego' ? (
        <div id={PANEL_DE_PESTANA('juego')} role="tabpanel" style={{ flex: 1, overflowY: 'auto', padding: `${PADDING_PANEL_JUEGO_PX}px 12px`, minHeight: 0, userSelect: 'text' }}>
          <PanelDelJuego
            juego={timba.juego}
            nombres={timba.nombres}
            hoyoActual={currentHole}
            encabezadoFijoEn={`-${PADDING_PANEL_JUEGO_PX}px`}
            onReintentar={() => { void timba.recargar() }}
            pie={(
              <RetiroDeJugadores
                jugadores={timba.jugadoresParaRetiro}
                ocupado={timba.marcas.retirando || finalizing}
                onPedirRetiro={id => { marcarInteraccion(); setRetiroPedido(id) }}
                onDeshacer={(id) => { void timba.marcas.retirar(id, null) }}
              />
            )}
          />
        </div>
      ) : (
      <>
      <HoleProgressRow
        ordenHoyos={ordenHoyos}
        currentHole={currentHole}
        setCurrentHole={setCurrentHole}
        hoyoCompleto={hoyoCompleto}
        hoyoConGolpe={hoyoConGolpe}
        progressRowRef={nav.progressRowRef}
        theme={theme}
      />

      <GrupoHoleInfoRow
        par={par}
        strokeIndex={holeData.stroke_index}
        yardaje={yardaje}
        showNetStableford={showNetStableford}
        maxStrokes={maxStrokesOnHole}
        // Un celular: anota por todo el grupo, solo se invita a seguir. Un celular por equipo: también a anotar el suyo.
        accion={<CompartirEnJuego de="ronda" enlaces={enlacesDeRondaLibre(codigo, { conJugar: false, unCelularPorEquipo })} color={theme.textFaint} />}
        theme={theme}
        skins={esSkins ? valorSkins : undefined}
      />

      {/* Player columns — scrollable main area */}
      <div
        id={esTimba ? PANEL_DE_PESTANA('tarjeta') : undefined}
        role={esTimba ? 'tabpanel' : undefined}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', minHeight: 0 }}
        {...nav.swipeHandlers}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {esSkins && (
            <EditarSkinsDelScorer
              ronda={ronda} vista={timba.vistaSkins} userId={authUserId} enElHoyoDeSalida={currentHole === ordenHoyos[0]}
              scores={scores} fuera={fueraSkins} onGuardado={() => { void recargar(); void timba.recargar() }}
            />
          )}
          {/* Label contextual formato equipo */}
          {isSharedBallFormat(formatoJuego) ? (
            <p style={{ fontSize: '13px', color: 'var(--text-2)', textAlign: 'center', marginBottom: '8px', fontStyle: 'italic' }}>
              Ingresa el score del equipo por hoyo
            </p>
          ) : isTeamFormat(formatoJuego) ? (
            <p style={{ fontSize: '13px', color: 'var(--text-2)', textAlign: 'center', marginBottom: '8px', fontStyle: 'italic' }}>
              Ingresa el score de cada jugador
            </p>
          ) : null}

          {/* Best Ball — 1 score por jugador, agrupados por equipo */}
          {formatoJuego === 'best_ball' && teamEquipos.length > 0 && (() => {
            // Pre-compute dot HCPs y SI por hoyo (consumidos por el componente y sus helpers)
            const playerDotHcps: Record<string, number> = {}
            for (const j of jugadores) playerDotHcps[j.id] = getDotHcp(j.id)
            const strokeIndexByHole: Record<number, number> = {}
            for (const h of ordenHoyos) strokeIndexByHole[h] = holeDataMap[h]?.stroke_index ?? h
            return teamEquipos.map((equipo) => (
              <BestBallTeamCard
                key={equipo.id}
                equipo={equipo}
                jugadores={jugadores}
                scores={scores}
                playerHcp={playerHcp}
                playerDisplayHcp={playerDisplayHcp}
                playerDotHcps={playerDotHcps}
                modoJuego={modoJuego}
                currentHole={currentHole}
                par={par}
                strokeIndex={holeData.stroke_index}
                parMap={parMap}
                strokeIndexByHole={strokeIndexByHole}
                totalHoles={totalHoles}
                hoyos={ordenHoyos}
                onIncrement={(jid) => anotar(jid, 1)}
                onDecrement={(jid) => anotar(jid, -1)}
                theme={theme}
              />
            ))
          })()}

          {/* Team scoring for Scramble/Foursome */}
          {isSharedBallFormat(formatoJuego) && teamEquipos.length > 0 && teamEquipos.map(equipo => (
            <SharedBallTeamCard
              key={equipo.id}
              equipo={equipo}
              formatoJuego={formatoJuego}
              modoJuego={modoJuego}
              currentHole={currentHole}
              par={par}
              totales={totalesDeEquipo(equipo.id)}
              foursomeInvertido={foursomeInvertido[equipo.id] ?? false}
              onToggleInvertido={() => toggleFoursomeInvertido(equipo.id)}
              onChange={(delta) => anotarEquipo(equipo.id, delta)}
              theme={theme}
            />
          ))}

          {/* Quien anota un equipo sin ser el creador puede soltarlo (antes sube lo anotado). */}
          {unCelularPorEquipo && !cierraEsteCelular && teamEquipos.map(equipo => (
            <DejarEsteEquipo
              key={`dejar-${equipo.id}`}
              equipo={equipo}
              nombreCreador={nombreDelCreador(ronda)}
              enCurso={anotador.enCurso}
              onDejar={(id, nombre) => {
                void anotador.dejar(id, nombre, async () => {
                  const envio = await saveAllScores()
                  // Cerrada o borrada: la RPC lo dice con su propio aviso.
                  return envio.estado !== 'ronda_abierta' || !hayPendientes(codigo)
                })
              }}
            />
          ))}

          {unCelularPorEquipo && (
            <EquiposDeOtroCelular
              codigo={codigo}
              equipos={equiposDeOtroCelular}
              nombreCreador={nombreDelCreador(ronda)}
              puedeLiberar={cierraEsteCelular}
              enCurso={anotador.enCurso}
              onLiberar={(id, nombre) => { void anotador.liberar(id, nombre) }}
            />
          )}

          {/* Individual scoring (hidden for team scoring formats: scramble, foursome, best_ball) */}
          {!isTeamFormat(formatoJuego) && jugadores.map(j => esTimba && timba.retiradoEn(j.id, currentHole) ? (
            <p key={j.id} style={{ margin: 0, padding: '12px 14px', borderRadius: '12px', border: '1px dashed var(--border-md)', color: 'var(--text-2)', fontSize: '14px' }}>
              {j.nombre} se retiró en el hoyo {timba.retiros[j.id]}: no juega este hoyo.
            </p>
          ) : (
            <PlayerScoreCard
              key={j.id}
              jugador={j}
              playerScores={scores[j.id]}
              currentHole={currentHole}
              par={par}
              holeData={holeData}
              totals={getPlayerTotal(j.id)}
              played={holesWithScores(j.id)}
              hcp={playerHcp[j.id] ?? 0}
              displayHcp={playerDisplayHcp[j.id]}
              dotHcp={getDotHcp(j.id)}
              siAllocByHole={siAllocByHole}
              ordenHoyos={ordenHoyos}
              holeDataMap={holeDataMap}
              totalHoles={totalHoles}
              modoJuego={modoJuego}
              formatoJuego={formatoJuego}
              showNetStableford={showNetStableford}
              pending={pendingScoreConfirm?.jugadorId === j.id && pendingScoreConfirm?.hole === currentHole}
              onChange={(delta) => anotar(j.id, delta)}
              fuera={fueraSkins?.[j.id]}
              onFueraDelHoyo={esSkins ? () => anotar(j.id, FUERA_DEL_HOYO) : undefined}
              theme={theme}
              accion={esTimba && !finalizing && timba.jugadoresParaRetiro.some(r => r.id === j.id && r.desdeSiSeVa != null) ? (
                <button
                  type="button"
                  onClick={() => { marcarInteraccion(); setRetiroPedido(j.id) }}
                  disabled={timba.marcas.retirando}
                  aria-label={`Retirar a ${j.nombre}`}
                  style={{ minHeight: '44px', minWidth: '44px', margin: '-14px 0', padding: '0 8px', border: 'none', background: 'transparent', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: '13px', textDecoration: 'underline', textUnderlineOffset: '3px', cursor: 'pointer' }}
                >
                  Retirar
                </button>
              ) : undefined}
            />
          ))}

          {conPuntosEspeciales && (
            <PuntosEspecialesDelHoyo
              hoyo={currentHole}
              grupos={timba.puntosDelHoyo}
              nombres={timba.nombres}
              birdieAutomatico={timba.birdieAutomatico}
              unidad={esSkins ? ' skin' : undefined}
              onAlternar={(jugadorId, puntito) => { if (!finalizing) { marcarInteraccion(); timba.marcas.alternar(jugadorId, puntito, currentHole) } }}
            />
          )}
        </div>
      </div>

      {canFinalize && (
        <AvisoTarjetaCompleta
          completa={hoyosSinAnotar === 0 && hoyosSinJugarTimba.length === 0 && !finalizing}
          enUltimoHoyo={isLastHole}
          texto={textoTarjetaCompleta(cierraEsteCelular, nombreDelCreador(ronda), { sinSubir: ultimoHoyoSinSubir, sesionPerdida })}
        />
      )}

      <GrupoNavBar
        currentHoleIdx={currentHoleIdx}
        isLastHole={isLastHole}
        canFinalize={canFinalize && cierraEsteCelular && !guardaElUltimoHoyo}
        finalizing={finalizing}
        congelada={congelada}
        onPrev={nav.goToPrevHole}
        onNext={goToNextHole}
        onFinalize={finalizeRound}
        guardarUltimoHoyo={guardaElUltimoHoyo
          ? {
              hoyo: currentHole,
              guardado: !cierraEsteCelular && hoyoCompleto(currentHole),
              envio: envioDelUltimoHoyo,
              onGuardar: () => { void guardarHoyo() },
            }
          : undefined}
        theme={theme}
      />
      </>
      )}

      {(() => {
        const jugador = retiroPedido ? timba.jugadoresParaRetiro.find(j => j.id === retiroPedido) : undefined
        return jugador ? (
          <HojaDeRetiro
            jugador={jugador}
            onConfirmar={(desde) => { setRetiroPedido(null); marcarInteraccion(); void timba.marcas.retirar(jugador.id, desde) }}
            onCancelar={() => setRetiroPedido(null)}
          />
        ) : null
      })()}

      {confirmFinalize && (
        <ConfirmarFinalizarHoja
          {...(esTimba
            ? hojaFinalizarTimba({ hoyosSinJugar: hoyosSinJugarTimba, hoyosQueNadieJugo: hoyosNadieJugoTimba, parEnPantalla: parEnPantallaTimba })
            : esSkins
              ? hojaFinalizarSkins({ hoyosSinAnotar: hoyosSinJugarTimba, parEnPantalla: parEnPantallaTimba })
              : { titulo: textoConfirmarFinalizar(hoyosPorMarcar), detalle: undefined })}
          onConfirmar={finalizeRound}
          onCancelar={() => setConfirmFinalize(false)}
        />
      )}

      {/* Sólo el creador puede descartar (el RPC rechaza al resto con P0003): a los demás no se les ofrece. Tampoco
          cuando el servidor ya dijo que esta ronda no se descarta (`descarteCerrado`). */}
      {puedeDescartarRonda(ronda, authUserId) && !descarteCerrado && (
        <DiscardRoundModal
          showConfirm={showDiscardConfirm}
          setShowConfirm={setShowDiscardConfirm}
          discarding={discarding}
          bloqueado={congelada}
          onDiscard={discardRound}
        />
      )}

      {/* Animations */}
      <style>{`
        @keyframes savePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
