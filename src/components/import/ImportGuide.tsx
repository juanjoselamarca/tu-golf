'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

/* ───────────────────────────────────────────────────────────
   Types
   ─────────────────────────────────────────────────────────── */

interface ImportGuideProps {
  source: 'photos' | 'csv' | 'garmin_zip'
  onFilesSelected: (files: FileList) => void
  onBack: () => void
  uploading: boolean
  error: string | null
}

/* ───────────────────────────────────────────────────────────
   Shared CSS keyframes (injected once)
   ─────────────────────────────────────────────────────────── */

const SHARED_STYLES = `
  @keyframes igFadeSlideUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes igDropPulse {
    0%, 100% { border-color: rgba(196,153,42,0.25); }
    50%      { border-color: rgba(196,153,42,0.55); }
  }
  @keyframes igSpin {
    to { transform: rotate(360deg); }
  }
  @keyframes igFingerTap {
    0%, 100% { transform: translate(-50%, 0) scale(1); opacity: 0.9; }
    50%      { transform: translate(-50%, 2px) scale(0.92); opacity: 1; }
  }
  @keyframes igEnvelopeBounce {
    0%, 100% { transform: translateY(0); }
    30%      { transform: translateY(-6px); }
    50%      { transform: translateY(0); }
    70%      { transform: translateY(-3px); }
  }
  @keyframes igFlash {
    0%   { opacity: 0; }
    15%  { opacity: 0.7; }
    100% { opacity: 0; }
  }
  @keyframes igCameraSlide {
    0%   { opacity: 0; transform: translate(12px, -12px) scale(0.7); }
    100% { opacity: 1; transform: translate(0, 0) scale(1); }
  }
  @keyframes igTimelineDraw {
    from { height: 0; }
    to   { height: 100%; }
  }
`

/* ───────────────────────────────────────────────────────────
   Inline SVG icons
   ─────────────────────────────────────────────────────────── */

function LightbulbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c4992a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4992a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function DownloadArrowIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(196,153,42,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c4992a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

/* ───────────────────────────────────────────────────────────
   Shared sub-components
   ─────────────────────────────────────────────────────────── */

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 44, height: 44,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        color: 'var(--text-2)',
        fontSize: 18,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      &larr;
    </button>
  )
}

function Header({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
      <BackButton onClick={onBack} />
      <div>
        <h2 style={{
          fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0,
          fontFamily: 'var(--font-playfair)',
        }}>
          {title}
        </h2>
        <p style={{ color: 'var(--text-2)', fontSize: 13, margin: 0, marginTop: 2 }}>
          {subtitle}
        </p>
      </div>
    </div>
  )
}

function StepNumber({ n }: { n: number }) {
  return (
    <span style={{
      width: 40, height: 40, minWidth: 40,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #c4992a, #e8c06a)',
      color: 'var(--brand-dark)',
      borderRadius: '50%',
      fontSize: 16, fontWeight: 700, flexShrink: 0,
      boxShadow: '0 2px 8px rgba(196,153,42,0.25)',
    }}>
      {n}
    </span>
  )
}

