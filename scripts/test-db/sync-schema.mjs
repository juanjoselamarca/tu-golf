#!/usr/bin/env node
/**
 * Clona el esquema `public` de PRODUCCIÓN en la base de pruebas (`golfersplus-test`). Frente 3.2 del incidente
 * del torneo Los Leones (docs/INCIDENTE_TORNEO_LEONES_2026-10-04.md): el CI dejará de pegarle a prod.
 *
 * Por qué así y no desde `supabase/migrations/`: las migraciones se aplicaron a mano y con nombres mixtos; el
 * esquema real sólo existe en prod viva. Tampoco con pg_dump: no hay Docker/pg_dump en el PC y la contraseña de
 * Postgres de prod no se usa. Se reconstruye el DDL desde los catálogos de prod con consultas de SOLO LECTURA por
 * la Management API (mismo acceso que scripts/respaldo/respaldo-diario.mjs).
 *
 * Qué clona: extensiones (menos pg_cron/pg_net), enums, secuencias, tablas (columnas, defaults, generadas,
 * identity), funciones de `public`, constraints, índices, triggers (incluido on_auth_user_created en
 * auth.users), RLS + policies, privilegios (tabla, columna, secuencia, función), default ACL de postgres en
 * public y los buckets de storage. NO clona: datos (eso es seed.mjs), la publicación supabase_realtime, cron.job.
 *
 * Idempotente: borra TODO lo de `public` en la base de pruebas y lo reconstruye, en UNA transacción (la
 * Management API corre las sentencias de un request en una transacción implícita: si algo falla, la base de
 * pruebas queda como estaba). Después compara una huella del catálogo de ambos lados y falla si difieren.
 *
 * Uso:
 *   node --env-file=.env.local scripts/test-db/sync-schema.mjs                 # reconstruye + verifica
 *   node --env-file=.env.local scripts/test-db/sync-schema.mjs --sql out.sql   # sólo genera el SQL (no escribe)
 *   node --env-file=.env.local scripts/test-db/sync-schema.mjs --verificar     # sólo compara (no escribe)
 * Env: NEXT_PUBLIC_SUPABASE_URL (prod) · TEST_SUPABASE_URL (pruebas) · SUPABASE_ACCESS_TOKEN
 */
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { sqlEn, lit, qi, LIMITE_CUERPO_BYTES } from '../lib/management-sql.mjs'
import { resolverProyectos } from './proyectos.mjs'

/** Extensiones que no se clonan: jobs programados y HTTP saliente desde la base (no aplican a pruebas). */
export const EXTENSIONES_EXCLUIDAS = ['pg_cron', 'pg_net']
const PAUSA_MS = 1_000 // prod es Nano: las lecturas van de a una y con pausa.
const SIN_PATH = "set search_path to '';" // los catálogos devuelven nombres calificados (public.x): DDL sin ambigüedad.
const NOEXT = (oid, clase) => `not exists (select 1 from pg_depend d where d.objid=${oid} and d.classid='${clase}'::regclass and d.deptype='e')`

const argv = process.argv.slice(2)
const iSql = argv.indexOf('--sql')
const soloVerificar = argv.includes('--verificar')

const dormir = ms => new Promise(r => setTimeout(r, ms))

