import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import {
  adminClient,
  DEFAULT_COURSE_ID,
  DEFAULT_COURSE_NAME,
  getTestUserId,
  createEphemeralUser,
  deleteEphemeralUser,
  sinError,
  sufijo,
} from './helpers/ronda-fixture'

/**
 * Hoja de salida del organizador (`/organizador/[slug]/salida`) — protege #767 (hunter 10-nov).
 *
 * Es lo que el organizador manda por WhatsApp o imprime y pega en el tee del 1. Antes leía solo
 * `profiles(name, indice)`: el invitado sin cuenta salía como "Jugador" con hándicap "—" (en prod, los 40
 * invitados de `demo-copa-chile-2026`), y un hándicap corregido para el torneo no aparecía. Ahora:
 *  - nombre = el del board (`resolveLegacyPlayerName`): perfil → nombre de inscripción;
 *  - hándicap = el inscrito en el torneo (`handicap_at_registration`); sin él, el índice del perfil;
 *  - pantalla y texto copiado dicen LO MISMO (grupo, hora de salida, nombre, hándicap con un decimal);
 *  - sin grupos armados: "Todos los jugadores" con los APROBADOS solamente (el pendiente no va al tee);
 *  - slug inexistente: "no encontrado", no una hoja vacía que el organizador comparta igual.
 *
 * Los tres hándicaps son distintos entre sí y de los índices de perfil, para que cada fuente se distinga: si la
 * hoja volviera a leer el índice del perfil, Sofía mostraría 9.4 y no 12.0.
 *
 * El organizador es el usuario E2E (sesión del global-setup); los jugadores con cuenta son efímeros.
 * SOLO base de pruebas: `node --env-file=.env.local scripts/test-db/e2e-local.mjs -- organizador-hoja-salida.spec.ts`.
 * El torneo queda en `draft` (no aparece en /en-vivo) y se borra en afterAll con todo lo que cuelga de él.
 */

const slug = `e2e-salida-${sufijo()}`
const nombreTorneo = `E2E Hoja Salida ${slug.slice(-8)}`
const marca = slug.slice(-5)

/** Invitado sin cuenta: solo existe su nombre de inscripción y su hándicap inscrito. */
const INVITADO = { nombre: `Invitado Pérez ${marca}`, hcp: 14.2 }
/** Con cuenta y hándicap corregido para el torneo: manda el inscrito (12.0), NO el índice del perfil (9.4). */
const SOFIA = { nombre: `Sofía Rojas ${marca}`, indice: 9.4, hcp: 12 }
/** Con cuenta y sin hándicap inscrito: cae al índice del perfil. */
const TOMAS = { nombre: `Tomás Vial ${marca}`, indice: 20.3 }
/** Pendiente de aprobación: no está en ningún grupo y NO debe salir en la hoja sin grupos. */
const PENDIENTE = { nombre: `Pendiente Soto ${marca}`, hcp: 7.7 }

/** Horas de salida en Santiago (UTC-3 en noviembre); la página las formatea en la zona del navegador. */
const SALIDA_G1 = '2026-11-14T11:10:00.000Z' // 08:10
const SALIDA_G2 = '2026-11-14T11:20:00.000Z' // 08:20
function horaCL(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })
}

let tournamentId = ''
const usuarios: string[] = []

test.use({ timezoneId: 'America/Santiago' })
test.describe.configure({ mode: 'serial' })

/** Tarjeta de un grupo (`data-print-group`), identificada por su nombre. */
function grupo(page: Page, nombre: string) {
  return page.locator('[data-print-group]').filter({ has: page.getByText(nombre, { exact: true }) })
}

/** Filas de jugadores de un grupo como "Nombre|hcp", en el orden en que se ven. */
async function filas(page: Page, nombreGrupo: string): Promise<string[]> {
  return grupo(page, nombreGrupo).locator(':scope > div').filter({ hasNot: page.getByText(nombreGrupo, { exact: true }) })
    .evaluateAll(divs => divs.map(d => Array.from(d.querySelectorAll('span')).map(s => s.textContent?.trim() ?? '').join('|')))
}

/** Abre la hoja capturando lo que el botón "Copiar texto" manda al portapapeles. */
async function abrirHoja(page: Page, s = slug) {
  await page.addInitScript(() => {
    const w = window as unknown as { __copiado: string[] }
    w.__copiado = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (t: string) => { w.__copiado.push(t) } },
    })
  })
  const res = await page.goto(`/organizador/${s}/salida`)
  expect(res?.status(), 'la hoja de salida responde').toBeLessThan(400)
}

async function textoCopiado(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Copiar texto' }).click()
  await expect(page.getByRole('button', { name: '✓ Copiado' })).toBeVisible()
  const copiados = await page.evaluate(() => (window as unknown as { __copiado: string[] }).__copiado)
  expect(copiados, 'un solo texto copiado').toHaveLength(1)
  return copiados[0]
}

