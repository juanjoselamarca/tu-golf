'use client'

import { useRef, useState } from 'react'
import { resizeImage } from '@/lib/cover-upload/resize-image'

export interface CoverUploaderProps {
  draftId: string
  /** URL actual (null si no hay portada subida todavía) */
  value: string | null
  /** Llamado cuando el upload termina con éxito y hay nueva URL */
  onChange: (url: string | null) => void
}

type State =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'error', message: string }

/**
 * Reemplazo del input URL de portada. File picker nativo → resize client-side
 * → POST a /api/torneos/draft/[id]/cover → callback con la URL pública.
 *
 * Preview WYSIWYG: misma aspect (16:9) y crop (object-fit:cover) que la hero
 * del tournament page, así el organizador ve exactamente lo que verá el jugador.
 */
export function CoverUploader({ draftId, value, onChange }: CoverUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function handleFile(file: File) {
    setState({ kind: 'uploading' })
    try {
      const blob = await resizeImage(file)
      const fd = new FormData()
      // El backend valida MIME — forzar jpeg porque el resize emite JPEG.
      // Si no se redimensionó (archivo chico), el blob === file y conserva su tipo.
      const upload = blob instanceof File
        ? blob
        : new File([blob], `cover.jpg`, { type: 'image/jpeg' })
      fd.append('file', upload)

      const res = await fetch(`/api/torneos/draft/${draftId}/cover`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'No se pudo subir')
      }
      onChange(data.url)
      setState({ kind: 'idle' })
    } catch (err: any) {
      setState({ kind: 'error', message: err?.message || 'Error subiendo foto' })
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    handleFile(file)
    // Resetear input para permitir re-subir el mismo archivo si se cancela.
    e.target.value = ''
  }

  const hasImage = !!value
  const isBusy = state.kind === 'uploading'

  return (
    <div style={wrapperStyle}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onPick}
        style={{ display: 'none' }}
        aria-label="Seleccionar foto de portada"
      />

      {hasImage ? (
        <div style={previewWrapperStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value!}
            alt="Portada del torneo"
            style={previewImgStyle}
          />
          {isBusy && <div style={overlayStyle}>Subiendo…</div>}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
            style={changeBtnStyle}
            aria-label="Cambiar foto de portada"
          >
            Cambiar foto
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy}
          style={dropzoneStyle(isBusy)}
        >
          {isBusy ? (
            <span style={dropzoneMainStyle}>Subiendo…</span>
          ) : (
            <>
              <span style={dropzoneMainStyle}>Subir foto de portada</span>
              <span style={dropzoneHintStyle}>JPG, PNG o WebP · máximo 5MB</span>
            </>
          )}
        </button>
      )}

      {state.kind === 'error' && (
        <div role="alert" style={errorStyle}>{state.message}</div>
      )}
    </div>
  )
}

const wrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const previewWrapperStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '16 / 9',
  borderRadius: 10,
  overflow: 'hidden',
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--card-bg, #f9fafb)',
}

const previewImgStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.45)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
}

const changeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 10,
  right: 10,
  appearance: 'none',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.4)',
  background: 'rgba(10, 20, 25, 0.65)',
  color: '#fff',
  cursor: 'pointer',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
}

function dropzoneStyle(busy: boolean): React.CSSProperties {
  return {
    appearance: 'none',
    fontFamily: 'inherit',
    width: '100%',
    aspectRatio: '16 / 9',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    border: '2px dashed var(--brand-gold, #c4992a)',
    borderRadius: 10,
    background: 'rgba(196, 153, 42, 0.06)',
    color: 'var(--text-primary, #111827)',
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.7 : 1,
    transition: 'background 120ms ease, border-color 120ms ease',
  }
}

const dropzoneMainStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
}

const dropzoneHintStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary, #4b5563)',
}

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#b91c1c',
  background: 'rgba(220,38,38,0.08)',
  border: '1px solid rgba(220,38,38,0.25)',
  borderRadius: 8,
  padding: '8px 10px',
}