// ─── Lectura del catálogo (se usa contra prod; las mismas consultas sirven contra pruebas) ─────────────────────
const LECTURAS = {
  extensiones: `select e.extname, n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by 1`,
  tiposRaros: `select t.typname, t.typtype from pg_type t where t.typnamespace='public'::regnamespace and t.typtype in ('d','c','r','m')
    and (t.typtype<>'c' or (select relkind from pg_class where oid=t.typrelid)='c') and ${NOEXT('t.oid', 'pg_type')}`,
  relacionesRaras: `select c.relname, c.relkind from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('p','v','m','f')
    and ${NOEXT('c.oid', 'pg_class')}`,
  enums: `select t.typname, to_jsonb(array_agg(e.enumlabel order by e.enumsortorder)) etiquetas from pg_type t join pg_enum e on e.enumtypid=t.oid
    where t.typnamespace='public'::regnamespace and ${NOEXT('t.oid', 'pg_type')} group by 1 order by 1`,
  secuencias: `select c.relname, format_type(s.seqtypid, null) tipo, s.seqstart, s.seqincrement, s.seqmin, s.seqmax, s.seqcache, s.seqcycle,
      d.deptype, dc.relname tabla_duena, a.attname columna_duena
    from pg_sequence s join pg_class c on c.oid=s.seqrelid
    left join pg_depend d on d.objid=c.oid and d.classid='pg_class'::regclass and d.refclassid='pg_class'::regclass and d.deptype in ('a','i')
    left join pg_class dc on dc.oid=d.refobjid left join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid
    where c.relnamespace='public'::regnamespace and ${NOEXT('c.oid', 'pg_class')} order by 1`,
  tablas: `select c.relname, pg_get_userbyid(c.relowner) dueno, c.relrowsecurity rls, c.relforcerowsecurity force_rls, c.relpersistence, c.relreplident, to_jsonb(c.reloptions) reloptions
    from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and ${NOEXT('c.oid', 'pg_class')} order by 1`,
  columnas: `select c.relname, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) tipo, a.attnotnull, a.attidentity, a.attgenerated,
      pg_get_expr(d.adbin, d.adrelid) expr,
      case when a.attcollation<>0 and a.attcollation<>t.typcollation then (select quote_ident(nspname)||'.'||quote_ident(collname)
        from pg_collation co join pg_namespace cn on cn.oid=co.collnamespace where co.oid=a.attcollation) end colacion
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_type t on t.oid=a.atttypid
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where c.relnamespace='public'::regnamespace and c.relkind='r' and a.attnum>0 and not a.attisdropped and ${NOEXT('c.oid', 'pg_class')}
    order by 1, 2`,
  constraints: `select c.relname, k.conname, k.contype, pg_get_constraintdef(k.oid) def from pg_constraint k join pg_class c on c.oid=k.conrelid
    where c.relnamespace='public'::regnamespace and k.contype in ('p','u','c','f','x') and ${NOEXT('c.oid', 'pg_class')}
    order by (k.contype='f'), 1, 2`,
  indices: `select ic.relname indice, pg_get_indexdef(i.indexrelid) def from pg_index i join pg_class c on c.oid=i.indrelid join pg_class ic on ic.oid=i.indexrelid
    where c.relnamespace='public'::regnamespace and ${NOEXT('c.oid', 'pg_class')}
      and not exists (select 1 from pg_constraint k where k.conindid=i.indexrelid and k.conrelid=i.indrelid and k.contype in ('p','u','x'))
    order by 1`,
  funciones: `select p.oid::regprocedure::text firma, pg_get_userbyid(p.proowner) dueno, p.prokind, case when p.prokind in ('f','p') then pg_get_functiondef(p.oid) end def
    from pg_proc p where p.pronamespace='public'::regnamespace and ${NOEXT('p.oid', 'pg_proc')} order by 1`,
  triggers: `select c.oid::regclass::text tabla, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) def
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
    where not t.tgisinternal and (c.relnamespace='public'::regnamespace or (p.pronamespace='public'::regnamespace and ${NOEXT('p.oid', 'pg_proc')}))
    order by 1, 2`,
  policies: `select schemaname, tablename, policyname, permissive, to_jsonb(roles::text[]) roles, cmd, qual, with_check from pg_policies
    where schemaname in ('public','storage') order by 1, 2, 3`,
  aclTablas: `select c.relname, c.relkind, case when a.grantee=0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end grantee,
      a.privilege_type, a.is_grantable
    from pg_class c, aclexplode(coalesce(c.relacl, acldefault((case c.relkind when 'S' then 's' else 'r' end)::"char", c.relowner))) a
    where c.relnamespace='public'::regnamespace and c.relkind in ('r','S') and ${NOEXT('c.oid', 'pg_class')} order by 1, 3, 4`,
  aclColumnas: `select c.relname, at.attname, case when a.grantee=0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end grantee,
      a.privilege_type, a.is_grantable
    from pg_class c join pg_attribute at on at.attrelid=c.oid, aclexplode(at.attacl) a
    where c.relnamespace='public'::regnamespace and c.relkind='r' and at.attnum>0 and not at.attisdropped and at.attacl is not null
      and ${NOEXT('c.oid', 'pg_class')} order by 1, 2, 3, 4`,
  aclFunciones: `select p.oid::regprocedure::text firma, case when a.grantee=0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end grantee,
      a.privilege_type, a.is_grantable
    from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace='public'::regnamespace and ${NOEXT('p.oid', 'pg_proc')} order by 1, 2`,
  aclTipos: `select t.typname from pg_type t where t.typnamespace='public'::regnamespace and t.typacl is not null and ${NOEXT('t.oid', 'pg_type')}`,
  aclDefault: `select pg_get_userbyid(d.defaclrole) rol, d.defaclobjtype, case when a.grantee=0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end grantee,
      a.privilege_type, a.is_grantable
    from pg_default_acl d, aclexplode(d.defaclacl) a
    where d.defaclnamespace='public'::regnamespace order by 1, 2, 3, 4`,
  aclEsquema: `select case when a.grantee=0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end grantee, a.privilege_type, a.is_grantable,
      pg_get_userbyid(n.nspowner) dueno
    from pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n'::"char", n.nspowner))) a where n.nspname='public' order by 1, 2`,
  buckets: `select id, name, public, file_size_limit, to_jsonb(allowed_mime_types) allowed_mime_types from storage.buckets order by 1`,
}