function DropZone({
  fileInputRef, onDragOver, onDragLeave, onDrop, dragOver, uploading,
  accept, multiple, onFileChange, buttonLabel, uploadingLabel, idleLabel, hintLabel,
}: {
  fileInputRef: React.RefObject<HTMLInputElement>
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  dragOver: boolean
  uploading: boolean
  accept: string
  multiple: boolean
  onFileChange: (files: FileList | null) => void
  buttonLabel: string
  uploadingLabel: string
  idleLabel: string
  hintLabel: string
}) {
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={e => onFileChange(e.target.files)}
        style={{ display: 'none' }}
      />

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
        style={{
          width: '100%',
          padding: '32px 20px',
          borderRadius: 16,
          border: dragOver ? '2px solid #c4992a' : '2px dashed rgba(196,153,42,0.25)',
          background: dragOver
            ? 'rgba(196,153,42,0.08)'
            : uploading ? 'rgba(196,153,42,0.03)' : 'rgba(255,255,255,0.02)',
          cursor: uploading ? 'not-allowed' : 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          transition: 'all 0.25s ease',
          animation: uploading ? 'none' : 'igDropPulse 3s ease-in-out infinite',
          marginBottom: 14,
        }}
      >
        {uploading ? (
          <>
            <div style={{
              width: 32, height: 32,
              border: '3px solid rgba(196,153,42,0.15)',
              borderTopColor: '#c4992a',
              borderRadius: '50%',
              animation: 'igSpin 1s linear infinite',
            }} />
            <span style={{ color: 'var(--text-2)', fontSize: 14 }}>{uploadingLabel}</span>
          </>
        ) : (
          <>
            <UploadIcon />
            <span style={{ color: 'var(--text-2)', fontSize: 14, textAlign: 'center' }}>
              {idleLabel}
            </span>
            <span style={{ color: 'var(--text-3, #5a6a7d)', fontSize: 12 }}>
              {hintLabel}
            </span>
          </>
        )}
      </div>

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        style={{
          width: '100%', padding: 16, borderRadius: 14,
          fontSize: 16, fontWeight: 700,
          background: uploading ? 'rgba(196,153,42,0.3)' : 'linear-gradient(135deg, #c4992a, #e8c06a)',
          color: uploading ? 'rgba(255,255,255,0.5)' : 'var(--brand-dark)',
          border: 'none',
          cursor: uploading ? 'not-allowed' : 'pointer',
          minHeight: 52, transition: 'all 0.2s ease',
          letterSpacing: '0.01em',
        }}
      >
        {uploading ? 'Procesando...' : buttonLabel}
      </button>
    </>
  )
}

function ErrorMsg({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p style={{ color: '#ff6666', fontSize: 13, marginTop: 12, textAlign: 'center' }}>
      {error}
    </p>
  )
}

/* ───────────────────────────────────────────────────────────
   CSS Illustrations — Phone frame components
   ─────────────────────────────────────────────────────────── */

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: 140, height: 260,
      border: '3px solid rgba(255,255,255,0.15)',
      borderRadius: 24,
      background: '#1a1a2e',
      overflow: 'hidden',
      position: 'relative',
      margin: '16px auto 0',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
    }}>
      {/* Notch */}
      <div style={{
        width: 60, height: 6,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        margin: '8px auto 6px',
      }} />
      {children}
    </div>
  )
}

