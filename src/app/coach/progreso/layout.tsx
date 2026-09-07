import { checkCoachAccess } from '../lib/checkCoachAccess'

export default async function ProgresoLayout({ children }: { children: React.ReactNode }) {
  await checkCoachAccess()
  return <>{children}</>
}
