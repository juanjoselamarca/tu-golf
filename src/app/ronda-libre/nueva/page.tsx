'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Stepper } from '@/components/ui/Stepper'
import { esMultiRecorrido, formaDeLaRonda } from '@/golf/ronda-libre/forma-de-la-ronda'
import { colores } from './components/estilos'
import { PantallaCompartir } from './components/PantallaCompartir'
import { PasoCancha } from './components/PasoCancha'
import { PasoConfirmar } from './components/PasoConfirmar'
import { PasoJugadores } from './components/PasoJugadores'
import { PasoModo } from './components/PasoModo'
import { useCreadorDeRonda, recordarUltimaCancha } from './hooks/useCreadorDeRonda'
import { useCrearRonda, jugadoresDeLaRonda } from './hooks/useCrearRonda'
import { useFormularioDeRonda } from './hooks/useFormularioDeRonda'
import { useHandicapDeCancha } from './hooks/useHandicapDeCancha'
import { useSetupDeCancha } from './hooks/useSetupDeCancha'

const PASOS = ['Formato', 'Cancha', 'Jugadores', 'Confirmar']

const SUBTITULOS: Record<number, string> = {
  1: '¿Cómo quieres jugar?',
  2: '¿Dónde juegas?',
  3: '¿Con quién juegas?',
  4: 'Confirmar ronda',
}

export default function NuevaRondaLibrePage() {
  const router = useRouter()
  const creador = useCreadorDeRonda()
  const form = useFormularioDeRonda()

  const setup = useSetupDeCancha({
    courseId: form.courseId,
    onTeeSugerido: form.setTees,
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
    rivales: form.rivales,
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
        <p style={{ fontSize: '14px', color: colores.texto2, marginTop: 0, marginBottom: '20px' }}>
          {SUBTITULOS[form.paso]}
        </p>

        <div className="mb-7">
          <Stepper steps={4} current={form.paso} labels={PASOS} />
        </div>

        {form.paso === 1 && (
          <PasoModo
            rondasRecientes={creador.rondasRecientes}
            onRepetir={form.repetirRonda}
            llevaElScoreDelGrupo={form.llevaElScoreDelGrupo}
            onElegirModo={grupo => { form.elegirModoDeScore(grupo); form.setPaso(2) }}
          />
        )}

        {form.paso === 2 && (
          <PasoCancha
            cancha={form.cancha}
            onElegirCancha={c => { form.elegirCancha(c); recordarUltimaCancha(c) }}
            onLimpiarCancha={form.limpiarCancha}
            setup={setup}
            esMultiRecorrido={esMultiRecorrido(setup.loops)}
            hoyos={form.hoyosElegidos}
            onHoyos={form.elegirHoyos}
            mitad={form.mitad}
            onMitad={form.elegirMitad}
            formato={form.formato}
            onFormato={form.elegirFormato}
            modo={form.modo}
            onModo={form.setModo}
            tees={form.tees}
            onTees={form.setTees}
            fecha={form.fecha}
            onFecha={form.setFecha}
            shotgun={form.shotgun}
            onAlternarShotgun={form.alternarShotgun}
            hoyoShotgun={form.hoyoShotgun}
            onHoyoShotgun={form.setHoyoShotgun}
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
            tees={setup.tees}
            formato={form.formato}
            esFormatoDeEquipo={form.esFormatoDeEquipo}
            llevaElScoreDelGrupo={form.llevaElScoreDelGrupo}
            rivales={form.rivales}
            onCampoRival={form.actualizarRival}
            onQuitarRival={form.quitarRival}
            onAgregarRival={form.agregarRival}
            equipos={form.equipos}
            onEquipos={form.setEquipos}
            jugadores={jugadores}
            golpesDe={golpesDe}
            rondasRecientes={creador.rondasRecientes}
            problema={problema}
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
            golpesDe={golpesDe}
            hayVariosTees={setup.tees.length > 1}
            problema={problema}
            creando={creando}
            onEditar={() => form.setPaso(3)}
            onCrear={crear}
          />
        )}
      </div>
    </div>
  )
}