/** Step 1: Garmin Golf activity list with animated tap */
function PhoneActivityList() {
  return (
    <PhoneFrame>
      <div style={{ padding: '0 10px' }}>
        {/* App title */}
        <div style={{
          fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.7)',
          textAlign: 'center', marginBottom: 8, letterSpacing: '0.05em',
        }}>
          GARMIN GOLF
        </div>
        {/* Activity list */}
        {[0.6, 0.5, 0.45, 0.55, 0.5, 0.4].map((w, i) => (
          <div key={i} style={{
            position: 'relative',
            height: 22,
            marginBottom: 6,
            borderRadius: 4,
            background: i === 2 ? 'rgba(196,153,42,0.2)' : 'rgba(255,255,255,0.06)',
            border: i === 2 ? '1px solid rgba(196,153,42,0.35)' : '1px solid transparent',
            display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4,
          }}>
            {/* Fake flag icon */}
            <div style={{
              width: 6, height: 6, borderRadius: 1,
              background: i === 2 ? '#c4992a' : 'rgba(255,255,255,0.15)',
            }} />
            {/* Fake text bar */}
            <div style={{
              height: 4, borderRadius: 2,
              width: `${w * 100}%`,
              background: i === 2 ? 'rgba(196,153,42,0.5)' : 'rgba(255,255,255,0.1)',
            }} />
          </div>
        ))}
        {/* Animated finger tap indicator on the highlighted row */}
        <div style={{
          position: 'absolute',
          left: '50%', top: 98,
          width: 18, height: 18,
          borderRadius: '50%',
          background: 'rgba(196,153,42,0.35)',
          border: '2px solid rgba(196,153,42,0.6)',
          animation: 'igFingerTap 2s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      </div>
    </PhoneFrame>
  )
}

/** Step 2: Scorecard grid view */
function PhoneScorecardView() {
  const holeScores = [4, 5, 3, 4, 5, 4, 3, 5, 4]
  return (
    <PhoneFrame>
      <div style={{ padding: '0 8px' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
          {['Resumen', 'Scorecard', 'Stats'].map((t, i) => (
            <div key={t} style={{
              flex: 1, textAlign: 'center',
              fontSize: 7, padding: '4px 0',
              color: i === 1 ? '#c4992a' : 'rgba(255,255,255,0.35)',
              fontWeight: i === 1 ? 700 : 400,
              borderBottom: i === 1 ? '2px solid #c4992a' : '2px solid transparent',
            }}>
              {t}
            </div>
          ))}
        </div>
        {/* Hole numbers row */}
        <div style={{ display: 'flex', gap: 1, marginBottom: 3 }}>
          {[1,2,3,4,5,6,7,8,9].map(h => (
            <div key={h} style={{
              flex: 1, textAlign: 'center',
              fontSize: 6, color: 'rgba(255,255,255,0.3)',
              fontWeight: 600,
            }}>
              {h}
            </div>
          ))}
        </div>
        {/* Par row */}
        <div style={{ display: 'flex', gap: 1, marginBottom: 3 }}>
          {[4,5,3,4,5,4,3,5,4].map((p, i) => (
            <div key={i} style={{
              flex: 1, textAlign: 'center',
              fontSize: 6, color: 'rgba(255,255,255,0.2)',
            }}>
              {p}
            </div>
          ))}
        </div>
        {/* Score row */}
        <div style={{ display: 'flex', gap: 1, marginBottom: 6 }}>
          {holeScores.map((s, i) => (
            <div key={i} style={{
              flex: 1, textAlign: 'center',
              fontSize: 8, fontWeight: 700,
              color: s <= 3 ? '#4ade80' : s >= 6 ? '#f87171' : 'rgba(255,255,255,0.7)',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 2, padding: '3px 0',
            }}>
              {s}
            </div>
          ))}
        </div>
        {/* Back 9 label */}
        <div style={{ display: 'flex', gap: 1, marginBottom: 3 }}>
          {[10,11,12,13,14,15,16,17,18].map(h => (
            <div key={h} style={{
              flex: 1, textAlign: 'center',
              fontSize: 6, color: 'rgba(255,255,255,0.3)',
              fontWeight: 600,
            }}>
              {h}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 1, marginBottom: 3 }}>
          {[4,4,3,5,4,4,3,5,4].map((p, i) => (
            <div key={i} style={{
              flex: 1, textAlign: 'center',
              fontSize: 6, color: 'rgba(255,255,255,0.2)',
            }}>
              {p}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 1 }}>
          {[5,4,3,6,4,5,3,4,5].map((s, i) => (
            <div key={i} style={{
              flex: 1, textAlign: 'center',
              fontSize: 8, fontWeight: 700,
              color: s <= 3 ? '#4ade80' : s >= 6 ? '#f87171' : 'rgba(255,255,255,0.7)',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 2, padding: '3px 0',
            }}>
              {s}
            </div>
          ))}
        </div>
        {/* Total */}
        <div style={{
          textAlign: 'center', marginTop: 10,
          fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)',
        }}>
          Total: 78
        </div>
      </div>
    </PhoneFrame>
  )
}

/** Step 3: Screenshot action */
function PhoneScreenshot() {
  return (
    <PhoneFrame>
      <div style={{ padding: '0 8px' }}>
        {/* Simplified scorecard preview */}
        <div style={{
          fontSize: 7, color: 'rgba(255,255,255,0.4)',
          textAlign: 'center', marginBottom: 6, fontWeight: 600,
        }}>
          Scorecard
        </div>
        {/* Mini grid */}
        {[0,1,2].map(row => (
          <div key={row} style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 10, borderRadius: 2,
                background: 'rgba(255,255,255,0.06)',
              }} />
            ))}
          </div>
        ))}
      </div>
      {/* Flash overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(255,255,255,0.6)',
        borderRadius: 21,
        animation: 'igFlash 3s ease-out infinite',
        pointerEvents: 'none',
      }} />
      {/* Camera icon sliding in */}
      <div style={{
        position: 'absolute', top: 10, right: 10,
        animation: 'igCameraSlide 0.6s ease-out 0.3s both',
      }}>
        <CameraIcon />
      </div>
    </PhoneFrame>
  )
}

