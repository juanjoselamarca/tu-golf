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
import { useCreadorDeRonda, recordarUltimaCancha } from './hooks/useCreadorDeRonda'
import { useCrearRonda, jugadoresDeLaRonda } from './hooks/useCrearRonda'
import { useFormularioDeRonda, volverDeEtapa } from './hooks/useFormularioDeRonda'
import { useHandicapDeCancha } from './hooks/useHandicapDeCancha'
import { useSetupDeCancha } from './hooks/useSetupDeCancha'
import { useTeesCoherentes } from './hooks/useTeesCoherentes'

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
    rivales: form.rivalesEnJuego,
  })

  const { golpesDe } = useHandicapDeCancha({
    courseId: form.courseId,
    parTotal: setup.details?.par_total ?? null,
    holes: forma.holes,
    recorridos: setup.recorridosElegidos,
    teesEnJuego: jugadores.map(j => j.tees),
  })

  const { crear, creando, creada, problema } = useCrearRonda({
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
  })

  if (creada) {
    return (
      <PantallaCompartir
        codigo={creada.codigo}
        cancha={form.cancha}
        holes={forma.holes}
        llevaElScoreDelGrupo={form.llevaElScoreDelGrupo}
        onEmpezar={() =>
          router.push(
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

        {form.paso === 1 && (
          <PasoCancha
            rondasRecientes={creador.rondasRecientes}
            onRepetir={form.repetirRonda}
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
            onFormato={form.elegirFormato}
            modo={form.modo}
            onModo={form.setModo}
            netoBloqueado={form.netoBloqueado}
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
            rondasRecientes={creador.rondasRecientes}
            problema={form.problemaDelFormulario ?? problema}
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
            equipos={form.esFormatoDeEquipo ? form.equipos : []}
            llevaElScoreDelGrupo={form.llevaElScoreDelGrupo}
            golpesDe={golpesDe}
            hayVariosTees={setup.tees.length > 1}
            problema={form.problemaDelFormulario ?? problema}
            creando={creando}
            onEditar={() => form.setPaso(3)}
            onCrear={crear}
          />
        )}
      </div>
    </div>
  )
}