async function leerCatalogo(ref, { pausa = 0, soloLectura = false } = {}) {
  const cat = {}
  for (const [k, q] of Object.entries(LECTURAS)) {
    cat[k] = await sqlEn(ref, `${SIN_PATH} ${q}`, { soloLectura })
    if (pausa) await dormir(pausa)
  }
  return cat
}

// ─── Generación del DDL ────────────────────────────────────────────────────────────────────────────────────────
const T = nombre => `public.${qi(nombre)}`
const OBJETO_DEFAULT = { r: 'tables', S: 'sequences', f: 'functions', T: 'types', n: 'schemas' }

/** GRANTs agrupados por (objeto, grantee, grantable) → una sentencia por grupo. */
function grants(filas, objeto) {
  const grupos = new Map()
  for (const f of filas) {
    const k = `${objeto(f)}|${f.grantee}|${f.is_grantable}`
    if (!grupos.has(k)) grupos.set(k, { obj: objeto(f), grantee: f.grantee, opcion: f.is_grantable, privs: [] })
    grupos.get(k).privs.push(f.privilege_type)
  }
  return [...grupos.values()].map(g => `grant ${g.privs.join(', ')} on ${g.obj} to ${g.grantee}${g.opcion ? ' with grant option' : ''};`)
}

export function generarDDL(cat, extensionesDestino) {
  if (cat.tiposRaros.length) throw new Error(`tipos no soportados por el clonador: ${cat.tiposRaros.map(t => `${t.typname}(${t.typtype})`).join(', ')}`)
  if (cat.relacionesRaras.length) throw new Error(`relaciones no soportadas: ${cat.relacionesRaras.map(r => `${r.relname}(${r.relkind})`).join(', ')}`)
  const agregados = cat.funciones.filter(f => !f.def)
  if (agregados.length) throw new Error(`funciones sin definición clonable (agregados/ventana): ${agregados.map(f => f.firma).join(', ')}`)
  if (cat.aclTipos.length) throw new Error(`tipos con privilegios propios (no soportado): ${cat.aclTipos.map(t => t.typname).join(', ')}`)

  const s = []
  const L = (...xs) => s.push(...xs)

  // 0) Vaciar `public` de la base de pruebas (lo de extensiones lo maneja su DROP EXTENSION).
  L(`-- ===== 0. vaciar public =====`,
    `do $$ declare r record; begin
  for r in select c.oid::regclass o from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and ${NOEXT('c.oid', 'pg_class')}
    loop execute format('drop table if exists %s cascade', r.o); end loop;
  for r in select c.oid::regclass o, c.relkind k from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('v','m','f') and ${NOEXT('c.oid', 'pg_class')}
    loop execute format('drop %s if exists %s cascade', case r.k when 'v' then 'view' when 'm' then 'materialized view' else 'foreign table' end, r.o); end loop;
  for r in select p.oid::regprocedure o, p.prokind k from pg_proc p where p.pronamespace='public'::regnamespace and ${NOEXT('p.oid', 'pg_proc')}
    loop execute format('drop %s if exists %s cascade', case r.k when 'p' then 'procedure' when 'a' then 'aggregate' else 'function' end, r.o); end loop;
  for r in select c.oid::regclass o from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='S' and ${NOEXT('c.oid', 'pg_class')}
    loop execute format('drop sequence if exists %s cascade', r.o); end loop;
  for r in select t.oid::regtype o from pg_type t where t.typnamespace='public'::regnamespace and t.typtype in ('e','d','c','r','m')
      and (t.typtype<>'c' or (select relkind from pg_class where oid=t.typrelid)='c') and ${NOEXT('t.oid', 'pg_type')}
    loop execute format('drop type if exists %s cascade', r.o); end loop;
  for r in select e.extname from pg_extension e where e.extnamespace='public'::regnamespace
    loop execute format('drop extension if exists %I cascade', r.extname); end loop;
end $$;`,
    `set local check_function_bodies = off;`,
    `set local search_path to '';`)

  // 1) Extensiones: las de public se recrean siempre (se borraron arriba); las de otros esquemas, si faltan.
  L(`-- ===== 1. extensiones =====`)
  for (const e of cat.extensiones) {
    if (EXTENSIONES_EXCLUIDAS.includes(e.extname)) continue
    const yaEsta = extensionesDestino.find(x => x.extname === e.extname)
    if (e.nspname === 'public' || !yaEsta) L(`create extension if not exists ${qi(e.extname)} with schema ${qi(e.nspname)};`)
    else if (yaEsta.nspname !== e.nspname) throw new Error(`la extensión ${e.extname} está en ${e.nspname} en prod y en ${yaEsta.nspname} en pruebas`)
  }

  // 2) Enums.
  L(`-- ===== 2. enums =====`)
  for (const e of cat.enums) L(`create type ${T(e.typname)} as enum (${e.etiquetas.map(lit).join(', ')});`)

  // 3) Secuencias sueltas o de columnas serial (las de identity nacen con su tabla).
  L(`-- ===== 3. secuencias =====`)
  for (const q of cat.secuencias.filter(q => q.deptype !== 'i')) {
    L(`create sequence ${T(q.relname)} as ${q.tipo} increment by ${q.seqincrement} minvalue ${q.seqmin} maxvalue ${q.seqmax} start with ${q.seqstart} cache ${q.seqcache}${q.seqcycle ? ' cycle' : ''};`)
  }

  // 4) Tablas con sus columnas (defaults/generadas sólo usan funciones de sistema o de extensiones: verificado).
  L(`-- ===== 4. tablas =====`)
  const columnasDe = new Map()
  for (const c of cat.columnas) {
    if (!columnasDe.has(c.relname)) columnasDe.set(c.relname, [])
    columnasDe.get(c.relname).push(c)
  }
  for (const t of cat.tablas) {
    const cols = (columnasDe.get(t.relname) ?? []).map(c => {
      let d = `  ${qi(c.attname)} ${c.tipo}`
      if (c.colacion) d += ` collate ${c.colacion}`
      if (c.attgenerated === 's') d += ` generated always as (${c.expr}) stored`
      else if (c.attidentity) d += ` generated ${c.attidentity === 'a' ? 'always' : 'by default'} as identity`
      else if (c.expr != null) d += ` default ${c.expr}`
      if (c.attnotnull) d += ' not null'
      return d
    })
    L(`create ${t.relpersistence === 'u' ? 'unlogged ' : ''}table ${T(t.relname)} (\n${cols.join(',\n')}\n)${t.reloptions ? ` with (${t.reloptions.join(', ')})` : ''};`)
  }

  // 5) Funciones (check_function_bodies=off: los cuerpos SQL que nombran tablas se validan al usarse).
  L(`-- ===== 5. funciones =====`)
  for (const f of cat.funciones) L(`${f.def.trim()};`)

  // 6) Constraints: primero PK/unique/check/exclusion, después FKs (el orden ya viene así de la consulta).
  L(`-- ===== 6. constraints =====`)
  for (const k of cat.constraints) L(`alter table ${T(k.relname)} add constraint ${qi(k.conname)} ${k.def};`)

  // 7) Secuencias de columnas serial: OWNED BY (para que se borren con su tabla, igual que en prod).
  for (const q of cat.secuencias.filter(q => q.deptype === 'a')) {
    L(`alter sequence ${T(q.relname)} owned by ${T(q.tabla_duena)}.${qi(q.columna_duena)};`)
  }

  // 8) Índices que no respaldan una constraint.
  L(`-- ===== 7. índices =====`)
  for (const i of cat.indices) L(`${i.def};`)

  // 9) Triggers (incluye on_auth_user_created en auth.users) y su estado.
  L(`-- ===== 8. triggers =====`)
  for (const t of cat.triggers) {
    if (t.tabla.startsWith('auth.') || !t.tabla.includes('.')) {
      // Fuera de public el trigger no se borró con el vaciado (sólo su función, en cascada): recrearlo limpio.
      L(`drop trigger if exists ${qi(t.tgname)} on ${t.tabla};`)
    }
    L(`${t.def};`)
    if (t.tgenabled === 'D') L(`alter table ${t.tabla} disable trigger ${qi(t.tgname)};`)
    else if (t.tgenabled === 'R') L(`alter table ${t.tabla} enable replica trigger ${qi(t.tgname)};`)
    else if (t.tgenabled === 'A') L(`alter table ${t.tabla} enable always trigger ${qi(t.tgname)};`)
  }

  // 10) RLS y policies.
  L(`-- ===== 9. RLS =====`)
  for (const t of cat.tablas) {
    if (t.rls) L(`alter table ${T(t.relname)} enable row level security;`)
    if (t.force_rls) L(`alter table ${T(t.relname)} force row level security;`)
    if (t.relreplident === 'f') L(`alter table ${T(t.relname)} replica identity full;`)
    else if (t.relreplident === 'n') L(`alter table ${T(t.relname)} replica identity nothing;`)
    else if (t.relreplident === 'i') throw new Error(`${t.relname}: replica identity using index no soportado`)
  }
  // Policies de storage: las del destino se borran y se recrean las de prod (en public ya se borraron con las tablas).
  L(`do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname='storage'
    loop execute format('drop policy if exists %I on storage.%I', r.policyname, r.tablename); end loop;
end $$;`)
  for (const p of cat.policies) {
    const roles = p.roles.map(r => (r === 'public' ? 'public' : qi(r))).join(', ')
    L(`create policy ${qi(p.policyname)} on ${qi(p.schemaname)}.${qi(p.tablename)} as ${p.permissive.toLowerCase()} for ${p.cmd.toLowerCase()} to ${roles}` +
      `${p.qual != null ? ` using (${p.qual})` : ''}${p.with_check != null ? ` with check (${p.with_check})` : ''};`)
  }

  // 11) Privilegios: se limpia lo que pusieron los default ACL del destino y se aplica exactamente lo de prod.
  L(`-- ===== 10. privilegios =====`)
  const ROLES_LIMPIAR = 'public, anon, authenticated, service_role, postgres'
  for (const t of cat.tablas) L(`revoke all on table ${T(t.relname)} from ${ROLES_LIMPIAR};`)
  for (const q of cat.secuencias) L(`revoke all on sequence ${T(q.relname)} from ${ROLES_LIMPIAR};`)
  for (const f of cat.funciones) L(`revoke all on ${f.prokind === 'p' ? 'procedure' : 'function'} ${f.firma} from ${ROLES_LIMPIAR};`)
  L(...grants(cat.aclTablas, f => `${f.relkind === 'S' ? 'sequence' : 'table'} ${T(f.relname)}`))
  {
    // Columnas: GRANT priv (col) ON tabla.
    const grupos = new Map()
    for (const f of cat.aclColumnas) {
      const k = `${f.relname}|${f.grantee}|${f.privilege_type}|${f.is_grantable}`
      if (!grupos.has(k)) grupos.set(k, { ...f, cols: [] })
      grupos.get(k).cols.push(qi(f.attname))
    }
    for (const g of grupos.values()) L(`grant ${g.privilege_type} (${g.cols.join(', ')}) on table ${T(g.relname)} to ${g.grantee}${g.is_grantable ? ' with grant option' : ''};`)
  }
  const tipoFn = new Map(cat.funciones.map(f => [f.firma, f.prokind === 'p' ? 'procedure' : 'function']))
  L(...grants(cat.aclFunciones, f => `${tipoFn.get(f.firma)} ${f.firma}`))

  // 12) Default ACL de postgres en public (lo que reciben las tablas FUTURAS: lo mide privilegios-tablas.test.ts).
  L(`-- ===== 11. default ACL =====`)
  for (const [tipo, nombre] of Object.entries(OBJETO_DEFAULT)) {
    if (tipo === 'n') continue // schemas: no aplica dentro de un esquema
    L(`alter default privileges for role postgres in schema public revoke all on ${nombre} from public, anon, authenticated, service_role, postgres;`)
  }
  {
    const grupos = new Map()
    for (const f of cat.aclDefault.filter(f => f.rol === 'postgres')) {
      const k = `${f.defaclobjtype}|${f.grantee}|${f.is_grantable}`
      if (!grupos.has(k)) grupos.set(k, { ...f, privs: [] })
      grupos.get(k).privs.push(f.privilege_type)
    }
    for (const g of grupos.values()) {
      L(`alter default privileges for role postgres in schema public grant ${g.privs.join(', ')} on ${OBJETO_DEFAULT[g.defaclobjtype]} to ${g.grantee}${g.is_grantable ? ' with grant option' : ''};`)
    }
  }

  // 13) Buckets de storage (sólo la configuración; los archivos no se copian).
  L(`-- ===== 12. storage =====`)
  for (const b of cat.buckets) {
    const mimes = b.allowed_mime_types ? `array[${b.allowed_mime_types.map(lit).join(', ')}]::text[]` : 'null'
    L(`insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (${lit(b.id)}, ${lit(b.name)}, ${b.public}, ${b.file_size_limit ?? 'null'}, ${mimes})
  on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;`)
  }

  // 14) Privilegios sobre el esquema public (el dueño, pg_database_owner, conserva los suyos).
  L(`-- ===== 13. esquema public =====`)
  L(`revoke all on schema public from public, anon, authenticated, service_role, postgres;`)
  L(...grants(cat.aclEsquema.filter(f => f.grantee !== qi(f.dueno) && f.grantee !== f.dueno), () => 'schema public'))

  L(`notify pgrst, 'reload schema';`)
  return s.join('\n')
}

