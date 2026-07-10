/**
 * Menú "..." de cada tarjeta del historial:
 *   - Editar          → navega a /perfil/historial/{id}?edit=1
 *   - Excluir/Incluir → toggle excluded_from_handicap
 *   - Eliminar        → abre ConfirmDeleteSheet inline (NO window.confirm)
 *
 * FIX bug inbox f772e78b: el monolito usaba window.confirm() que en
 * algunos contextos PWA/Safari aparece detrás del menú o queda bloqueado,
 * dando la sensación de "no hace nada". Reemplazado por sheet inline.
 *
 * Pequeño toast inline para feedback de "Excluida" / "Incluida" — sin
 * feedback explícito el toggle se sentía mudo (bug raíz del reporte).
 */
'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Trash2 } from '@/components/icons'

interface Props {
  open:                  boolean
  isExcluded:            boolean
  deleting:              boolean
  /**
   * Botón "…" que ancla el menú. El menú se posiciona con `position: fixed`
   * calculado desde el rect de este botón y se renderiza vía portal en
   * document.body — así ESCAPA el stacking context y el `overflow: hidden`
   * de la tarjeta.
   *
   * Bug inbox 7ef9ebdb ("los desplegables no funcionan, solo si abro la
   * tarjeta detallada primero"): cada RoundCard tiene `.card-animate`, cuya
   * animación deja un `transform` retenido (fill-mode both). Un transform crea
   * un stacking context POR tarjeta → el menú `position: absolute` de la card
   * de arriba se PINTABA DEBAJO de las cards siguientes (contextos hermanos),
   * así que los clicks caían en la card de abajo (que navega al detalle) en vez
   * de en el ítem del menú. Con la tarjeta ya expandida el menú caía dentro de
   * su propia card → por eso "solo funcionaba si abría el detalle antes".
   * Además el contenedor del mes tiene `overflow: hidden`, que clippeaba el
   * menú de la última tarjeta. El portal + fixed resuelve las dos cosas.
   */
  anchorRef:             React.RefObject<HTMLElement>
  onClose:               () => void
  onEdit:                () => void
  onToggleExcluded:      () => void
  onRequestDelete:       () => void
}

const MENU_WIDTH = 190
const MENU_EST_HEIGHT = 152 // 3 ítems de 44px + padding; solo para decidir flip

export function RoundMenu({
  open, isExcluded, deleting, anchorRef,
  onClose, onEdit, onToggleExcluded, onRequestDelete,
}: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Posicionar el menú bajo el botón (o encima si no entra abajo).
  useLayoutEffect(() => {
    if (!open) return
    const compute = () => {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      // Alinear el borde derecho del menú con el borde derecho del botón.
      const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
      const below = r.bottom + 4
      const fitsBelow = below + MENU_EST_HEIGHT <= window.innerHeight - 8
      const top = fitsBelow ? below : Math.max(8, r.top - MENU_EST_HEIGHT - 4)
      setPos({ top, left })
    }
    compute()
    // Reposicionar / cerrar en scroll o resize para no quedar desanclado.
    const onScroll = () => onClose()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', compute)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', compute)
    }
  }, [open, anchorRef, onClose])

  if (!open || typeof document === 'undefined' || !pos) return null

  return createPortal(
    <>
      {/* Backdrop click-outside — dim sutil para que el menú resalte sobre las
          tarjetas (menú blanco sobre card blanca se veía "roto", como texto
          superpuesto a la tarjeta de abajo; bug visual inbox 37348220).
          En el portal (body), el `position: fixed` cubre TODO el viewport. */}
      <div
        onClick={(e) => { e.stopPropagation(); onClose() }}
        style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15,28,47,0.32)' }}
        aria-hidden
      />
      <div
        role="menu"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: pos.top, left: pos.left,
          width: MENU_WIDTH,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.22), 0 3px 8px rgba(0,0,0,0.12)',
          padding: '4px',
          zIndex: 1000,
        }}
      >
        <MenuButton
          icon={<Pencil size={14} strokeWidth={1.75} />}
          onClick={(e) => { e.stopPropagation(); onClose(); onEdit() }}
          dataTestid="historial-menu-editar"
        >
          Editar
        </MenuButton>
        <MenuButton
          icon={<span style={{
            width: 14, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
          }} aria-hidden>
            {isExcluded ? '✓' : 'ø'}
          </span>}
          onClick={(e) => { e.stopPropagation(); onClose(); onToggleExcluded() }}
          dataTestid="historial-menu-toggle-excluded"
        >
          {isExcluded ? 'Incluir en índice' : 'Excluir del índice'}
        </MenuButton>
        <MenuButton
          icon={<Trash2 size={14} strokeWidth={1.75} />}
          onClick={(e) => { e.stopPropagation(); onClose(); onRequestDelete() }}
          disabled={deleting}
          danger
          dataTestid="historial-menu-eliminar"
        >
          {deleting ? 'Eliminando…' : 'Eliminar'}
        </MenuButton>
      </div>
    </>,
    document.body,
  )
}

