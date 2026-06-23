// Botón primario "Compartir resultado actual" (ronda en curso). Dorado commit,
// consistente con el "Compartir resultado" del cuadro ganador de la finalizada.
export function ShareLeaderboardButton({ isFinished, onShare }: { isFinished: boolean; onShare: () => void }) {
  return (
    <button
      onClick={onShare}
      style={{
        width: '100%', padding: '15px',
        background: '#c4992a', color: 'var(--brand-dark)',
        fontSize: '15px', fontWeight: 700,
        border: 'none', borderRadius: '12px', cursor: 'pointer',
        minHeight: '44px', marginBottom: '12px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {isFinished ? 'Compartir leaderboard' : 'Compartir resultado actual'}
    </button>
  )
}
