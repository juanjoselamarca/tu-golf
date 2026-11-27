const gold = { color: 'var(--brand-on-bg)' }

/**
 * The tAIger+ wordmark, treated like Golfers+ (DM Sans 700, gold "+"). "AI" also goes in gold: in DM Sans a lone
 * capital I reads as an l ("tAlger+"). Size and base color come from the parent.
 */
export function TaigerWordmark() {
  return (
    <span style={{ fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 700, letterSpacing: '-0.02em' }}>
      t<span style={gold}>AI</span>ger<span style={gold}>+</span>
    </span>
  )
}
