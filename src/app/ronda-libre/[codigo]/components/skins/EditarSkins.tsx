'use client'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { AvisoCampo } from '@/components/ui/AvisoCampo'
import { MENSAJE_HANDICAP_OPCIONAL_NO_ES_NUMERO, MENSAJE_HANDICAP_UN_DECIMAL, PLACEHOLDER_CAMPO_HANDICAP_ANGOSTO } from '@/golf/handicap-index-range'
import { useCampoHandicap } from '@/hooks/useCampoHandicap'
import { formatPesos } from '@/lib/format'
import { nombreOJugadorN } from '@/lib/nombre-de-jugador'
import type { CourseTee } from '@/lib/data/ronda-libre-nueva'
import { input, inputNumerico, inputQueBloquea } from '../../../nueva/components/estilos'
import { SelectorDeTeeDelJugador } from '../../../nueva/components/SelectorDeTeeDelJugador'
import { TarjetaDeRival } from '../../../nueva/components/TarjetaDeRival'
import {
  MENSAJE_EDITAR_INDICE, MENSAJE_EDITAR_TOPE, useEditarSkins, type EditorDelSkins, type FilaDelEditor, type JugadorDelSkinsAEditar,
} from '../../hooks/useEditarSkins'

// «Editar» del Skins (spec docs/specs/formato-skins.md, «Editar antes del primer golpe»): el botón y la hoja. La misma
// pieza va en la página de la ronda (sobre la tabla) y en el scorer (en el hoyo de salida). Quien la monta decide si
// se ve (`puedeEditarElSkins`); el estado vive en `useEditarSkins`.

export const TEXTO_EDITAR = 'Editar'
const ID_AYUDA = 'editar-skins-ayuda'

const textoChico = { margin: 0, fontSize: '13px', lineHeight: 1.4, color: 'var(--text-2)' } as const
const botonTexto = {
  minHeight: '44px', minWidth: '44px', padding: '0 12px', borderRadius: '12px', border: '1px solid var(--border-md)',
  background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
} as const

/**
 * Botón + hoja, listos para montar. `visible` = `puedeEditarElSkins(...)`. La hoja sigue montada aunque el botón se
 * esconda (si el Skins empieza con la hoja abierta, al guardar responde «ya empezó» y la hoja lo muestra).
 */
export function EditarSkins(props: {
  visible: boolean
  /** Sin botón, deja en su lugar la franja «quedaron fijos» del mismo alto (el scorer, en el hoyo de salida). */
  reservarLugar?: boolean
  codigo: string
  creadorId: string
  jugadores: readonly JugadorDelSkinsAEditar[]
  orden: readonly string[]
  courseId: string | null | undefined
  recorridos: string[] | null | undefined
  teeGlobal: string
  pozoPorJugador: number
  onGuardado: () => void
}) {
  const { visible, reservarLugar, teeGlobal, ...datos } = props
  const editor = useEditarSkins(datos)
  return (
    <>
      {visible ? <BotonEditarSkins onAbrir={editor.abrir} /> : reservarLugar ? <FranjaJugadoresFijos /> : null}
      <HojaEditarSkins editor={editor} teeGlobal={teeGlobal} />
    </>
  )
}