// ─── Huella: lo que se compara entre prod y pruebas ────────────────────────────────────────────────────────────
/** Mapa clave → valor que describe el esquema. Los grantor se ignoran (en pruebas todo lo concede postgres). */
export function huella(cat) {
  const h = new Map()
  const put = (k, v) => h.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  for (const e of cat.extensiones) if (!EXTENSIONES_EXCLUIDAS.includes(e.extname)) put(`extension ${e.extname}`, e.nspname)
  for (const e of cat.enums) put(`enum ${e.typname}`, e.etiquetas)
  for (const q of cat.secuencias) put(`secuencia ${q.relname}`, [q.tipo, q.seqincrement, q.seqmin, q.seqmax, q.seqcache, q.seqcycle, q.deptype, q.tabla_duena, q.columna_duena])
  for (const t of cat.tablas) put(`tabla ${t.relname}`, [t.dueno, t.rls, t.force_rls, t.relpersistence, t.relreplident, t.reloptions])
  // Posición ORDINAL (no attnum): prod tiene columnas borradas que dejan huecos en attnum; el orden es lo que importa.
  const ordinal = new Map()
  for (const c of cat.columnas) {
    const n = (ordinal.get(c.relname) ?? 0) + 1
    ordinal.set(c.relname, n)
    put(`columna ${c.relname}.${c.attname}`, [n, c.tipo, c.attnotnull, c.attidentity, c.attgenerated, c.expr, c.colacion])
  }
  for (const k of cat.constraints) put(`constraint ${k.relname}.${k.conname}`, k.def)
  for (const i of cat.indices) put(`indice ${i.indice}`, i.def)
  for (const f of cat.funciones) put(`funcion ${f.firma}`, [f.dueno, f.def])
  for (const t of cat.triggers) put(`trigger ${t.tabla}.${t.tgname}`, [t.def, t.tgenabled])
  for (const p of cat.policies) put(`policy ${p.schemaname}.${p.tablename}.${p.policyname}`, [p.permissive, [...p.roles].sort(), p.cmd, p.qual, p.with_check])
  const acl = (k, f) => put(`${k} ${f.grantee} ${f.privilege_type}`, String(f.is_grantable))
  for (const f of cat.aclTablas) acl(`privilegio ${f.relname}`, f)
  for (const f of cat.aclColumnas) acl(`privilegio ${f.relname}.${f.attname}`, f)
  for (const f of cat.aclFunciones) acl(`privilegio ${f.firma}`, f)
  for (const f of cat.aclDefault) acl(`default-acl ${f.rol} ${f.defaclobjtype}`, f)
  for (const f of cat.aclEsquema) acl('esquema public', f)
  for (const b of cat.buckets) put(`bucket ${b.id}`, [b.name, b.public, b.file_size_limit, b.allowed_mime_types])
  return h
}

