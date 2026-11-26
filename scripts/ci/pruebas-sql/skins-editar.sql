-- Pruebas SQL de editar_jugadores_skins (migración 20261126100000): el creador corrige los jugadores de un Skins antes
-- del primer golpe, por la API (service_role). Mismo arnés que skins-congelado.sql: cada caso guarda lo que pasó
-- (filas, true/false o «SQLSTATE mensaje») y al final se compara contra lo esperado.
-- Fuera del CI se puede correr contra la base de pruebas (nunca prod) con las migraciones que le falten delante, en la
-- misma transacción: termina en ROLLBACK y no deja nada.
BEGIN;

DO $prueba$
DECLARE
  r jsonb := '{}'::jsonb;
  k text; v jsonb; obtenido jsonb; calza boolean; fallas text := '';
  -- P0001 pedido que no calza · P0002 no es un Skins en curso · P0003 ya empezó · 42501 sin permiso.
  esperado jsonb := '{
    "01_servidor_edita": 1, "02_quedo_como_se_pidio": true,
    "03_creador_llama_directo": "42501", "04_anon_llama": "42501",
    "05_ids_no_calzan": "P0001", "06_ids_repetidos": "P0001", "07_nuevo_con_cuenta": "P0001",
    "08_saca_al_creador": "P0001", "09_creador_no_primero": "P0001", "10_cambia_config": "P0001",
    "11_id_de_otra_ronda": "P0001", "12_nada_cambio_tras_rechazos": true,
    "13_timba": "P0002", "14_finalizada": "P0002", "15_no_existe": "P0002",
    "16_primer_golpe": 1,
    "17_despues_cambia_indice": "P0003", "18_despues_solo_nombre": "P0003", "19_despues_mismo_pedido": "P0003",
    "20_despues_suma": "P0003", "21_nada_cambio_tras_golpe": true,
    "25_conserva_cuenta_sugerida": true, "26_invitado_la_pierde": true,
    "22_marca_golpe_borrado": 1, "23_marca_solo_nombre": "P0003", "24_marca_cambia_indice": "P0003"
  }';
  uid uuid; uid2 uuid; s uuid; s2 uuid; t uuid; f uuid;
  j1 uuid := gen_random_uuid(); j2 uuid := gen_random_uuid(); j3 uuid := gen_random_uuid(); j4 uuid := gen_random_uuid();
  k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid(); tj uuid := gen_random_uuid(); fj uuid := gen_random_uuid();
  cod text := 'ZE' || upper(substr(md5(random()::text), 1, 6));
  config jsonb := '{"version":1,"modo":"neto","pozoPorJugador":15000}'::jsonb;
  cong jsonb := '{"version":1,"x":"nuevo"}'::jsonb;
  pedido jsonb; reglas jsonb; antes jsonb;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'editar@prueba.test') RETURNING id INTO uid;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'rival-editar@prueba.test') RETURNING id INTO uid2;
  INSERT INTO public.profiles (id, email, name) VALUES (uid2, 'rival-editar@prueba.test', 'Rival') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.timba_probadores (user_id) VALUES (uid);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'service_role')::text, true);
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, modo_juego, estado, admin_mode, admin_user_id, reglas_juego)
    VALUES (cod, 'Prueba', current_date, uid, 'skins', 'neto', 'en_curso', true, uid,
            jsonb_build_object('config', config, 'jugadorIds', jsonb_build_array(j1, j2, j4), 'congelado', '{"version":1}'::jsonb))
    RETURNING id INTO s;
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, modo_juego, estado, admin_mode, admin_user_id, reglas_juego)
    VALUES (cod || 'M', 'Prueba', current_date, uid, 'skins', 'neto', 'en_curso', true, uid,
            jsonb_build_object('config', config, 'jugadorIds', jsonb_build_array(k1, k2)))
    RETURNING id INTO s2;
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, estado, reglas_juego)
    VALUES (cod || 'T', 'Prueba', current_date, uid, 'personalizado', 'en_curso', jsonb_build_object('config', config, 'jugadorIds', jsonb_build_array(tj)))
    RETURNING id INTO t;
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, modo_juego, estado, reglas_juego)
    VALUES (cod || 'F', 'Prueba', current_date, uid, 'skins', 'neto', 'finalizada', jsonb_build_object('config', config, 'jugadorIds', jsonb_build_array(fj)))
    RETURNING id INTO f;
  INSERT INTO ronda_libre_jugadores (id, ronda_id, nombre, user_id, handicap, tees) VALUES
    (j1, s, 'Uno', uid, 10, 'azul'), (j2, s, 'Dos', NULL, 20, 'azul'), (j4, s, 'Cuatro', NULL, 30, 'azul'),
    (k1, s2, 'Uno', uid, 10, 'azul'), (k2, s2, 'Dos', NULL, 20, 'azul'),
    (tj, t, 'T', uid, 10, 'azul'), (fj, f, 'F', uid, 10, 'azul');

  -- El servidor (service_role, como la API): índice del creador, tee de Dos, suma a Tres (con cuenta sugerida), saca a Cuatro.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  pedido := jsonb_build_array(
    jsonb_build_object('id', j1, 'nombre', 'Uno', 'user_id', uid, 'handicap', 11.2, 'tees', 'azul', 'is_guest', false),
    jsonb_build_object('id', j3, 'nombre', 'Tres', 'user_id', NULL, 'perfil_sugerido_id', uid2, 'handicap', 5, 'tees', 'blanco', 'is_guest', false),
    jsonb_build_object('id', j2, 'nombre', 'Dos', 'user_id', NULL, 'handicap', 20, 'tees', 'rojo', 'is_guest', true, 'nombre_invitado', 'Dos', 'telefono_invitado', '+56911112222')
  );
  reglas := jsonb_build_object('config', config, 'jugadorIds', jsonb_build_array(j1, j3, j2), 'congelado', cong);
  BEGIN PERFORM editar_jugadores_skins(s, pedido, reglas); r := r || jsonb_build_object('01_servidor_edita', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('01_servidor_edita', SQLSTATE || ' ' || SQLERRM); END;
  r := r || jsonb_build_object('02_quedo_como_se_pidio', (
    (SELECT count(*) FROM ronda_libre_jugadores WHERE ronda_id = s) = 3
    AND NOT EXISTS (SELECT 1 FROM ronda_libre_jugadores WHERE id = j4)
    AND EXISTS (SELECT 1 FROM ronda_libre_jugadores WHERE id = j1 AND handicap = 11.2 AND user_id = uid)
    AND EXISTS (SELECT 1 FROM ronda_libre_jugadores WHERE id = j2 AND tees = 'rojo' AND is_guest AND telefono_invitado = '+56911112222' AND user_id IS NULL)
    AND EXISTS (SELECT 1 FROM ronda_libre_jugadores WHERE id = j3 AND ronda_id = s AND handicap = 5 AND tees = 'blanco'
                AND user_id IS NULL AND perfil_sugerido_id = uid2 AND scores = '{}'::jsonb)
    AND (SELECT reglas_juego FROM rondas_libres WHERE id = s) = reglas));

  -- La cuenta sugerida de Tres: un pedido sin la clave la conserva; si pasa a invitado, la pierde.
  BEGIN
    PERFORM editar_jugadores_skins(s, jsonb_set(pedido, '{1}', (pedido -> 1) - 'perfil_sugerido_id'), reglas);
    r := r || jsonb_build_object('25_conserva_cuenta_sugerida', (SELECT perfil_sugerido_id = uid2 FROM ronda_libre_jugadores WHERE id = j3));
    PERFORM editar_jugadores_skins(s, jsonb_set(pedido, '{1,is_guest}', 'true'), reglas);
    r := r || jsonb_build_object('26_invitado_la_pierde', (SELECT perfil_sugerido_id IS NULL AND is_guest FROM ronda_libre_jugadores WHERE id = j3));
    PERFORM editar_jugadores_skins(s, pedido, reglas);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('25_conserva_cuenta_sugerida', SQLSTATE || ' ' || SQLERRM); END;

  -- Nadie más la llama.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM editar_jugadores_skins(s, pedido, reglas); r := r || jsonb_build_object('03_creador_llama_directo', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('03_creador_llama_directo', SQLSTATE || ' ' || SQLERRM); END;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN PERFORM editar_jugadores_skins(s, pedido, reglas); r := r || jsonb_build_object('04_anon_llama', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('04_anon_llama', SQLSTATE || ' ' || SQLERRM); END;

  -- Pedidos que no calzan (con el índice del creador cambiado: si alguno pasara, se notaría).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  antes := (SELECT jsonb_agg(to_jsonb(j) - 'updated_at' ORDER BY id) FROM ronda_libre_jugadores j WHERE ronda_id = s)
           || jsonb_build_array((SELECT reglas_juego FROM rondas_libres WHERE id = s));
  pedido := jsonb_set(pedido, '{0,handicap}', '9');
  BEGIN PERFORM editar_jugadores_skins(s, pedido, jsonb_set(reglas, '{jugadorIds}', jsonb_build_array(j1, j2, j3))); r := r || jsonb_build_object('05_ids_no_calzan', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('05_ids_no_calzan', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, pedido || jsonb_build_array(pedido -> 1), jsonb_set(reglas, '{jugadorIds}', jsonb_build_array(j1, j3, j2, j3))); r := r || jsonb_build_object('06_ids_repetidos', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('06_ids_repetidos', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, pedido || jsonb_build_array(jsonb_build_object('id', j4, 'nombre', 'Cuatro', 'user_id', uid2, 'handicap', 1, 'tees', 'azul')),
                                       jsonb_set(reglas, '{jugadorIds}', jsonb_build_array(j1, j3, j2, j4))); r := r || jsonb_build_object('07_nuevo_con_cuenta', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('07_nuevo_con_cuenta', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, pedido - 0, jsonb_set(reglas, '{jugadorIds}', jsonb_build_array(j3, j2))); r := r || jsonb_build_object('08_saca_al_creador', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('08_saca_al_creador', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, jsonb_build_array(pedido -> 1, pedido -> 0, pedido -> 2), jsonb_set(reglas, '{jugadorIds}', jsonb_build_array(j3, j1, j2))); r := r || jsonb_build_object('09_creador_no_primero', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('09_creador_no_primero', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, pedido, jsonb_set(reglas, '{config,pozoPorJugador}', '1')); r := r || jsonb_build_object('10_cambia_config', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('10_cambia_config', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, pedido || jsonb_build_array(jsonb_build_object('id', k2, 'nombre', 'Robado', 'user_id', NULL, 'handicap', 1, 'tees', 'azul')),
                                       jsonb_set(reglas, '{jugadorIds}', jsonb_build_array(j1, j3, j2, k2))); r := r || jsonb_build_object('11_id_de_otra_ronda', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('11_id_de_otra_ronda', SQLSTATE || ' ' || SQLERRM); END;
  r := r || jsonb_build_object('12_nada_cambio_tras_rechazos',
    (SELECT jsonb_agg(to_jsonb(j) - 'updated_at' ORDER BY id) FROM ronda_libre_jugadores j WHERE ronda_id = s)
      || jsonb_build_array((SELECT reglas_juego FROM rondas_libres WHERE id = s)) = antes
    AND (SELECT nombre FROM ronda_libre_jugadores WHERE id = k2) = 'Dos');

  -- Solo un Skins en curso.
  BEGIN PERFORM editar_jugadores_skins(t, jsonb_build_array(jsonb_build_object('id', tj, 'nombre', 'T', 'handicap', 1, 'tees', 'azul')),
                                       jsonb_build_object('config', config, 'jugadorIds', jsonb_build_array(tj))); r := r || jsonb_build_object('13_timba', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('13_timba', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(f, jsonb_build_array(jsonb_build_object('id', fj, 'nombre', 'F', 'handicap', 1, 'tees', 'azul')),
                                       jsonb_build_object('config', config, 'jugadorIds', jsonb_build_array(fj))); r := r || jsonb_build_object('14_finalizada', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('14_finalizada', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(gen_random_uuid(), pedido, reglas); r := r || jsonb_build_object('15_no_existe', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('15_no_existe', SQLSTATE || ' ' || SQLERRM); END;

  -- Primer golpe, por la RPC de siempre (el creador desde su celular).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM upsert_ronda_libre_scores(j2, cod, '{"1":5}'::jsonb); r := r || jsonb_build_object('16_primer_golpe', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('16_primer_golpe', SQLSTATE || ' ' || SQLERRM); END;

  -- Desde ahí, nada. 18 y 19 no tocan ninguna columna que vigile el trigger de #892: solo los frena esta función.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  antes := (SELECT jsonb_agg(to_jsonb(j) - 'updated_at' ORDER BY id) FROM ronda_libre_jugadores j WHERE ronda_id = s)
           || jsonb_build_array((SELECT reglas_juego FROM rondas_libres WHERE id = s));
  pedido := jsonb_set(pedido, '{0,handicap}', '11.2');
  BEGIN PERFORM editar_jugadores_skins(s, jsonb_set(pedido, '{1,handicap}', '6'), reglas); r := r || jsonb_build_object('17_despues_cambia_indice', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('17_despues_cambia_indice', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, jsonb_set(pedido, '{1,nombre}', '"Tres bis"'), reglas); r := r || jsonb_build_object('18_despues_solo_nombre', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('18_despues_solo_nombre', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, pedido, reglas); r := r || jsonb_build_object('19_despues_mismo_pedido', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('19_despues_mismo_pedido', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, pedido || jsonb_build_array(jsonb_build_object('id', j4, 'nombre', 'Cuatro', 'user_id', NULL, 'handicap', 1, 'tees', 'azul')),
                                       jsonb_set(reglas, '{jugadorIds}', jsonb_build_array(j1, j3, j2, j4))); r := r || jsonb_build_object('20_despues_suma', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('20_despues_suma', SQLSTATE || ' ' || SQLERRM); END;
  r := r || jsonb_build_object('21_nada_cambio_tras_golpe',
    (SELECT jsonb_agg(to_jsonb(j) - 'updated_at' ORDER BY id) FROM ronda_libre_jugadores j WHERE ronda_id = s)
      || jsonb_build_array((SELECT reglas_juego FROM rondas_libres WHERE id = s)) = antes);

  -- La marca es permanente: con el único golpe borrado, las tarjetas quedan vacías y la edición sigue cerrada.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM upsert_ronda_libre_scores(k2, cod || 'M', '{"1":5}'::jsonb);
    RESET ROLE;
    -- La RPC nunca borra un golpe: el único camino es un UPDATE directo de scores (como en skins-congelado.sql).
    UPDATE ronda_libre_jugadores SET scores = '{}'::jsonb WHERE ronda_id = s2;
    r := r || jsonb_build_object('22_marca_golpe_borrado', (SELECT count(*) FROM ronda_libre_jugadores
      WHERE ronda_id = s2 AND NOT ronda_libre_tarjeta_tiene_golpes(scores, fuera_del_hoyo)) / 2);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('22_marca_golpe_borrado', SQLSTATE || ' ' || SQLERRM); END;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  pedido := jsonb_build_array(
    jsonb_build_object('id', k1, 'nombre', 'Uno', 'user_id', uid, 'handicap', 10, 'tees', 'azul'),
    jsonb_build_object('id', k2, 'nombre', 'Dos bis', 'user_id', NULL, 'handicap', 20, 'tees', 'azul'));
  reglas := jsonb_build_object('config', config, 'jugadorIds', jsonb_build_array(k1, k2));
  BEGIN PERFORM editar_jugadores_skins(s2, pedido, reglas); r := r || jsonb_build_object('23_marca_solo_nombre', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('23_marca_solo_nombre', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s2, jsonb_set(pedido, '{1,handicap}', '3'), reglas); r := r || jsonb_build_object('24_marca_cambia_indice', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('24_marca_cambia_indice', SQLSTATE || ' ' || SQLERRM); END;
  RESET ROLE;

  FOR k, v IN SELECT * FROM jsonb_each(esperado) LOOP
    obtenido := r -> k;
    calza := CASE WHEN jsonb_typeof(v) = 'string'
                  THEN jsonb_typeof(obtenido) = 'string' AND left(obtenido #>> '{}', 5) = v #>> '{}'
                  ELSE obtenido IS NOT DISTINCT FROM v END;
    IF calza THEN
      RAISE NOTICE 'OK editar: % -> %', k, v;
    ELSE
      fallas := fallas || k || ' = ' || COALESCE(obtenido::text, '(no corrió)') || '; ';
    END IF;
  END LOOP;
  IF fallas <> '' THEN RAISE EXCEPTION 'FALLA: editar: %', fallas; END IF;
END
$prueba$;

ROLLBACK;
