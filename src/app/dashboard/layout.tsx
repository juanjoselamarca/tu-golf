import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Inicio — Golfers+',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="dark">{children}</div>
}
