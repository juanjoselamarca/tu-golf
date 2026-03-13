import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import NuevoTorneoForm from './NuevoTorneoForm'

export interface CourseOption {
  id: string
  nombre: string
  ciudad: string
}

export default async function NuevoTorneoPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: courses } = await supabase
    .from('courses')
    .select('id, nombre, ciudad')
    .order('nombre')

  return <NuevoTorneoForm userId={user.id} courses={(courses as CourseOption[]) || []} />
}
