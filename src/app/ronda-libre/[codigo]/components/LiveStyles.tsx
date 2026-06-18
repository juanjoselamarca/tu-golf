// Keyframes de la vista live (banner slide-up + pulsos del live badge). Verbatim del monolito.
export function LiveStyles() {
  return (
    <style>{`
      @keyframes slideUpBanner {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes livePulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .live-dot {
        animation: livePulse 1.5s ease-in-out infinite;
      }
      .live-badge-pulse {
        animation: liveBadgePulse 3s ease-in-out infinite;
      }
      @keyframes liveBadgePulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.3); }
        50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
      }
    `}</style>
  )
}
