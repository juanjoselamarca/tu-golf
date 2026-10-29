// ─── Filtros canónicos de historical_rounds ───────────────────────────────────
//
// Fuente ÚNICA (regla "un concepto, una fuente") del predicado "excluir las
// tarjetas oficiales FedeGolf de las lecturas genéricas".
//
// Las tarjetas FedeGolf (import_source='fedegolf') son ESPEJOS score-only del
// índice oficial: no traen hoyo-a-hoyo (scores/par null), a menudo duplican una
// ronda Garmin/manual ya importada, y su único hogar de UI es el modal "Tu
// índice oficial, explicado". Por eso NO deben aparecer ni contar en las
// superficies genéricas: historial, stats de perfil, CPI, dashboard, y el coach
// (donde además doble-contarían). El índice oficial vive en profiles.indice; el
// Golfers+ ya las ignora vía excluded_from_handicap=TRUE en el RPC.
//
// Null-safe a propósito: no todas las rondas tienen import_source (muchas son
// NULL). `import_source.is.null` conserva esas; `import_source.neq.fedegolf`
// excluye SOLO las tarjetas. Se pasa a `.or(...)` de PostgREST.
export const OR_EXCLUDE_FEDEGOLF = 'import_source.is.null,import_source.neq.fedegolf'

// Orden canónico "la más reciente primero". `played_at` es DATE (sin hora): dos
// rondas del mismo día empatan y, sin desempate, Postgres devuelve cualquiera.
// El 25-oct la intro del coach decía "jugaste 44" mientras /coach mostraba la
// ronda de 37 cargada después ese mismo día. Desempata la que se cargó última.
// `created_at` es nullable (default now(), sin NOT NULL) y en DESC Postgres pone los
// NULL primero: una fila sin created_at le ganaba el desempate a la cargada después.
// Hoy no hay ninguna en prod (612 rondas, 0 nulas), así que el orden queda total antes
// de que aparezca una.
// (Firma laxa a propósito: un genérico sobre las sobrecargas de `.order()` de
// PostgREST da TS2589. Devuelve el mismo builder, con su tipo intacto.)
type OpcionesOrden = { ascending: boolean; nullsFirst?: boolean }
type Ordenable = { order(column: string, options: OpcionesOrden): Ordenable }
export function masRecientePrimero<Q extends { order: unknown }>(query: Q): Q {
  const q = query as unknown as Ordenable
  return q.order('played_at', { ascending: false })
    .order('created_at', { ascending: false, nullsFirst: false }) as unknown as Q
}

// Las rondas que el coach considera "las del jugador": sin las tarjetas FedeGolf y la
// más reciente primero. Fuente ÚNICA del PAR filtro+orden, que vivía repetido en los
// cuatro caminos del coach y en dos de ellos (la página /coach y la intro) traía solo
// el orden: /coach pedía las últimas 10 rondas SIN excluir las tarjetas, así que un
// espejo score-only (scores NULL) ocupaba lugar entre las 5 que mide el Costo
// Psicológico mientras el resto del coach ya las ignoraba.
type Filtrable = { or(filtros: string): unknown }
export function rondasDelCoach<Q extends { or: unknown; order: unknown }>(query: Q): Q {
  const q = query as unknown as Filtrable
  return masRecientePrimero(q.or(OR_EXCLUDE_FEDEGOLF) as Q)
}
