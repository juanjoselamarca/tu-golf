'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Portal, Z_OVERLAY, Z_OVERLAY_BACKDROP } from '@/components/ui/Portal'
import { Moon } from '@/components/icons'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { useAvisoNoMolestar } from '@/hooks/ronda/useAvisoNoMolestar'
import { detectarSistemaMovil, type SistemaMovil } from '@/lib/platform'

/**
 * Aviso de cancha "Activa No molestar" — sale una vez por ronda al empezar a jugar.
 * La regla de cuándo sale vive en `useAvisoNoMolestar`; aquí sólo la vista.
 *
 * Copy aprobado por Juanjo (no alargar): badge, título, bajada, Activar / Ahora no.
 * "Activar" no cierra: muestra los 2 pasos del sistema del teléfono (si no se
 * sabe cuál es, los dos) y "Listo" cierra. La app es PWA: no puede silenciar el
 * teléfono por sí misma.
 *
 * Hoja inferior (una mano, pulgar) con tokens del tema: sirve en claro y oscuro.
 */

const PASOS: Record<Exclude<SistemaMovil, 'desconocido'>, { nombre: string; pasos: [string, string] }> = {
  ios: {
    nombre: 'iPhone',
    pasos: ['Abre el Centro de control.', 'Toca Concentración → No molestar.'],
  },
  android: {
    nombre: 'Android',
    pasos: ['Desliza desde arriba hacia abajo.', 'Toca No molestar.'],
  },
}

export function AvisoNoMolestar({ claveRonda }: { claveRonda: string | null }) {
  const { abierto, cerrar } = useAvisoNoMolestar(claveRonda)
  if (!abierto) return null
  return <HojaNoMolestar onClose={cerrar} />
}

export function HojaNoMolestar({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const pasosRef = useRef<HTMLDivElement>(null)
  const [mostrandoPasos, setMostrandoPasos] = useState(false)
  const sistema = useMemo(() => detectarSistemaMovil(), [])
  const sistemas = sistema === 'desconocido' ? (['ios', 'android'] as const) : [sistema]

  useDialogFocus(dialogRef, true, onClose)

  // Al pasar a los pasos, el botón "Activar" desaparece: el foco va a los pasos
  // (el lector de pantalla los lee) y no se pierde en el body.
  useEffect(() => {
    if (mostrandoPasos) pasosRef.current?.focus()
  }, [mostrandoPasos])

  return (
    <Portal>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 bg-black/60"
        style={{ zIndex: Z_OVERLAY_BACKDROP }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aviso-no-molestar-titulo"
        aria-describedby="aviso-no-molestar-bajada"
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md rounded-t-[24px] px-5 pt-3 pb-sheet-safe
                   outline-none motion-safe:animate-[slideUp_260ms_ease-out]"
        style={{
          zIndex: Z_OVERLAY,
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div aria-hidden className="mx-auto mb-5 h-1 w-10 rounded-full" style={{ background: 'var(--text-3)', opacity: 0.4 }} />

        <p
          className="m-0 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--brand-on-bg)' }}
        >
          <Moon aria-hidden className="h-4 w-4" strokeWidth={1.75} />
          Muy recomendable
        </p>

        <h2
          id="aviso-no-molestar-titulo"
          className="m-0 mt-3 font-display text-[24px] font-bold leading-tight"
          style={{ color: 'var(--text)' }}
        >
          Activa &ldquo;No molestar&rdquo; durante tu ronda
        </h2>
        <p
          id="aviso-no-molestar-bajada"
          className="m-0 mt-2 text-base leading-snug"
          style={{ color: 'var(--text-2)' }}
        >
          Mejora el potencial de tu score.
        </p>

        {mostrandoPasos ? (
          <>
            <div
              ref={pasosRef}
              tabIndex={-1}
              role="group"
              aria-label="Cómo activar No molestar"
              className="mt-6 flex flex-col gap-5 outline-none"
            >
              {sistemas.map(s => (
                <section key={s} aria-label={PASOS[s].nombre}>
                  {sistemas.length > 1 && (
                    <h3 className="m-0 mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>
                      {PASOS[s].nombre}
                    </h3>
                  )}
                  <ol className="m-0 flex list-none flex-col gap-3 p-0">
                    {PASOS[s].pasos.map((paso, i) => (
                      <li key={paso} className="flex items-start gap-3">
                        <span
                          aria-hidden
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-sm font-medium tabular-nums"
                          style={{ color: 'var(--brand-on-bg)', border: '1.5px solid var(--brand-on-bg)' }}
                        >
                          {i + 1}
                        </span>
                        <span className="pt-0.5 text-base leading-snug" style={{ color: 'var(--text)' }}>
                          <span className="sr-only">Paso {i + 1}: </span>
                          {paso}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
            <Button variant="commit" size="lg" fullWidth className="mt-7" onClick={onClose}>
              Listo
            </Button>
          </>
        ) : (
          <div className="mt-7 flex flex-col gap-2">
            <Button variant="commit" size="lg" fullWidth onClick={() => setMostrandoPasos(true)}>
              Activar
            </Button>
            <Button variant="ghost" size="md" fullWidth onClick={onClose}>
              Ahora no
            </Button>
          </div>
        )}
      </div>
    </Portal>
  )
}