export const TEXTO_AYUDA_EDITAR = 'Jugadores, índice y tee: se corrigen antes de anotar.'
export const TEXTO_JUGADORES_FIJOS = 'Con el primer golpe, los jugadores quedaron fijos.'
/** La franja mide lo mismo con botón o sin él: en el scorer, cambiar de una a otra no mueve las tarjetas. */
const franja = { display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 0', minHeight: '52px', boxSizing: 'border-box' } as const

/** El botón «Editar» con su línea de ayuda. */
export function BotonEditarSkins({ onAbrir }: { onAbrir: () => void }) {
  return (
    <div style={franja}>
      <p id={ID_AYUDA} style={{ ...textoChico, flex: 1 }}>{TEXTO_AYUDA_EDITAR}</p>
      <Button type="button" variant="nav" size="md" onClick={onAbrir} aria-describedby={ID_AYUDA}>
        {TEXTO_EDITAR}
      </Button>
    </div>
  )
}

/** Lo que ocupa el lugar del botón en el scorer cuando ya no se edita (mismo alto: las tarjetas no saltan). */
export function FranjaJugadoresFijos() {
  return (
    <div style={franja} data-franja-editar-skins="fija">
      <p style={{ ...textoChico, flex: 1 }}>{TEXTO_JUGADORES_FIJOS}</p>
    </div>
  )
}

/** La hoja: un jugador por fila, «+ Sumar jugador», el pozo resultante y «Guardar». */
export function HojaEditarSkins({ editor, teeGlobal }: { editor: EditorDelSkins; teeGlobal: string }) {
  const { estado } = editor
  const guardando = estado.fase === 'guardando'
  const tees = editor.tees.fase === 'ok' ? editor.tees.tees : []

  return (
    <BottomSheet abierto={editor.abierto} onCerrar={editor.cerrar} etiqueta="Editar jugadores del Skins">
      {estado.fase === 'cerrar' ? (
        <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '8px' }}>
          <p style={{ margin: 0, fontSize: '17px', lineHeight: 1.4, color: 'var(--text)' }}>{estado.mensaje}</p>
          <Button type="button" variant="commit" size="lg" fullWidth onClick={editor.entendido}>Entendido</Button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <h2 style={{ margin: 0, flex: 1, fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>Jugadores del Skins</h2>
            <button type="button" onClick={editor.cerrar} disabled={guardando} style={botonTexto}>Cerrar</button>
          </div>
          <p style={{ ...textoChico, marginBottom: '12px' }}>Cancha, hoyos y reglas no cambian.</p>

          <fieldset disabled={guardando} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {editor.filas.map((f, i) => (
                <li key={f.clave}>
                  {f.tipo === 'existente' ? (
                    <FilaExistente fila={f} editor={editor} tees={tees} teeGlobal={teeGlobal} />
                  ) : (
                    <TarjetaDeRival
                      rival={f.rival}
                      indiceEnLista={i}
                      numeroEnPantalla={i + 1}
                      tees={tees}
                      teeGlobal={teeGlobal}
                      hcp={null}
                      onCampo={(campo, valor) => editor.cambiarRival(f.clave, campo, valor)}
                      onQuitar={() => editor.quitar(f.clave)}
                      onBloqueo={b => editor.marcarBloqueo(f.clave, b)}
                    />
                  )}
                </li>
              ))}
            </ul>

            {editor.tees.fase === 'cargando' && <p role="status" style={{ ...textoChico, margin: '4px 0 8px' }}>Cargando los tees…</p>}
            {editor.tees.fase === 'error' && (
              <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0 8px' }}>
                <p style={{ ...textoChico, flex: 1 }}>No pudimos cargar los tees. El índice sí se puede cambiar.</p>
                <button type="button" onClick={editor.reintentarTees} style={botonTexto}>Reintentar</button>
              </div>
            )}

            <button
              type="button"
              onClick={editor.sumar}
              disabled={editor.enTope}
              aria-describedby={editor.enTope ? 'editar-skins-tope' : undefined}
              style={{
                ...botonTexto, width: '100%', minHeight: '48px', marginTop: '4px', borderStyle: 'dashed',
                color: editor.enTope ? 'var(--text-3)' : 'var(--text)', cursor: editor.enTope ? 'not-allowed' : 'pointer',
              }}
            >
              + Sumar jugador
            </button>
            {editor.enTope && <p id="editar-skins-tope" style={{ ...textoChico, marginTop: '6px' }}>{MENSAJE_EDITAR_TOPE}</p>}
          </fieldset>

          <div
            style={{
              position: 'sticky', bottom: 0, marginTop: '16px', padding: '12px 0 4px',
              background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: '10px',
            }}
          >
            <p className="num" aria-live="polite" style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
              {textoDelPie(editor.pozo, editor.cantidad)}
            </p>
            {estado.fase === 'error' && <p role="alert" style={{ margin: 0, fontSize: '14px', lineHeight: 1.4, color: 'var(--error-fg)' }}>{estado.mensaje}</p>}
            {editor.bloqueaIndice && <p id="editar-skins-bloqueo" style={{ ...textoChico }}>{MENSAJE_EDITAR_INDICE}</p>}
            <Button
              type="button"
              variant="commit"
              size="lg"
              fullWidth
              loading={guardando}
              disabled={guardando || editor.bloqueaIndice}
              aria-describedby={editor.bloqueaIndice ? 'editar-skins-bloqueo' : undefined}
              onClick={() => { void editor.guardar() }}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </>
      )}
    </BottomSheet>
  )
}

/** «Pozo: $40.000 · 4 jugadores» (sin plata: «Sin pozo · 4 jugadores»). */
export function textoDelPie(pozo: number, cantidad: number): string {
  const jugadores = `${cantidad} ${cantidad === 1 ? 'jugador' : 'jugadores'}`
  return pozo > 0 ? `Pozo: ${formatPesos(pozo)} · ${jugadores}` : `Sin pozo · ${jugadores}`
}

/** Un jugador que ya está: nombre fijo, índice, tee y «Quitar» con confirmación (el creador no se quita). */
function FilaExistente({ fila, editor, tees, teeGlobal }: {
  fila: Extract<FilaDelEditor, { tipo: 'existente' }>
  editor: EditorDelSkins
  tees: CourseTee[]
  teeGlobal: string
}) {
  const campo = useCampoHandicap(fila.handicap, v => editor.cambiarExistente(fila.clave, { handicap: v }), b => editor.marcarBloqueo(fila.clave, b))
  const idIndice = `editar-skins-${fila.id}-indice`
  const nombre = nombreOJugadorN(fila.nombre, 1)
  const confirmando = editor.pidiendoQuitar === fila.clave

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
          {fila.nombre}{fila.esCreador && <span style={{ fontWeight: 400, color: 'var(--text-2)' }}> (tú)</span>}
        </span>
        {!fila.esCreador && !confirmando && (
          <button type="button" onClick={() => editor.pedirQuitar(fila.clave)} aria-label={`Quitar a ${nombre}`} style={botonTexto}>
            Quitar
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <label htmlFor={idIndice} style={{ fontSize: '13px', color: 'var(--text-2)' }}>Índice</label>
        <input
          id={idIndice}
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder={PLACEHOLDER_CAMPO_HANDICAP_ANGOSTO}
          value={campo.texto}
          onChange={e => campo.onTexto(e.target.value)}
          aria-invalid={campo.bloquea}
          aria-describedby={campo.invalido || campo.dosDecimales ? `${idIndice}-error` : undefined}
          style={{ ...input, ...inputNumerico, ...(campo.bloquea ? inputQueBloquea : null) }}
        />
        <SelectorDeTeeDelJugador
          tees={tees}
          valor={(fila.tees ?? teeGlobal).toLowerCase()}
          onElegir={t => editor.cambiarExistente(fila.clave, { tees: t })}
          etiquetaAccesible={`Tee de ${nombre}`}
        />
      </div>
      {campo.invalido && <AvisoCampo id={`${idIndice}-error`}>{MENSAJE_HANDICAP_OPCIONAL_NO_ES_NUMERO}</AvisoCampo>}
      {campo.dosDecimales && <AvisoCampo id={`${idIndice}-error`}>{MENSAJE_HANDICAP_UN_DECIMAL}</AvisoCampo>}
      {confirmando && (
        <div role="group" aria-label={`Quitar a ${nombre}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          <p style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>¿Quitar a {nombre} del Skins?</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={editor.cancelarQuitar} style={{ ...botonTexto, flex: 1 }}>Cancelar</button>
            <Button type="button" variant="destructive" size="md" onClick={() => editor.quitar(fila.clave)} style={{ flex: 1 }}>
              Quitar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
