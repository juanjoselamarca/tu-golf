import { Fragment } from 'react'

// Breaks only between " · " parts. The dot is painted on a space, so it vanishes at a line break.
export default function Eyebrow({ text }: { text: string }) {
  return (
    <span className="eyebrow">
      <span className="d" />
      <span>
        {text.split(' · ').map((part, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="eb-sep">{' '}</span>}
            <span className="eb-part">{part}</span>
          </Fragment>
        ))}
      </span>
    </span>
  )
}
