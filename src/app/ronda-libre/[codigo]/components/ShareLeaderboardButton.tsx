// Botón "Compartir leaderboard" (ronda en curso). Verbatim del monolito.
export function ShareLeaderboardButton({ isFinished, onShare }: { isFinished: boolean; onShare: () => void }) {
  return (
    <button
      onClick={onShare}
      style={{
        width: '100%',
        background: isFinished ? 'linear-gradient(135deg, #c9a84c 0%, #b8972f 100%)' : '#ffffff',
        border: isFinished ? 'none' : '1px solid #e5e7eb',
        color: isFinished ? '#0a1419' : '#374151',
        fontSize: isFinished ? '15px' : '13px',
        fontWeight: isFinished ? 700 : 600,
        padding: isFinished ? '14px 16px' : '10px 16px',
        borderRadius: isFinished ? '14px' : '10px',
        cursor: 'pointer',
        minHeight: '44px',
        marginBottom: '12px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        boxShadow: isFinished ? '0 4px 20px rgba(201,168,76,0.4)' : 'none',
      }}
    >
      {isFinished ? 'Compartir leaderboard' : 'Compartir resultado actual'}
    </button>
  )
}