/* ───────────────────────────────────────────────────────────
   CSS Illustrations — Garmin ZIP mini illustrations
   ─────────────────────────────────────────────────────────── */

function BrowserBar() {
  return (
    <div style={{
      width: 140, margin: '12px auto 0',
      borderRadius: 8,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      overflow: 'hidden',
    }}>
      {/* Browser chrome */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '5px 8px',
        background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map(c => (
            <div key={c} style={{ width: 5, height: 5, borderRadius: '50%', background: c, opacity: 0.7 }} />
          ))}
        </div>
        <div style={{
          flex: 1, height: 14, borderRadius: 4,
          background: 'rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 6, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace',
        }}>
          garmin.com/account
        </div>
      </div>
      {/* Body */}
      <div style={{ padding: '8px 10px' }}>
        <div style={{ height: 4, width: '60%', borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginBottom: 6 }} />
        <div style={{ height: 3, width: '80%', borderRadius: 2, background: 'rgba(255,255,255,0.05)', marginBottom: 4 }} />
        <div style={{ height: 3, width: '45%', borderRadius: 2, background: 'rgba(255,255,255,0.05)' }} />
      </div>
    </div>
  )
}

function SettingsMenu() {
  return (
    <div style={{
      width: 140, margin: '12px auto 0',
      borderRadius: 8,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      overflow: 'hidden', padding: 8,
    }}>
      {['Perfil', 'Gestionar datos', 'Notificaciones'].map((item, i) => (
        <div key={item} style={{
          padding: '6px 8px',
          borderRadius: 5,
          marginBottom: i < 2 ? 3 : 0,
          background: i === 1 ? 'rgba(196,153,42,0.15)' : 'transparent',
          border: i === 1 ? '1px solid rgba(196,153,42,0.3)' : '1px solid transparent',
          fontSize: 8,
          color: i === 1 ? '#c4992a' : 'rgba(255,255,255,0.35)',
          fontWeight: i === 1 ? 700 : 400,
        }}>
          {item}
        </div>
      ))}
    </div>
  )
}

function ExportButton() {
  return (
    <div style={{
      width: 140, margin: '12px auto 0',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    }}>
      <div style={{
        padding: '8px 16px',
        borderRadius: 8,
        background: 'linear-gradient(135deg, rgba(196,153,42,0.2), rgba(196,153,42,0.1))',
        border: '1px solid rgba(196,153,42,0.3)',
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 9, fontWeight: 600, color: '#c4992a',
      }}>
        <DownloadArrowIcon size={12} />
        Export Data
      </div>
    </div>
  )
}

