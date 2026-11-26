-- Prueba de la migración 20261125140000_skins_congelado_tras_el_primer_golpe con el RLS real (SET ROLE + claims).
-- Se corre SOLO contra la base de pruebas y SIEMPRE termina en RAISE: rollback total, no deja nada.
--   node --env-file=.env.local scripts/test-db/prueba-sql-con-rollback.mjs \
--     supabase/migrations/20261125100000_skins_ronda_libre.sql \
--     supabase/migrations/20261125120000_guardar_tarjeta_ronda_libre_con_lock.sql \
--     supabase/migrations/20261125140000_skins_congelado_tras_el_primer_golpe.sql \
--     scripts/test-db/prueba-skins-congelado.sql
-- (las dos primeras solo mientras la base de pruebas no las tenga). El resultado sale en el mensaje «RESULTADO {...}»:
-- un número = filas tocadas (permitido), «P0003 SKINS_CONGELADO…» = rechazado por el trigger, «42501» = sin permiso.
DO $prueba$
DECLARE
  r jsonb := '{}'::jsonb;
  uid uuid; s uuid; s2 uuid; t uuid; p uuid; n int;
  j1 uuid := gen_random_uuid(); j2 uuid := gen_random_uuid(); tj uuid := gen_random_uuid(); pj uuid := gen_random_uuid();
  cod text := 'ZZ' || upper(substr(md5(random()::text), 1, 6));
  reglas jsonb := '{"config":{"version":1},"jugadorIds":[]}'::jsonb;
BEGIN
  SELECT id INTO uid FROM auth.users ORDER BY created_at LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'service_role')::text, true);
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, modo_juego, reglas_juego)
    VALUES (cod, 'Prueba', current_date, uid, 'skins', 'neto', reglas || '{"congelado":{"version":1}}'::jsonb) RETURNING id INTO s;
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, modo_juego, reglas_juego)
    VALUES (cod || 'S', 'Prueba', current_date, uid, 'skins', 'neto', reglas) RETURNING id INTO s2;
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, reglas_juego)
    VALUES (cod || 'T', 'Prueba', current_date, uid, 'personalizado', reglas) RETURNING id INTO t;
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego)
    VALUES (cod || 'P', 'Prueba', current_date, uid, 'stroke_play') RETURNING id INTO p;
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
  RESET ROLE;
  RAISE EXCEPTION 'RESULTADO %', r;
END
$prueba$;
