import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'

export const dynamic = 'force-dynamic'

const BUCKET = 'tournament-covers'
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_SIZE = 5 * 1024 * 1024 // 5MB (también está limitado en el bucket)

/**
 * Sniff de magic bytes para validar que el archivo realmente es del tipo
 * que su MIME header declara. Defense-in-depth: el header lo puede mentir
 * un cliente scripted, pero los primeros bytes no.
 */
async function sniffImageMagic(file: File): Promise<'jpeg' | 'png' | 'webp' | null> {
  const buf = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50  ("RIFF....WEBP")
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp'
  return null
}

/**
 * POST /api/torneos/draft/[id]/cover
 *
 * Sube la foto de portada del draft a Storage y devuelve la URL pública.
 * NO actualiza el config del draft — eso lo hace el cliente vía PATCH normal
 * (mantiene optimistic update + versionado del draft funcionando).
 *
 * El archivo viene ya redimensionado del cliente (resize-image.ts, ~150KB típico).
 * Acá solo validamos MIME + tamaño y subimos.
 *
 * Path en bucket: drafts/<draftId>/<timestamp>.<ext> — sobrescribible para que
 * cambiar foto reemplace en vez de acumular.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Validar que el usuario es owner o collaborator del draft.
  const { data: draft, error: dErr } = await supabase
    .from('tournament_drafts')
    .select('id, owner_id, status, tournament_draft_collaborators(user_id)')
    .eq('id', params.id)
    .single()
  if (dErr || !draft) {
    return NextResponse.json({ error: 'Draft no encontrado' }, { status: 404 })
  }
  if (draft.status !== 'draft') {
    return NextResponse.json({ error: 'Draft no editable' }, { status: 409 })
  }
  const collabIds = ((draft.tournament_draft_collaborators as Array<{ user_id: string }> | null) ?? []).map(c => c.user_id)
  const allowed = draft.owner_id === user.id || collabIds.includes(user.id)
  if (!allowed) {
    return NextResponse.json({ error: 'Sin permisos sobre este draft' }, { status: 403 })
  }

  // Parsear FormData
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Falta archivo (campo "file")' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({
      error: 'Tipo no permitido. Subí JPG, PNG o WebP.',
    }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({
      error: `Archivo muy grande (max ${Math.round(MAX_SIZE / 1024 / 1024)}MB).`,
    }, { status: 400 })
  }
  // Defense-in-depth: chequear magic bytes para descartar archivos que mienten
  // su Content-Type (ej: ejecutables con header forjado a image/jpeg).
  const sniffed = await sniffImageMagic(file)
  if (!sniffed) {
    return NextResponse.json({
      error: 'El archivo no es una imagen JPG/PNG/WebP válida.',
    }, { status: 400 })
  }

  const ext = sniffed === 'jpeg' ? 'jpg' : sniffed
  const path = `drafts/${params.id}/${Date.now()}.${ext}`

  // Storage requiere bypass de RLS para escribir bajo cualquier prefijo;
  // la auth/owner-check ya ocurrió arriba con el cliente del usuario.
  const admin = createAdminClient()
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    })
  if (upErr) {
    await captureError(upErr, {
      context: 'cover-upload.storage',
      meta: { draftId: params.id, mime: file.type, size: file.size },
    })
    return NextResponse.json({ error: 'No se pudo subir la imagen' }, { status: 500 })
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)

  return NextResponse.json({ ok: true, url: pub.publicUrl })
}
