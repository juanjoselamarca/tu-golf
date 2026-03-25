import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const jobId = request.nextUrl.searchParams.get('jobId')
    if (!jobId) {
      return NextResponse.json({ error: 'jobId requerido' }, { status: 400 })
    }

    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job no encontrado o no te pertenece' }, { status: 404 })
    }

    return NextResponse.json({
      status: job.status,
      total_detected: job.total_detected,
      total_valid: job.total_valid,
      rounds: job.mapped_data ?? [],
      errors: job.errors ?? [],
    })
  } catch (err) {
    console.error('Import status error:', err)
    return NextResponse.json(
      { error: 'Error interno al consultar estado de importación' },
      { status: 500 }
    )
  }
}