interface MenuButtonProps {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  disabled?: boolean
  danger?: boolean
  dataTestid?: string
}

function MenuButton({ icon, children, onClick, disabled, danger, dataTestid }: MenuButtonProps) {
  const color = danger ? '#dc2626' : 'var(--text)'
  const hoverBg = danger ? 'rgba(220,38,38,0.08)' : 'rgba(196,153,42,0.08)'
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      data-testid={dataTestid}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 12px', minHeight: '44px',
        background: 'none', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '13px', color,
        fontFamily: '"DM Sans", system-ui, sans-serif',
        borderRadius: '6px',
        textAlign: 'left',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = hoverBg }}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
    >
      {icon}
      {children}
    </button>
  )
}

/** Sheet inline de confirmación destructiva (reemplaza window.confirm). */
export interface ConfirmDeleteSheetProps {
  open:           boolean
  courseLabel:    string
  dateLabel:      string
  deleting:       boolean
  onConfirm:      () => void
  onCancel:       () => void
}

export function ConfirmDeleteSheet({
  open, courseLabel, dateLabel, deleting, onConfirm, onCancel,
}: ConfirmDeleteSheetProps) {
  // Para focus management
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // Focus en cancel por seguridad (acción destructiva).
      requestAnimationFrame(() => cancelBtnRef.current?.focus())
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !deleting) onCancel() }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }
    setMounted(false)
  }, [open, deleting, onCancel])

  if (!open && !mounted) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      data-testid="historial-confirm-delete-sheet"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !deleting) onCancel() }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          width: '100%', maxWidth: '440px',
          borderRadius: '16px 16px 0 0',
          padding: '20px 20px 24px',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          aria-hidden
          style={{
            width: '40px', height: '4px',
            background: 'var(--border)',
            borderRadius: '4px',
            margin: '0 auto 16px',
          }}
        />
        <h3
          id="confirm-delete-title"
          style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '18px', fontWeight: 700,
            color: 'var(--text)', margin: '0 0 8px',
          }}
        >
          ¿Eliminar esta ronda?
        </h3>
        <p style={{
          fontSize: '14px', color: 'var(--text-2)',
          margin: '0 0 4px', lineHeight: 1.5,
        }}>
          <strong style={{ color: 'var(--text)' }}>{courseLabel}</strong>
        </p>
        <p style={{
          fontSize: '13px', color: 'var(--text-3)',
          margin: '0 0 18px',
        }}>
          {dateLabel} · Esta acción no se puede deshacer y el índice se recalculará.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            disabled={deleting}
            data-testid="historial-confirm-delete-cancel"
            style={{
              flex: 1, height: '48px',
              background: 'transparent',
              color: 'var(--text-2)',
              fontWeight: 600, fontSize: '14px',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              cursor: deleting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            data-testid="historial-confirm-delete-confirm"
            style={{
              flex: 1, height: '48px',
              background: '#dc2626',
              color: '#ffffff',
              fontWeight: 700, fontSize: '14px',
              border: 'none', borderRadius: '10px',
              cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting ? 'Eliminando…' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}
