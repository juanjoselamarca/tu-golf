'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Stepper } from '@/components/ui/Stepper'
import { teesDeLosRecorridos } from '@/golf/courses/tees-de-recorridos'
import { esMultiRecorrido, formaDeLaRonda } from '@/golf/ronda-libre/forma-de-la-ronda'
import { colores } from './components/estilos'
import { PantallaCompartir } from './components/PantallaCompartir'
import { PasoCancha } from './components/PasoCancha'
import { PasoConfirmar } from './components/PasoConfirmar'
import { PasoFormato } from './components/PasoFormato'
import { PasoJugadores } from './components/PasoJugadores'
import { ParejasDeLaTimba } from './components/timba/ParejasDeLaTimba'
import { useCreadorDeRonda, recordarUltimaCancha } from './hooks/useCreadorDeRonda'
import { useCrearRonda, jugadoresDeLaRonda } from './hooks/useCrearRonda'
import { useFormularioDeRonda, volverDeEtapa } from './hooks/useFormularioDeRonda'
import { useHandicapDeCancha } from './hooks/useHandicapDeCancha'
import { useEquiposDeClub } from './hooks/useEquiposDeClub'
import { admiteEquiposDeClub } from '@/golf/ronda-libre/equipos-de-club'
import { useSetupDeCancha } from './hooks/useSetupDeCancha'
import { useTeesCoherentes } from './hooks/useTeesCoherentes'
import { configParaEnviar } from './hooks/timba-del-formulario'
import { problemaDeLaTimbaEnJugadores, problemaParaCrearLaTimba, useTimbaDeLaRonda } from './hooks/useTimbaDeLaRonda'
import { NOMBRE_FORMATO_PERSONALIZADO, NOMBRE_PLANTILLA } from '@/golf/formats/personalizado'
import { useEstadoDelPermisoDeJuegosDeLaRonda } from './hooks/usePermisoDeJuego'
import { useRepetirRonda } from './hooks/useRepetirRonda'
import { useSkinsDeLaRonda } from './hooks/useSkinsDeLaRonda'
import { ResumenSkins } from './components/skins/ResumenSkins'
import { TITULO_SKINS } from './components/skins/catalogo'

// Cancha → formato → jugadores. El formato va antes que la gente porque decide
// cuánta hace falta y quién anota; antes el asistente abría preguntando "¿quién
// anota?" sin saber todavía qué se iba a jugar.
const PASOS = ['Cancha', 'Formato', 'Jugadores', 'Confirmar']

const SUBTITULOS: Record<number, string> = {
  1: '¿Dónde juegas?',
  2: '¿Cómo quieres jugar?',
  3: '¿Con quién juegas?',
  4: 'Confirmar ronda',
}

