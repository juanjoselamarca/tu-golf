-- Pruebas SQL del Skins congelado desde el primer golpe (migración 20261125140000) con roles reales (SET ROLE +
-- claims). Ver skins-ronda-libre.sql. Cada caso guarda lo que pasó (filas tocadas o «SQLSTATE mensaje») y al final se
-- compara contra lo esperado: OK por caso o una sola FALLA con todos los que no calzan.
-- Fuera del CI se puede correr contra la base de pruebas (nunca prod) con las migraciones que le falten delante, en la
-- misma transacción: termina en ROLLBACK y no deja nada.
BEGIN;

DO $prueba$
DECLARE
  r jsonb := '{}'::jsonb;
  k text; v jsonb; obtenido jsonb; calza boolean; fallas text := '';
  -- Esperado: filas tocadas (permitido) o el SQLSTATE con que la base lo rechaza (P0003 = el congelado; 42501 = sin
  -- permiso, o la policy previa que exige poder crear timba para tocar una ronda skins/personalizado).
  esperado jsonb := '{
    "01_antes_corrige_indice": 1, "02_antes_corrige_tee": 1, "03_antes_suma_jugador": 1,
    "04_antes_creador_toca_congelado": "P0003", "05_creador_inserta_congelado": "P0003",
    "06_x_directa_update": "42501", "07_x_directa_insert": "42501", "08_otra_columna_sigue": 1,
    "09_primer_golpe": 1,
    "10_despues_indice": "P0003", "11_despues_tee": "P0003", "12_despues_suma_jugador": "P0003",
    "13_despues_hcp_pct": "P0003", "14_despues_reglas": "P0003", "15_despues_sale_del_skins": "P0003",
    "16_despues_otra_columna_ronda": 1, "17_despues_sigue_anotando": 1,
    "18_timba_indice_y_tee": 1, "19_timba_reglas": 1, "20_timba_suma": 1, "21_stroke_indice": 1, "22_stroke_suma": 1,
    "23_servidor_despues_indice": "P0003", "24_servidor_despues_congelado": "P0003", "25_servidor_congela_sin_golpes": 1,
    "26_servidor_skins_otra_columna": 1, "27_servidor_timba_reglas_con_golpes": 1,
    "28_servidor_saca_jugador": "P0003", "29_golpes_borrados_quedan": 0, "30_sin_golpes_sigue_congelado": "P0003",
    "31_antes_saca_jugador": 1, "32_timba_saca_jugador": 1, "33_marcas": {"skins": 1, "otras": 0},
    "34_borra_skins_entero": 1,
    "40_despues_holes": "P0003", "41_despues_course_id": "P0003", "42_despues_hoyo_inicio": "P0003",
    "43_despues_recorridos": "P0003", "44_despues_tees_ronda": "P0003", "45_despues_modo_juego": "P0003",
    "46_ida_skins_a_stroke": "P0003", "47_congelado_en_otro_formato": "P0003", "48_vuelta_timba_a_skins": "P0003",
    "49_primer_golpe_solo_x": 1, "50_despues_de_la_x_indice": "P0003",
    "51_mueve_hacia_congelado": "P0003", "52_mueve_desde_congelado": "P0003", "53_cambia_id_congelado": "P0003",
    "54_anon_indice": "42501", "55_anon_x": "42501", "56_anon_lee_marca": "42501"
  }';
  uid uuid; s uuid; s2 uuid; t uuid; t2 uuid; p uuid; n int;
  n_j uuid; s3 uuid; j3 uuid := gen_random_uuid(); jm uuid := gen_random_uuid(); j1 uuid := gen_random_uuid(); j2 uuid := gen_random_uuid(); tj uuid := gen_random_uuid(); pj uuid := gen_random_uuid();
  cod text := 'ZZ' || upper(substr(md5(random()::text), 1, 6));
  reglas jsonb := '{"config":{"version":1},"jugadorIds":[]}'::jsonb;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'congelado@prueba.test') RETURNING id INTO uid;
  INSERT INTO public.timba_probadores (user_id) VALUES (uid);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'service_role')::text, true);
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, modo_juego, reglas_juego)
    VALUES (cod, 'Prueba', current_date, uid, 'skins', 'neto', reglas || '{"congelado":{"version":1}}'::jsonb) RETURNING id INTO s;
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, modo_juego, reglas_juego)
    VALUES (cod || 'S', 'Prueba', current_date, uid, 'skins', 'neto', reglas) RETURNING id INTO s2;
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, reglas_juego)
    VALUES (cod || 'T', 'Prueba', current_date, uid, 'personalizado', reglas) RETURNING id INTO t;
  -- Timba SIN golpes del probador: el caso 48 prueba que no entra al Skins aunque nada esté congelado.
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, reglas_juego)
    VALUES (cod || 'V', 'Prueba', current_date, uid, 'personalizado', reglas) RETURNING id INTO t2;
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego)
    VALUES (cod || 'P', 'Prueba', current_date, uid, 'stroke_play') RETURNING id INTO p;
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, modo_juego, reglas_juego)
    VALUES (cod || 'Q', 'Prueba', current_date, uid, 'skins', 'neto', reglas) RETURNING id INTO s3;
  INSERT INTO ronda_libre_jugadores (id, ronda_id, nombre, user_id, handicap) VALUES (j3, s3, 'Equis', uid, 8), (jm, s2, 'Mover', NULL, 9);
  INSERT INTO ronda_libre_jugadores (id, ronda_id, nombre, user_id, handicap)
    VALUES (j1, s, 'Uno', uid, 10), (j2, s, 'Dos', NULL, 20);
  INSERT INTO ronda_libre_jugadores (id, ronda_id, nombre, user_id, handicap, scores)
    VALUES (tj, t, 'T', NULL, 10, '{"1":4}'), (pj, p, 'P', NULL, 10, '{"1":4}');

  -- El creador, con su JWT y el RLS real.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN UPDATE ronda_libre_jugadores SET handicap = 21 WHERE id = j2; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('01_antes_corrige_indice', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('01_antes_corrige_indice', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE ronda_libre_jugadores SET tees = 'azul' WHERE id = j2; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('02_antes_corrige_tee', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('02_antes_corrige_tee', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN INSERT INTO ronda_libre_jugadores (ronda_id, nombre, handicap) VALUES (s, 'Tres', 5); r := r || jsonb_build_object('03_antes_suma_jugador', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('03_antes_suma_jugador', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET reglas_juego = jsonb_set(reglas_juego, '{congelado}', '{"version":1,"x":1}') WHERE id = s; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('04_antes_creador_toca_congelado', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('04_antes_creador_toca_congelado', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, reglas_juego) VALUES (cod || 'X', 'Prueba', current_date, uid, 'skins', reglas || '{"congelado":{}}'); r := r || jsonb_build_object('05_creador_inserta_congelado', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('05_creador_inserta_congelado', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE ronda_libre_jugadores SET fuera_del_hoyo = '{"3":true}' WHERE id = j2; r := r || jsonb_build_object('06_x_directa_update', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('06_x_directa_update', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN INSERT INTO ronda_libre_jugadores (ronda_id, nombre, fuera_del_hoyo) VALUES (p, 'X', '{"3":true}'); r := r || jsonb_build_object('07_x_directa_insert', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('07_x_directa_insert', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE ronda_libre_jugadores SET nombre = 'Uno bis' WHERE id = j1; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('08_otra_columna_sigue', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('08_otra_columna_sigue', SQLSTATE || ' ' || SQLERRM); END;

  -- Primer golpe, por la RPC de siempre.
  BEGIN PERFORM upsert_ronda_libre_scores(j1, cod, '{"1":5}'::jsonb); r := r || jsonb_build_object('09_primer_golpe', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('09_primer_golpe', SQLSTATE || ' ' || SQLERRM); END;

  BEGIN UPDATE ronda_libre_jugadores SET handicap = 30 WHERE id = j2; r := r || jsonb_build_object('10_despues_indice', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('10_despues_indice', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE ronda_libre_jugadores SET tees = 'rojo' WHERE id = j2; r := r || jsonb_build_object('11_despues_tee', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('11_despues_tee', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN INSERT INTO ronda_libre_jugadores (ronda_id, nombre, handicap) VALUES (s, 'Cuatro', 5); r := r || jsonb_build_object('12_despues_suma_jugador', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('12_despues_suma_jugador', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET hcp_pct = 80 WHERE id = s; r := r || jsonb_build_object('13_despues_hcp_pct', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('13_despues_hcp_pct', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET reglas_juego = jsonb_set(reglas_juego, '{config,pozo}', '9') WHERE id = s; r := r || jsonb_build_object('14_despues_reglas', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('14_despues_reglas', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET formato_juego = 'stroke_play', reglas_juego = NULL WHERE id = s; r := r || jsonb_build_object('15_despues_sale_del_skins', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('15_despues_sale_del_skins', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET course_name = 'Prueba 2' WHERE id = s; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('16_despues_otra_columna_ronda', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('16_despues_otra_columna_ronda', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM upsert_ronda_libre_scores(j1, cod, '{"2":4}'::jsonb); r := r || jsonb_build_object('17_despues_sigue_anotando', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('17_despues_sigue_anotando', SQLSTATE || ' ' || SQLERRM); END;
  -- Cada columna vigilada de la ronda, una por una.
  BEGIN UPDATE rondas_libres SET holes = 9 WHERE id = s; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('40_despues_holes', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('40_despues_holes', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET course_id = gen_random_uuid() WHERE id = s; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('41_despues_course_id', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('41_despues_course_id', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET hoyo_inicio = 10 WHERE id = s; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('42_despues_hoyo_inicio', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('42_despues_hoyo_inicio', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET recorridos = '["A"]' WHERE id = s; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('43_despues_recorridos', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('43_despues_recorridos', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET tees = 'rojo' WHERE id = s; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('44_despues_tees_ronda', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('44_despues_tees_ronda', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET modo_juego = 'gross' WHERE id = s; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('45_despues_modo_juego', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('45_despues_modo_juego', SQLSTATE || ' ' || SQLERRM); END;
  -- Forjar lo congelado de ida y vuelta por otro formato (el organizador SÍ puede crear timba): cada paso rechazado.
  BEGIN UPDATE rondas_libres SET formato_juego = 'stroke_play' WHERE id = s2; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('46_ida_skins_a_stroke', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('46_ida_skins_a_stroke', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET reglas_juego = reglas_juego || '{"congelado":{"version":1}}' WHERE id = t; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('47_congelado_en_otro_formato', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('47_congelado_en_otro_formato', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET formato_juego = 'skins' WHERE id = t2; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('48_vuelta_timba_a_skins', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('48_vuelta_timba_a_skins', SQLSTATE || ' ' || SQLERRM); END;
  -- Primer golpe hecho solo con una X: congela igual.
  BEGIN PERFORM upsert_ronda_libre_scores(j3, cod || 'Q', '{"1":"X"}'::jsonb); r := r || jsonb_build_object('49_primer_golpe_solo_x', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('49_primer_golpe_solo_x', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE ronda_libre_jugadores SET handicap = 1 WHERE id = j3; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('50_despues_de_la_x_indice', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('50_despues_de_la_x_indice', SQLSTATE || ' ' || SQLERRM); END;
  -- Mover un jugador hacia un Skins congelado, o desde uno.
  BEGIN UPDATE ronda_libre_jugadores SET ronda_id = s WHERE id = jm; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('51_mueve_hacia_congelado', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('51_mueve_hacia_congelado', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE ronda_libre_jugadores SET ronda_id = s2 WHERE id = j2; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('52_mueve_desde_congelado', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('52_mueve_desde_congelado', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE ronda_libre_jugadores SET id = gen_random_uuid() WHERE id = j2; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('53_cambia_id_congelado', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('53_cambia_id_congelado', SQLSTATE || ' ' || SQLERRM); END;

  -- Timba y stroke play con golpes: nada cambia.
  BEGIN UPDATE ronda_libre_jugadores SET handicap = 12, tees = 'azul' WHERE id = tj; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('18_timba_indice_y_tee', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('18_timba_indice_y_tee', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET reglas_juego = jsonb_set(reglas_juego, '{config,x}', '1'), hcp_pct = 80 WHERE id = t; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('19_timba_reglas', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('19_timba_reglas', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN INSERT INTO ronda_libre_jugadores (ronda_id, nombre) VALUES (t, 'T2'); r := r || jsonb_build_object('20_timba_suma', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('20_timba_suma', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE ronda_libre_jugadores SET handicap = 12 WHERE id = pj; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('21_stroke_indice', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('21_stroke_indice', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN INSERT INTO ronda_libre_jugadores (ronda_id, nombre) VALUES (p, 'P2'); r := r || jsonb_build_object('22_stroke_suma', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('22_stroke_suma', SQLSTATE || ' ' || SQLERRM); END;

  -- service_role (la API) tampoco cambia nada después del primer golpe.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  SET LOCAL ROLE service_role;
  BEGIN UPDATE ronda_libre_jugadores SET handicap = 30 WHERE id = j2; r := r || jsonb_build_object('23_servidor_despues_indice', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('23_servidor_despues_indice', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET reglas_juego = jsonb_set(reglas_juego, '{congelado,x}', '2') WHERE id = s; r := r || jsonb_build_object('24_servidor_despues_congelado', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('24_servidor_despues_congelado', SQLSTATE || ' ' || SQLERRM); END;
  -- …y antes del primer golpe sí escribe lo congelado (así lo guarda la API al crear).
  BEGIN UPDATE rondas_libres SET reglas_juego = reglas_juego || '{"congelado":{"version":1}}' WHERE id = s2; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('25_servidor_congela_sin_golpes', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('25_servidor_congela_sin_golpes', SQLSTATE || ' ' || SQLERRM); END;
  -- 16 y 19 los frena la policy previa (solo quien puede crear timba): con service_role se ve que el trigger no.
  BEGIN UPDATE rondas_libres SET course_name = 'Prueba 3', estado = 'en_curso' WHERE id = s; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('26_servidor_skins_otra_columna', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('26_servidor_skins_otra_columna', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE rondas_libres SET reglas_juego = jsonb_set(reglas_juego, '{config,x}', '1'), hcp_pct = 80, modo_juego = 'neto' WHERE id = t; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('27_servidor_timba_reglas_con_golpes', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('27_servidor_timba_reglas_con_golpes', SQLSTATE || ' ' || SQLERRM); END;
  -- Sacar a un jugador después del primer golpe cambia el pozo y el reparto: rechazado.
  BEGIN DELETE FROM ronda_libre_jugadores WHERE id = j2; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('28_servidor_saca_jugador', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('28_servidor_saca_jugador', SQLSTATE || ' ' || SQLERRM); END;
  -- Borrar todos los golpes no reabre el Skins: la marca del primer golpe es permanente. La RPC nunca borra un golpe
  -- (solo números o «X», que se reemplazan entre sí); el único camino es un UPDATE directo de scores, como éste.
  BEGIN UPDATE ronda_libre_jugadores SET scores = '{}'::jsonb WHERE ronda_id = s;
    r := r || jsonb_build_object('29_golpes_borrados_quedan', (SELECT count(*) FROM ronda_libre_jugadores j WHERE j.ronda_id = s AND ronda_libre_tarjeta_tiene_golpes(j.scores, j.fuera_del_hoyo)));
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('29_golpes_borrados_quedan', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE ronda_libre_jugadores SET handicap = 31 WHERE id = j2; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('30_sin_golpes_sigue_congelado', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('30_sin_golpes_sigue_congelado', SQLSTATE || ' ' || SQLERRM); END;
  RESET ROLE;
  -- Antes del primer golpe sí se saca a un jugador; la Timba no cambia; la Timba no queda marcada.
  BEGIN INSERT INTO ronda_libre_jugadores (ronda_id, nombre) VALUES (s2, 'Sale') RETURNING id INTO n_j;
    DELETE FROM ronda_libre_jugadores WHERE id = n_j; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('31_antes_saca_jugador', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('31_antes_saca_jugador', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN DELETE FROM ronda_libre_jugadores WHERE id = tj; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('32_timba_saca_jugador', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('32_timba_saca_jugador', SQLSTATE || ' ' || SQLERRM); END;
  r := r || jsonb_build_object('33_marcas', (SELECT jsonb_build_object('skins', count(*) FILTER (WHERE ronda_id = s), 'otras', count(*) FILTER (WHERE ronda_id IN (s2, t, p))) FROM ronda_libre_primer_golpe));
  -- anon: no escribe tarjetas, ni la X, ni lee la marca.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN UPDATE ronda_libre_jugadores SET handicap = 2 WHERE id = j2; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('54_anon_indice', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('54_anon_indice', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN UPDATE ronda_libre_jugadores SET fuera_del_hoyo = '{"9":true}' WHERE id = j2; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('55_anon_x', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('55_anon_x', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM 1 FROM ronda_libre_primer_golpe; r := r || jsonb_build_object('56_anon_lee_marca', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('56_anon_lee_marca', SQLSTATE || ' ' || SQLERRM); END;
  RESET ROLE;
  -- Borrar el Skins entero (cascada) sigue andando aunque tenga golpes.
  BEGIN DELETE FROM rondas_libres WHERE id = s; GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('34_borra_skins_entero', n);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('34_borra_skins_entero', SQLSTATE || ' ' || SQLERRM); END;
  FOR k, v IN SELECT * FROM jsonb_each(esperado) LOOP
    obtenido := r -> k;
    calza := CASE WHEN jsonb_typeof(v) = 'string'
                  THEN jsonb_typeof(obtenido) = 'string' AND left(obtenido #>> '{}', 5) = v #>> '{}'
                  ELSE obtenido IS NOT DISTINCT FROM v END;
    IF calza THEN
      RAISE NOTICE 'OK congelado: % -> %', k, v;
    ELSE
      fallas := fallas || k || ' = ' || COALESCE(obtenido::text, '(no corrió)') || '; ';
    END IF;
  END LOOP;
  IF fallas <> '' THEN RAISE EXCEPTION 'FALLA: congelado: %', fallas; END IF;
END
$prueba$;

ROLLBACK;
