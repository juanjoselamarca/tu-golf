import { checkCoachAccess } from '../../lib/checkCoachAccess'

export default async function SesionLayout({ children }: { children: React.ReactNode }) {
  await checkCoachAccess()
  return <>{children}</>
}
