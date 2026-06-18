'use client'

interface SessionRatingProps {
  rating: number
  setRating: (n: number) => void
  ratingHover: number
  setRatingHover: (n: number) => void
  ratingComment: string
  setRatingComment: (s: string) => void
  ratingSubmitting: boolean
  onSubmit: () => void
}

/**
 * Bloque de rating por estrellas (1-5). Render idéntico al original
 * (page.tsx:621-701). NO se cambia acá — el switch a 👍/👎 es PR2.
 * El caller decide cuándo mostrarlo (showRating && !ratingSubmitted).
 */
export function SessionRating({
  rating,
  setRating,
  ratingHover,
  setRatingHover,
  ratingComment,
  setRatingComment,
  ratingSubmitting,
  onSubmit,
}: SessionRatingProps) {
  return (
    <div style={{
      marginTop: 24,
      padding: 20,
      background: 'rgba(196,153,42,0.06)',
      border: '1px solid rgba(196,153,42,0.15)',
      borderRadius: 12,
    }}>
      <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
        Califica esta sesion con tAIger+
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onClick={() => setRating(star)}
            onMouseEnter={() => setRatingHover(star)}
            onMouseLeave={() => setRatingHover(0)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 28,
              padding: 4,
              color: star <= (ratingHover || rating) ? '#c4992a' : '#3a4a5c',
              transition: 'color 0.15s',
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label={`${star} estrellas`}
          >
            ★
          </button>
        ))}
      </div>
      <input
        type="text"
        value={ratingComment}
        onChange={e => setRatingComment(e.target.value)}
        placeholder="Algun comentario? (opcional)"
        style={{
          width: '100%',
          height: 40,
          background: 'var(--bg)',
          border: '1px solid rgba(196,153,42,0.2)',
          borderRadius: 8,
          padding: '0 12px',
          color: 'var(--text)',
          fontSize: 13,
          outline: 'none',
          marginBottom: 12,
          boxSizing: 'border-box',
        }}
      />
      <button
        onClick={onSubmit}
        disabled={rating === 0 || ratingSubmitting}
        style={{
          width: '100%',
          height: 40,
          borderRadius: 8,
          background: rating > 0 ? '#c4992a' : 'rgba(196,153,42,0.15)',
          border: 'none',
          color: rating > 0 ? 'var(--brand-dark)' : 'var(--text-2)',
          fontSize: 14,
          fontWeight: 600,
          cursor: rating > 0 ? 'pointer' : 'not-allowed',
          opacity: ratingSubmitting ? 0.6 : 1,
        }}
      >
        {ratingSubmitting ? 'Enviando...' : 'Enviar'}
      </button>
    </div>
  )
}