function EnvelopeIllustration() {
  return (
    <div style={{
      width: 140, margin: '12px auto 0',
      display: 'flex', justifyContent: 'center',
    }}>
      <div style={{ animation: 'igEnvelopeBounce 2.5s ease-in-out infinite' }}>
        <svg width="44" height="36" viewBox="0 0 44 36" fill="none">
          <rect x="2" y="6" width="40" height="28" rx="4" stroke="rgba(196,153,42,0.6)" strokeWidth="2" fill="rgba(196,153,42,0.08)" />
          <path d="M2 10l20 12 20-12" stroke="rgba(196,153,42,0.5)" strokeWidth="2" fill="none" />
          {/* Notification dot */}
          <circle cx="36" cy="8" r="5" fill="#c4992a" opacity="0.8" />
          <text x="36" y="11" textAnchor="middle" fill="var(--brand-dark)" fontSize="7" fontWeight="700">1</text>
        </svg>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   PhotoGuide
   ─────────────────────────────────────────────────────────── */

function PhotoGuide({
  onFilesSelected, onBack, uploading, error,
}: Omit<ImportGuideProps, 'source'>) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [stepsVisible, setStepsVisible] = useState([false, false, false])

  useEffect(() => {
    const timers = [0, 1, 2].map(i =>
      setTimeout(() => setStepsVisible(prev => {
        const n = [...prev]; n[i] = true; return n
      }), 150 + i * 200)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  const handleFileChange = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    onFilesSelected(files)
  }, [onFilesSelected])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
    if (e.dataTransfer.files?.length) handleFileChange(e.dataTransfer.files)
  }, [handleFileChange])

  const steps: { text: string; illustration: React.ReactNode }[] = [
    { text: 'Abre Garmin Golf en tu celular', illustration: <PhoneActivityList /> },
    { text: 'Entra a una ronda y busca la Scorecard', illustration: <PhoneScorecardView /> },
    { text: 'Toma un pantallazo de la scorecard', illustration: <PhoneScreenshot /> },
  ]

  return (
    <div style={{ paddingTop: 16 }}>
      <style>{SHARED_STYLES}</style>

      <Header
        title="Pantallazo de scorecard"
        subtitle="La IA lee los numeros exactos de cada hoyo"
        onBack={onBack}
      />

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              padding: '20px 18px',
              background: 'var(--bg-surface)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16,
              opacity: stepsVisible[i] ? 1 : 0,
              transform: stepsVisible[i] ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
            }}
          >
            {/* Step header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <StepNumber n={i + 1} />
              <span style={{
                color: 'var(--text)', fontSize: 15, fontWeight: 600, lineHeight: 1.4,
              }}>
                {step.text}
              </span>
            </div>
            {/* Illustration */}
            {step.illustration}
          </div>
        ))}
      </div>

      {/* Tip */}
      <div style={{
        padding: '14px 16px',
        background: 'rgba(196,153,42,0.04)',
        border: '1px solid rgba(196,153,42,0.12)',
        borderRadius: 12, marginBottom: 24,
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <LightbulbIcon />
        <span style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.6 }}>
          Para mas de 10 tarjetas, te recomendamos usar el archivo de Garmin — es mas rapido y preciso.
        </span>
      </div>

      {/* Drop zone */}
      <DropZone
        fileInputRef={fileInputRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        dragOver={dragOver}
        uploading={uploading}
        accept=".jpg,.jpeg,.png,.heic"
        multiple
        onFileChange={handleFileChange}
        buttonLabel="Seleccionar pantallazos"
        uploadingLabel="Subiendo fotos..."
        idleLabel="Arrastra tus pantallazos aqui o toca para seleccionar"
        hintLabel="JPG, PNG o HEIC — hasta 20 fotos"
      />

      <ErrorMsg error={error} />
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   GarminGuide
   ─────────────────────────────────────────────────────────── */

function GarminGuide({
  onFilesSelected, onBack, uploading, error,
}: Omit<ImportGuideProps, 'source'>) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [stepsVisible, setStepsVisible] = useState([false, false, false, false])

  useEffect(() => {
    const timers = [0, 1, 2, 3].map(i =>
      setTimeout(() => setStepsVisible(prev => {
        const n = [...prev]; n[i] = true; return n
      }), 150 + i * 200)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  const handleFileChange = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    onFilesSelected(files)
  }, [onFilesSelected])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
    if (e.dataTransfer.files?.length) handleFileChange(e.dataTransfer.files)
  }, [handleFileChange])

  const garminSteps: {
    title: string; description: string;
    link?: { url: string; label: string };
    illustration: React.ReactNode;
  }[] = [
    {
      title: 'Abre garmin.com e inicia sesion',
      description: 'Usa el mismo email y contraseña de tu cuenta Garmin — la misma del reloj o de la app Garmin Connect.',
      link: { url: 'https://www.garmin.com/account', label: 'Ir a garmin.com/account' },
      illustration: <BrowserBar />,
    },
    {
      title: 'En el menu izquierdo, haz click en "Gestion de datos"',
      description: 'Es la ultima opcion del menu lateral izquierdo, debajo de "Centro de seguridad". En ingles aparece como "Data Management".',
      illustration: <SettingsMenu />,
    },
    {
      title: 'Haz click en "Exportar tus Datos"',
      description: 'Veras tres opciones: Ver, Exportar y Borrar. Haz click en "Exportar tus Datos" — Garmin solicita una copia de todos tus datos personales incluyendo tu historial de golf.',
      illustration: <ExportButton />,
    },
    {
      title: 'Descarga el ZIP del email que te enviara Garmin',
      description: 'En 24 a 48 horas recibiras un correo de Garmin con un link de descarga. Baja el archivo ZIP y subelo aqui tal cual, sin descomprimir.',
      illustration: <EnvelopeIllustration />,
    },
  ]

  return (
    <div style={{ paddingTop: 16 }}>
      <style>{SHARED_STYLES}</style>

      <Header
        title="Archivo de Garmin"
        subtitle="Todas tus rondas de una sola vez, con datos completos"
        onBack={onBack}
      />

      {/* PC recommendation alert */}
      <div style={{
        padding: '12px 16px', marginBottom: 16,
        background: 'rgba(59,130,246,0.06)',
        border: '1px solid rgba(59,130,246,0.15)',
        borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <span style={{ color: '#93b4e4', fontSize: 12, lineHeight: 1.5 }}>
          <strong style={{ color: '#60a5fa' }}>Recomendado desde un computador</strong> — el proceso es mas comodo y rapido desde el navegador del PC.
        </span>
      </div>

      {/* Phase 1 */}
      <div style={{
        padding: '14px 16px', marginBottom: 20,
        background: 'rgba(196,153,42,0.04)',
        border: '1px solid rgba(196,153,42,0.12)',
        borderRadius: 14,
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#c4992a', margin: '0 0 4px' }}>
          Solicitar tus datos a Garmin
        </h3>
        <p style={{ color: 'var(--text-2)', fontSize: 12, margin: 0, opacity: 0.8 }}>
          Solo necesitas hacer esto una vez — despues importar es instantaneo
        </p>
      </div>

      {/* Timeline steps */}
      <div style={{ position: 'relative', marginBottom: 32, paddingLeft: 20 }}>
        {/* Vertical gold timeline line */}
        <div style={{
          position: 'absolute', left: 19, top: 20, bottom: 20, width: 2,
          background: 'rgba(196,153,42,0.15)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: '100%',
            background: 'linear-gradient(180deg, #c4992a, rgba(196,153,42,0.3))',
            animation: 'igTimelineDraw 1.5s ease-out forwards',
          }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {garminSteps.map((step, i) => (
            <div
              key={i}
              style={{
                padding: '18px 16px',
                background: 'var(--bg-surface)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16,
                opacity: stepsVisible[i] ? 1 : 0,
                transform: stepsVisible[i] ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
              }}
            >
              {/* Step header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <StepNumber n={i + 1} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    color: 'var(--text)', fontSize: 15, fontWeight: 600,
                    lineHeight: 1.4, marginBottom: step.description ? 4 : 0,
                  }}>
                    {step.title}
                  </div>
                  {step.description && (
                    <div style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
                      {step.description}
                    </div>
                  )}
                  {step.link && (
                    <a
                      href={step.link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        marginTop: 8, color: '#c4992a',
                        fontSize: 13, fontWeight: 600,
                        textDecoration: 'none',
                        borderBottom: '1px solid rgba(196,153,42,0.4)',
                        paddingBottom: 1,
                      }}
                    >
                      {step.link.label} &rarr;
                    </a>
                  )}
                </div>
              </div>
              {/* Illustration */}
              {step.illustration}
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
      }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
        <span style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
          Ya tienes el archivo?
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      </div>

      {/* Drop zone */}
      <DropZone
        fileInputRef={fileInputRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        dragOver={dragOver}
        uploading={uploading}
        accept=".zip"
        multiple={false}
        onFileChange={handleFileChange}
        buttonLabel="Seleccionar archivo ZIP"
        uploadingLabel="Procesando archivo ZIP..."
        idleLabel="Arrastra tu archivo ZIP de Garmin aqui"
        hintLabel="Archivo .zip sin descomprimir"
      />

      <ErrorMsg error={error} />

      {/* Trust note */}
      <div style={{
        padding: '14px 16px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, marginTop: 20,
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <LockIcon />
        <span style={{ color: 'var(--text-2)', fontSize: 12, lineHeight: 1.6, opacity: 0.8 }}>
          Garmin te envia toda tu data. Nosotros solo leemos tus scores de golf, putts y fairways. Nada mas se almacena.
        </span>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   CsvGuide
   ─────────────────────────────────────────────────────────── */

function CsvGuide({
  onFilesSelected, onBack, uploading, error,
}: Omit<ImportGuideProps, 'source'>) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [stepsVisible, setStepsVisible] = useState([false, false, false])

  useEffect(() => {
    const timers = [0, 1, 2].map(i =>
      setTimeout(() => setStepsVisible(prev => {
        const n = [...prev]; n[i] = true; return n
      }), 150 + i * 200)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  const handleFileChange = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    onFilesSelected(files)
  }, [onFilesSelected])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
    if (e.dataTransfer.files?.length) handleFileChange(e.dataTransfer.files)
  }, [handleFileChange])

  const csvSteps = [
    { text: 'Abre connect.garmin.com en tu PC' },
    { text: "Ve a 'Actividades' y filtra por Golf" },
    { text: 'Descarga como CSV' },
  ]

  return (
    <div style={{ paddingTop: 16 }}>
      <style>{SHARED_STYLES}</style>

      <Header
        title="Archivo de Garmin Connect"
        subtitle="Importa tu historial completo desde el CSV"
        onBack={onBack}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {csvSteps.map((step, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 18px',
              background: 'var(--bg-surface)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14,
              opacity: stepsVisible[i] ? 1 : 0,
              transform: stepsVisible[i] ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
            }}
          >
            <StepNumber n={i + 1} />
            <span style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
              {step.text}
            </span>
          </div>
        ))}
      </div>

      {/* Tip */}
      <div style={{
        padding: '14px 16px',
        background: 'rgba(196,153,42,0.04)',
        border: '1px solid rgba(196,153,42,0.12)',
        borderRadius: 12, marginBottom: 24,
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <LightbulbIcon />
        <div>
          <span style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
            Recomendamos hacer esto desde el computador para mayor comodidad
          </span>
          <a
            href="https://connect.garmin.com/modern/activities"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#c4992a', fontSize: 13,
              textDecoration: 'none', borderBottom: '1px solid rgba(196,153,42,0.4)',
              paddingBottom: 1, marginTop: 6, display: 'inline-block',
            }}
          >
            connect.garmin.com/modern/activities
          </a>
        </div>
      </div>

      <DropZone
        fileInputRef={fileInputRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        dragOver={dragOver}
        uploading={uploading}
        accept=".csv,.xlsx"
        multiple={false}
        onFileChange={handleFileChange}
        buttonLabel="Seleccionar archivo"
        uploadingLabel="Procesando archivo..."
        idleLabel="Arrastra tu archivo aqui o toca para seleccionar"
        hintLabel="CSV o XLSX"
      />

      <ErrorMsg error={error} />
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   Main export
   ─────────────────────────────────────────────────────────── */

export default function ImportGuide({
  source, onFilesSelected, onBack, uploading, error,
}: ImportGuideProps) {
  if (source === 'photos') return <PhotoGuide onFilesSelected={onFilesSelected} onBack={onBack} uploading={uploading} error={error} />
  if (source === 'garmin_zip') return <GarminGuide onFilesSelected={onFilesSelected} onBack={onBack} uploading={uploading} error={error} />
  return <CsvGuide onFilesSelected={onFilesSelected} onBack={onBack} uploading={uploading} error={error} />
}
