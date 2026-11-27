const ACCENT = { color: 'var(--brand-on-bg)' }

/**
 * The app's only wordmark (DESIGN.md §4): DM Sans 700, gold "+". In tAIger+ "AI" is gold too, because in DM Sans a
 * lone capital I reads as an l ("tAlger+"). Colors resolve where it renders, so a parent with its own data-theme wins.
 */
export function Wordmark({ brand = 'golfers', size }: { brand?: 'golfers' | 'taiger'; size: number }) {
  return (
    <span style={{ fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontWeight: 700, fontSize: size, letterSpacing: '-0.02em', color: 'var(--text)' }}>
      {brand === 'taiger' ? <>t<span style={ACCENT}>AI</span>ger<span style={ACCENT}>+</span></> : <>Golfers<span style={ACCENT}>+</span></>}
    </span>
  )
}