export default function NuevaRondaLibrePage() {
  const router = useRouter()
  const creador = useCreadorDeRonda()
  const form = useFormularioDeRonda()
  // Timba libre y Skins: una sola pregunta del permiso (`puedeCrearJuegoPersonalizado`); cada juego, su interruptor.
  const estadoDelPermiso = useEstadoDelPermisoDeJuegosDeLaRonda()
  const permisoDeJuego = estadoDelPermiso === 'si'
  const timba = useTimbaDeLaRonda(permisoDeJuego)
  // Scramble rápido: «Solo equipos», con el hándicap del club y sin jugadores.
  const club = useEquiposDeClub({
    formato: form.formato,
    modo: form.modo,
    netoBloqueado: form.netoBloqueado,
    onModo: form.setModo,
  })

  const setup = useSetupDeCancha({ courseId: form.courseId })

  // Sólo los rivales que van a la ronda: en "cada uno en su celular" los que el
  // usuario haya escrito quedan guardados pero no viajan ni se validan.
  useTeesCoherentes({
    tees: setup.tees,
    recorridos: setup.recorridosElegidos,
    teeGlobal: form.tees,
    onTeeGlobal: form.setTees,
    rivales: form.rivalesEnJuego,
    onTeeDeRival: (idx, tee) => form.actualizarRival(idx, 'tees', tee),
  })

  // U11: precargar la cancha de la ronda anterior. Se aplica UNA vez y sólo si
  // el usuario todavía no eligió: llega asincrónica desde localStorage y sin el
  // guard pisaría la cancha que ya haya seleccionado mientras tanto.
  const canchaPrecargada = useRef(false)
  useEffect(() => {
    if (canchaPrecargada.current || !creador.ultimaCancha || form.courseId) return
    canchaPrecargada.current = true
    form.elegirCancha(creador.ultimaCancha)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creador.ultimaCancha])

  // Forma de la ronda: una sola respuesta a "cuántos hoyos y desde cuál",
  // consumida por la previsualización de handicap, el resumen y el payload.
  const forma = formaDeLaRonda({
    loops: setup.loops,
    loopsElegidos: setup.recorridosElegidos,
    hoyosElegidos: form.hoyosElegidos,
    mitad: form.mitad,
    shotgun: form.shotgun,
    hoyoShotgun: form.hoyoShotgun,
  })

  const jugadores = jugadoresDeLaRonda({
    creador: { nombre: creador.nombre, indice: creador.indice },
    teeGlobal: form.tees,
    // «Solo equipos»: el creador es la única tarjeta (los rivales escritos quedan guardados por si vuelve).
    rivales: club.soloEquipos ? [] : form.rivalesEnJuego,
  })
  // Skins: valida con el MISMO validador y el mismo contexto (CH y SI de la cancha) que la API.
  const skins = useSkinsDeLaRonda(permisoDeJuego, {
    courseId: form.courseId,
    holes: forma.holes,
    hoyoInicio: forma.hoyoInicio,
    recorridos: setup.recorridosElegidos,
    tees: form.tees,
    jugadores: jugadores.map(j => ({ nombre: j.nombre, indice: j.indice, tees: j.tees })),
    modo: form.modo,
    adminMode: form.llevaElScoreDelGrupo,
    filasSinNombre: form.filasSinNombre,
  })
  // Repetir: un Skins se repite con sus reglas, armado igual que al elegirlo (ronda individual, un solo celular), y
  // espera el permiso si todavía no llegó; sin permiso queda la ronda individual y se avisa.
  const repetir = useRepetirRonda({
    permiso: estadoDelPermiso,
    repetirBase: (r: Parameters<typeof form.repetirRonda>[0]) => { form.repetirRonda(r); club.restaurar(r.equiposDeClub) },
    ponerSkins: s => { timba.soltar(); form.elegirQuienAnota(true); club.elegirModo(s.modo); skins.setSkins(s) },
    soltarSkins: skins.soltar,
  })
  // Las tarjetas de jugador sin nombre no frenan una ronda que no las lleva.
  const problemaDelFormulario = club.soloEquipos ? null : form.problemaDelFormulario

  const { golpesDe, hcpVisibleDe } = useHandicapDeCancha({
    courseId: form.courseId,
    parTotal: setup.details?.par_total ?? null,
    holes: forma.holes,
    recorridos: setup.recorridosElegidos,
    teesEnJuego: jugadores.map(j => j.tees),
  })

  // Timba libre: el juego se valida con la MISMA función que la API. En Jugadores todavía no frenan las parejas
  // (se eligen en Confirmar); en Confirmar, todo.
  const jugadoresDeLaTimba = jugadores.map(j => ({ id: j.id, nombre: j.nombre, indice: j.indice }))
  // Los jugadores de la Timba quedan fijos al crearla (sus puntos van por identidad): no pueden sumarse después
  // por el link, así que se anota en un solo celular.
  const problemaTimbaJugadores = timba.timba
    ? problemaDeLaTimbaEnJugadores(timba.timba, jugadoresDeLaTimba, forma.holes, form.modo, form.courseId, form.llevaElScoreDelGrupo,
        form.filasSinNombre)
    : null
  const juegoTimba = timba.timba
    ? {
        reglasJuego: configParaEnviar(timba.timba, jugadoresDeLaTimba.map(j => j.id), form.modo),
        problema: problemaParaCrearLaTimba(timba.timba, jugadoresDeLaTimba, forma.holes, form.modo, form.courseId, form.llevaElScoreDelGrupo),
      }
    : null

  const { crear, creando, creada, problema, problemaDeLaRonda } = useCrearRonda({
    userId: creador.userId,
    courseId: form.courseId,
    cancha: form.cancha,
    teeGlobal: form.tees,
    jugadores,
    equipos: form.equipos,
    formato: form.formato,
    modo: form.modo,
    fecha: form.fecha,
    forma,
    recorridos: setup.recorridosElegidos,
    llevaElScoreDelGrupo: form.llevaElScoreDelGrupo,
    timba: juegoTimba,
    skins: skins.paraEnviar,
    equiposDeClub: club.paraEnviar,
    quienAnotaEquiposDeClub: club.quienAnotaParaEnviar,
  })
  const problemaEnJugadores = problemaDelFormulario ?? problemaTimbaJugadores ?? skins.problemaEnJugadores ?? problemaDeLaRonda

  if (creada) {
    return (
      <PantallaCompartir
        codigo={creada.codigo}
        cancha={form.cancha}
        holes={forma.holes}
        llevaElScoreDelGrupo={form.llevaElScoreDelGrupo}
        unCelularPorEquipo={club.unCelularPorEquipo}
        onEmpezar={() =>
          router.push(
            // Un formato de equipos (los equipos de club incluidos) siempre lleva el score del grupo:
            // `exigeLlevarElScoreDelGrupo` lo fuerza, así que va al scorer de grupo por esta misma condición.
            form.llevaElScoreDelGrupo
              ? `/ronda-libre/${creada.codigo}/score-grupo`
              : `/ronda-libre/${creada.codigo}/score`,
          )
        }
      />
    )
  }

  return (
    <div style={{ background: colores.fondo, minHeight: '100vh', padding: '20px 16px 80px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <Link
          href="/dashboard"
          style={{
            color: colores.texto2, fontSize: '13px', textDecoration: 'none',
            display: 'inline-block', marginBottom: '24px',
          }}
        >
          ← Dashboard
        </Link>

        <h1 style={{
          fontFamily: '"Playfair Display", serif', fontSize: '32px',
          color: colores.texto, marginBottom: '4px', marginTop: 0, fontWeight: 700,
        }}>
          Nueva Ronda
        </h1>
        {/* aria-live: al volver a una etapa tocándola en el stepper, el botón que tenía el foco desaparece (ese
            paso pasa a ser el actual). Así el lector de pantalla anuncia dónde quedó. */}
        <p aria-live="polite" style={{ fontSize: '14px', color: colores.texto2, marginTop: 0, marginBottom: '20px' }}>
          {SUBTITULOS[form.paso]}
        </p>

        <div className="mb-7">
          <Stepper
            steps={4}
            current={form.paso}
            labels={PASOS}
            onVolverAPaso={volverDeEtapa(creando, form.setPaso)}
          />
        </div>

        {(repetir.esperandoPermiso || repetir.aviso) && (
          <p role="status" style={{ fontSize: '14px', lineHeight: 1.45, color: colores.texto2, margin: '0 0 16px' }}>
            {repetir.aviso ?? 'Confirmando el Skins…'}
          </p>
        )}

        {form.paso === 1 && (
          <PasoCancha
            rondasRecientes={creador.rondasRecientes}
            onRepetir={repetir.repetir}
            cancha={form.cancha}
            onElegirCancha={c => { form.elegirCancha(c); recordarUltimaCancha(c) }}
            onLimpiarCancha={form.limpiarCancha}
            setup={setup}
            esMultiRecorrido={esMultiRecorrido(setup.loops)}
            hoyos={form.hoyosElegidos}
            onHoyos={form.elegirHoyos}
            mitad={form.mitad}
            onMitad={form.elegirMitad}
            tees={form.tees}
            onTees={form.setTees}
            fecha={form.fecha}
            onFecha={form.setFecha}
            shotgun={form.shotgun}
            onAlternarShotgun={form.alternarShotgun}
            hoyoShotgun={form.hoyoShotgun}
            onHoyoShotgun={form.setHoyoShotgun}
            onSiguiente={() => form.setPaso(2)}
          />
        )}

        {form.paso === 2 && (
          <PasoFormato
            formato={form.formato}
            onFormato={f => { timba.soltar(); skins.soltar(); form.elegirFormato(f) }}
            modo={form.modo}
            onModo={club.elegirModo}
            netoBloqueado={form.netoBloqueado}
            holes={forma.holes}
            timba={{
              puedeElegir: timba.puedeElegir,
              actual: timba.timba,
              // Timba libre se arma sobre la ronda individual base (cada uno con su tarjeta).
              onElegir: () => { skins.soltar(); form.elegirFormato('stroke_play'); form.elegirQuienAnota(true); timba.elegir() },
              onTimba: timba.setTimba,
            }}
            skins={{
              puedeElegir: skins.puedeElegir,
              actual: skins.skins,
              // Como la Timba: sobre la ronda individual base, un solo celular. Abre en neto (default del spec).
              onElegir: () => {
                if (skins.skins) return
                timba.soltar(); form.elegirFormato('stroke_play'); form.elegirQuienAnota(true); club.elegirModo('neto'); skins.elegir()
              },
              onSkins: skins.setSkins,
            }}
            onAtras={() => form.setPaso(1)}
            onSiguiente={() => form.setPaso(3)}
          />
        )}

        {form.paso === 3 && (
          <PasoJugadores
            creador={{ nombre: creador.nombre, indice: creador.indice }}
            onIndiceCreador={creador.setIndice}
            teeGlobal={form.tees}
            onTeeGlobal={form.setTees}
            tees={teesDeLosRecorridos(setup.tees, setup.recorridosElegidos)}
            formato={form.formato}
            modo={form.modo}
            esFormatoDeEquipo={form.esFormatoDeEquipo}
            preguntaQuienAnota={form.preguntaQuienAnota}
            anotaPorTodos={form.anotaPorTodos}
            onQuienAnota={form.elegirQuienAnota}
            llevaElScoreDelGrupo={form.llevaElScoreDelGrupo}
            rivales={form.rivales}
            onCampoRival={form.actualizarRival}
            onQuitarRival={form.quitarRival}
            onAgregarRival={form.agregarRival}
            equipos={form.equipos}
            onAgregarEquipo={form.agregarEquipoRival}
            onQuitarEquipo={form.quitarEquipo}
            onRenombrarEquipo={form.renombrarEquipo}
            onMoverAlEquipo={form.moverAlEquipo}
            golpesDe={golpesDe}
            hcpVisibleDe={hcpVisibleDe}
            hoyos={forma.holes}
            rondasRecientes={creador.rondasRecientes}
            problema={problemaEnJugadores}
            onReintentar={skins.reintentarSiMuestra(problemaEnJugadores)}
            club={admiteEquiposDeClub(form.formato) ? club : null}
            onAtras={() => form.setPaso(2)}
            onSiguiente={() => form.setPaso(4)}
          />
        )}

        {form.paso === 4 && (
          <PasoConfirmar
            cancha={form.cancha}
            forma={forma}
            mitad={form.mitad}
            recorridosElegidos={setup.recorridosElegidos}
            formato={form.formato}
            modo={form.modo}
            teeGlobal={form.tees}
            fecha={form.fecha}
            jugadores={jugadores}
            equipos={form.esFormatoDeEquipo && !club.soloEquipos ? form.equipos : []}
            equiposDeClub={club.paraEnviar}
            unCelularPorEquipo={club.unCelularPorEquipo}
            llevaElScoreDelGrupo={form.llevaElScoreDelGrupo}
            hcpVisibleDe={hcpVisibleDe}
            hayVariosTees={setup.tees.length > 1}
            problema={problemaDelFormulario ?? problema}
            juego={timba.timba ? {
              nombre: `${NOMBRE_FORMATO_PERSONALIZADO} · ${NOMBRE_PLANTILLA[timba.timba.config.plantilla]}`,
              detalle: (
                <ParejasDeLaTimba
                  timba={timba.timba}
                  onTimba={timba.setTimba}
                  jugadores={jugadoresDeLaTimba}
                  holes={forma.holes}
                />
              ),
            } : skins.skins ? {
              nombre: TITULO_SKINS,
              detalle: (
                <ResumenSkins
                  skins={skins.skins} modo={form.modo} jugadores={jugadores.length} problema={skins.problema}
                  onReintentar={skins.reintentarSiMuestra(skins.problema)}
                />
              ),
            } : undefined}
            creando={creando}
            onEditar={() => form.setPaso(3)}
            onCrear={crear}
          />
        )}
      </div>
    </div>
  )
}
