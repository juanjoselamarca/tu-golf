export default function ImportarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#070d18',
        color: '#edeae4',
      }}
    >
      {children}
    </div>
  )
}