export function diferencias(hProd, hPruebas) {
  const out = []
  for (const [k, v] of hProd) {
    if (!hPruebas.has(k)) out.push(`falta en pruebas: ${k}`)
    else if (hPruebas.get(k) !== v) out.push(`distinto: ${k}\n    prod:    ${v.slice(0, 300)}\n    pruebas: ${hPruebas.get(k).slice(0, 300)}`)
  }
  for (const k of hPruebas.keys()) if (!hProd.has(k)) out.push(`sobra en pruebas: ${k}`)
  return out
}

export function contarPorTipo(h) {
  const n = {}
  for (const k of h.keys()) { const t = k.split(' ')[0]; n[t] = (n[t] ?? 0) + 1 }
  return n
}

// ─── Main ──────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const { prod, pruebas } = await resolverProyectos()
  console.log(`origen (prod, sólo lectura): ${prod} · destino (pruebas): ${pruebas}`)

  const catProd = await leerCatalogo(prod, { pausa: PAUSA_MS, soloLectura: true })
  const hProd = huella(catProd)
  console.log(`catálogo de prod leído: ${JSON.stringify(contarPorTipo(hProd))}`)

  if (!soloVerificar) {
    const extDestino = await sqlEn(pruebas, LECTURAS.extensiones)
    const ddl = generarDDL(catProd, extDestino)
    if (iSql >= 0) {
      writeFileSync(argv[iSql + 1], ddl)
      console.log(`SQL generado (${(ddl.length / 1024).toFixed(0)} KB) → ${argv[iSql + 1]}. No se escribió nada.`)
      return
    }
    const bytes = Buffer.byteLength(JSON.stringify({ query: ddl }))
    console.log(`DDL: ${(bytes / 1024).toFixed(0)} KB de cuerpo (límite de la API: ${(LIMITE_CUERPO_BYTES / 1024).toFixed(0)} KB)`)
    if (bytes > LIMITE_CUERPO_BYTES) throw new Error(`el DDL (${(bytes / 1024).toFixed(0)} KB) supera el límite de la Management API: hay que partirlo sin perder la transacción única`)
    const t0 = Date.now()
    // intentos: 1 — un reintento podría correr en paralelo con la transacción anterior aún viva y bloquearse con ella.
    await sqlEn(pruebas, ddl, { timeoutMs: 300_000, intentos: 1 })
    console.log(`esquema aplicado en pruebas en ${((Date.now() - t0) / 1000).toFixed(1)} s (${(ddl.length / 1024).toFixed(0)} KB de DDL, una transacción)`)
  }

  const hPruebas = huella(await leerCatalogo(pruebas))
  const dif = diferencias(hProd, hPruebas)
  if (dif.length) {
    console.error(`✘ el esquema de pruebas difiere de prod en ${dif.length} punto(s):\n- ${dif.slice(0, 60).join('\n- ')}`)
    process.exitCode = 1
    return
  }
  console.log(`✔ esquema de pruebas idéntico a prod (${hProd.size} objetos comparados)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(`✘ sync-schema: ${e.message}`); process.exitCode = 1 })
}