test.describe('Organizador: hoja de salida con invitados y hándicap del torneo (#767)', () => {
  test.beforeAll(async () => {
    const admin = adminClient()
    const organizadorId = await getTestUserId()

    const sofiaId = await createEphemeralUser('e2e-salida-sofia')
    usuarios.push(sofiaId)
    const tomasId = await createEphemeralUser('e2e-salida-tomas')
    usuarios.push(tomasId)
    await sinError('perfil sofia', admin.from('profiles').update({ name: SOFIA.nombre, indice: SOFIA.indice }).eq('id', sofiaId).select('id'))
    await sinError('perfil tomas', admin.from('profiles').update({ name: TOMAS.nombre, indice: TOMAS.indice }).eq('id', tomasId).select('id'))

    const t = await sinError('insert tournaments', admin.from('tournaments').insert({
      name: nombreTorneo,
      slug,
      organizer_id: organizadorId,
      course_id: DEFAULT_COURSE_ID,
      course_name: DEFAULT_COURSE_NAME,
      date_start: '2026-11-14',
      format: 'stroke_play',
      hole_count: 18,
      tees: 'blanco',
      status: 'draft',
    }).select('id').single())
    tournamentId = (t as { id: string }).id

    // El invitado (como lo deja guest-join): sin user_id, con el guestId en pending_user_id y el nombre solo en player_name.
    const ps = await sinError('insert players', admin.from('players').insert([
      { tournament_id: tournamentId, user_id: null, pending_user_id: randomUUID(), player_name: INVITADO.nombre, handicap_at_registration: INVITADO.hcp, status: 'approved' },
      { tournament_id: tournamentId, user_id: sofiaId, handicap_at_registration: SOFIA.hcp, status: 'approved' },
      { tournament_id: tournamentId, user_id: tomasId, handicap_at_registration: null, status: 'approved' },
      { tournament_id: tournamentId, user_id: null, pending_user_id: randomUUID(), player_name: PENDIENTE.nombre, handicap_at_registration: PENDIENTE.hcp, status: 'pending' },
    ]).select('id, player_name, user_id')) as Array<{ id: string; player_name: string | null; user_id: string | null }>
    const idDe = (pred: (p: { player_name: string | null; user_id: string | null }) => boolean) => ps.find(pred)!.id

    const gs = await sinError('insert tournament_groups', admin.from('tournament_groups').insert([
      { tournament_id: tournamentId, name: 'Grupo 1', tee_time: SALIDA_G1, sort_order: 0 },
      { tournament_id: tournamentId, name: 'Grupo 2', tee_time: SALIDA_G2, sort_order: 1 },
    ]).select('id, name')) as Array<{ id: string; name: string }>
    const g1 = gs.find(g => g.name === 'Grupo 1')!.id
    const g2 = gs.find(g => g.name === 'Grupo 2')!.id
    await sinError('insert tournament_group_players', admin.from('tournament_group_players').insert([
      { group_id: g1, player_id: idDe(p => p.player_name === INVITADO.nombre) },
      { group_id: g1, player_id: idDe(p => p.user_id === sofiaId) },
      { group_id: g2, player_id: idDe(p => p.user_id === tomasId) },
    ]).select('group_id'))
  })

  test.afterAll(async () => {
    const errs: string[] = []
    // tournaments arrastra players, tournament_groups y tournament_group_players (ON DELETE CASCADE).
    // Con el torneo vivo, borrar a un jugador fallaría por FK: solo eso frena el borrado de los usuarios.
    let torneoBorrado = true
    if (tournamentId) {
      const { error } = await adminClient().from('tournaments').delete().eq('id', tournamentId)
      if (error) { errs.push(`tournaments: ${error.message}`); torneoBorrado = false }
    }
    for (const id of usuarios) {
      if (torneoBorrado) errs.push(...(await deleteEphemeralUser(id)))
      else errs.push(`usuario efímero sin borrar: ${id}`)
    }
    if (errs.length) console.warn(`[organizador-hoja-salida] cleanup parcial:\n  ${errs.join('\n  ')}`)
  })

  test('con grupos: el invitado sale con su nombre y su hándicap; el inscrito manda sobre el índice', async ({ page }) => {
    await abrirHoja(page)
    await expect(page.getByRole('heading', { level: 1, name: nombreTorneo }).first()).toBeVisible()
    await expect(page.locator('[data-no-print]').getByText(/18H · Tees Blanco/)).toBeVisible()

    // Orden de los grupos = sort_order, cada uno con su hora de salida.
    const tarjetas = page.locator('[data-print-group]')
    await expect(tarjetas).toHaveCount(2)
    await expect(tarjetas.nth(0)).toContainText('Grupo 1')
    await expect(tarjetas.nth(1)).toContainText('Grupo 2')
    await expect(grupo(page, 'Grupo 1')).toContainText(horaCL(SALIDA_G1))
    await expect(grupo(page, 'Grupo 2')).toContainText(horaCL(SALIDA_G2))
    expect(horaCL(SALIDA_G1), 'la hora del fixture es la de Santiago (no UTC)').toMatch(/^08:10/)

    // Dentro de un grupo la hoja no ordena a los jugadores (el embed no tiene ORDER BY): se compara como conjunto.
    // El orden de los GRUPOS sí está garantizado (sort_order) y se afirma exacto arriba.
    expect((await filas(page, 'Grupo 1')).sort()).toEqual([
      `${INVITADO.nombre}|14.2`,
      `${SOFIA.nombre}|12.0`,
    ].sort())
    expect(await filas(page, 'Grupo 2')).toEqual([`${TOMAS.nombre}|20.3`])

    // Lo que #767 arregló: ni "Jugador" genérico, ni "—", ni el índice del perfil de Sofía.
    const hoja = page.locator('[data-print-group]')
    await expect(hoja.getByText('Jugador', { exact: true })).toHaveCount(0)
    await expect(hoja.getByText('—', { exact: true })).toHaveCount(0)
    await expect(hoja.getByText('9.4', { exact: true })).toHaveCount(0)
    // El pendiente no está en ningún grupo.
    await expect(page.getByText(PENDIENTE.nombre)).toHaveCount(0)
  })

  test('el texto que se copia para WhatsApp dice lo mismo que la pantalla', async ({ page }) => {
    await abrirHoja(page)
    await expect(page.locator('[data-print-group]')).toHaveCount(2)
    const texto = await textoCopiado(page)
    const lineas = texto.split('\n')

    expect(lineas[0]).toBe(nombreTorneo.toUpperCase())
    expect(lineas[1]).toMatch(/ · 18H · Tees Blanco$/)
    expect(lineas[2]).toMatch(/2026/)
    const desdeGrupos = lineas.slice(lineas.indexOf(`${horaCL(SALIDA_G1)}  Grupo 1`))
    expect(desdeGrupos[0]).toBe(`${horaCL(SALIDA_G1)}  Grupo 1`)
    // Jugadores del grupo 1 como conjunto (sin orden garantizado dentro del grupo, igual que en pantalla).
    expect(desdeGrupos.slice(1, 3).sort()).toEqual([
      `  ${INVITADO.nombre} (14.2)`,
      `  ${SOFIA.nombre} (12.0)`,
    ].sort())
    expect(desdeGrupos.slice(3, 7)).toEqual([
      '',
      `${horaCL(SALIDA_G2)}  Grupo 2`,
      `  ${TOMAS.nombre} (20.3)`,
      '',
    ])
    expect(lineas[lineas.length - 1]).toMatch(/^Golfers\+ · /)
    expect(texto).not.toContain('Jugador')
    expect(texto).not.toContain(PENDIENTE.nombre)
  })

  test('sin grupos armados: "Todos los jugadores" con los aprobados, sin el pendiente', async ({ page }) => {
    await sinError('borrar grupos', adminClient().from('tournament_groups').delete().eq('tournament_id', tournamentId).select('id'))

    await abrirHoja(page)
    const tarjetas = page.locator('[data-print-group]')
    await expect(tarjetas).toHaveCount(1)
    await expect(tarjetas.first()).toContainText('Todos los jugadores')
    // El orden sin grupos no está garantizado (no hay ORDER BY): se compara como conjunto.
    expect((await filas(page, 'Todos los jugadores')).sort()).toEqual([
      `${INVITADO.nombre}|14.2`,
      `${SOFIA.nombre}|12.0`,
      `${TOMAS.nombre}|20.3`,
    ].sort())
    await expect(page.getByText(PENDIENTE.nombre)).toHaveCount(0)
    await expect(page.getByText('No hay grupos armados aún')).toHaveCount(0)

    const texto = await textoCopiado(page)
    expect(texto).toContain('\nTodos los jugadores\n')
    expect(texto).toContain(`  ${INVITADO.nombre} (14.2)`)
    expect(texto).not.toContain(PENDIENTE.nombre)
  })

  test('slug inexistente: "no encontrado", no una hoja vacía para compartir', async ({ page }) => {
    await abrirHoja(page, `${slug}-no-existe`)
    await expect(page.getByRole('heading', { level: 1, name: 'Torneo no encontrado' })).toBeVisible()
    // Y no es el estado de error ("No pudimos cargar…"), que tampoco tiene botones ni grupos.
    await expect(page.getByText('No pudimos cargar la hoja de salida')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Copiar texto' })).toHaveCount(0)
    await expect(page.locator('[data-print-group]')).toHaveCount(0)
  })
})
