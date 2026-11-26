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
  -- P0001 pedido que no calza · P0002 no es un Skins en curso · P0003 ya empezó · 42501 sin permiso. Un texto esperado
  -- se compara como prefijo de «SQLSTATE mensaje»: los P0001 llevan el comienzo del mensaje para saber QUÉ guarda frenó.
  esperado jsonb := '{
    "01_servidor_edita": 1, "02_quedo_como_se_pidio": true,
    "03_creador_llama_directo": "42501", "04_anon_llama": "42501",
    "05_congelado_no_es_objeto": "P0001 SKINS_EDICION_INVALIDA: faltan los jugadores o lo congelado",
    "06_ids_repetidos": "P0001 SKINS_EDICION_INVALIDA: los jugadores no calzan",
    "07_nuevo_con_cuenta": "P0001 SKINS_EDICION_INVALIDA: un jugador nuevo no entra con cuenta",
    "08_saca_al_creador": "P0001 SKINS_EDICION_INVALIDA: el creador no se saca",
    "09_creador_no_primero": "P0001 SKINS_EDICION_INVALIDA: el creador no se saca",
    "10_config_guardada_intacta": true,
    "11_id_de_otra_ronda": "P0001 SKINS_EDICION_INVALIDA: un jugador es de otra ronda",
    "27_saca_rival_con_cuenta_pendiente": "P0001 SKINS_EDICION_INVALIDA: no se saca a un jugador con cuenta",
    "28_saca_rival_con_cuenta": "P0001 SKINS_EDICION_INVALIDA: no se saca a un jugador con cuenta",
    "12_nada_cambio_tras_rechazos": true,
    "13_timba": "P0002", "14_finalizada": "P0002", "15_no_existe": "P0002",
    "32_demo": "P0002 SKINS_NO_EXISTE", "33_demo_intacta": true,
    "30_punto_especial_sin_golpes": false, "30_punto_especial": "P0003 SKINS_CONGELADO",
    "31_retiro_sin_golpes": false, "31_retiro": "P0003 SKINS_CONGELADO",
    "16_primer_golpe": 1,
    "17_despues_cambia_indice": "P0003", "18_despues_solo_nombre": "P0003", "19_despues_mismo_pedido": "P0003",
    "20_despues_suma": "P0003", "21_nada_cambio_tras_golpe": true,
    "25_conserva_cuenta_sugerida": true, "26_invitado_la_pierde": true, "29_null_quita_cuenta": true,
    "22_marca_golpe_borrado": 1, "23_marca_solo_nombre": "P0003", "24_marca_cambia_indice": "P0003"
  }';
  uid uuid; uid2 uuid; uid3 uuid; s uuid; s2 uuid; t uuid; f uuid; sp uuid; sr uuid; sd uuid;
  pj uuid := gen_random_uuid(); rj uuid := gen_random_uuid(); dj uuid := gen_random_uuid();
  j1 uuid := gen_random_uuid(); j2 uuid := gen_random_uuid(); j3 uuid := gen_random_uuid(); j4 uuid := gen_random_uuid();
  k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid(); tj uuid := gen_random_uuid(); fj uuid := gen_random_uuid();
  cod text := 'ZE' || upper(substr(md5(random()::text), 1, 6));
  -- Trae un campo que esta versión de la app no conoce: editar no la reparsea ni la compara, la deja tal cual.
  config jsonb := '{"version":1,"modo":"neto","pozoPorJugador":15000,"campoDeUnaVersionFutura":true}'::jsonb;
  cong jsonb := '{"version":1,"x":"nuevo"}'::jsonb;
  pedido jsonb; reglas jsonb; antes jsonb;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'editar@prueba.test') RETURNING id INTO uid;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'rival-editar@prueba.test') RETURNING id INTO uid2;
  INSERT INTO public.profiles (id, email, name) VALUES (uid2, 'rival-editar@prueba.test', 'Rival') ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'rival2-editar@prueba.test') RETURNING id INTO uid3;
  INSERT INTO public.profiles (id, email, name) VALUES (uid3, 'rival2-editar@prueba.test', 'Rival dos') ON CONFLICT (id) DO NOTHING;
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
  -- Sin golpes, pero con un punto especial / con un retiro / demo.
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, modo_juego, estado, reglas_juego)
    VALUES (cod || 'P', 'Prueba', current_date, uid, 'skins', 'neto', 'en_curso', jsonb_build_object('config', config, 'jugadorIds', jsonb_build_array(pj)))
    RETURNING id INTO sp;
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, modo_juego, estado, reglas_juego)
    VALUES (cod || 'R', 'Prueba', current_date, uid, 'skins', 'neto', 'en_curso', jsonb_build_object('config', config, 'jugadorIds', jsonb_build_array(rj)))
    RETURNING id INTO sr;
  INSERT INTO rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, modo_juego, estado, es_demo, reglas_juego)
    VALUES (cod || 'D', 'Prueba', current_date, uid, 'skins', 'neto', 'en_curso', true, jsonb_build_object('config', config, 'jugadorIds', jsonb_build_array(dj)))
    RETURNING id INTO sd;
  INSERT INTO ronda_libre_jugadores (id, ronda_id, nombre, user_id, handicap, tees) VALUES
    (pj, sp, 'P', uid, 10, 'azul'), (rj, sr, 'R', uid, 10, 'azul'), (dj, sd, 'D', uid, 10, 'azul');
  INSERT INTO ronda_libre_puntitos (ronda_id, jugador_id, hoyo, puntito_id) VALUES (sp, pj, 1, 'birdie');
  INSERT INTO ronda_libre_retiros (ronda_id, jugador_id, desde_hoyo) VALUES (sr, rj, 1);
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
  BEGIN PERFORM editar_jugadores_skins(s, pedido, cong); r := r || jsonb_build_object('01_servidor_edita', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('01_servidor_edita', SQLSTATE || ' ' || SQLERRM); END;
  r := r || jsonb_build_object('02_quedo_como_se_pidio', (
    (SELECT count(*) FROM ronda_libre_jugadores WHERE ronda_id = s) = 3
    AND NOT EXISTS (SELECT 1 FROM ronda_libre_jugadores WHERE id = j4)
    AND EXISTS (SELECT 1 FROM ronda_libre_jugadores WHERE id = j1 AND handicap = 11.2 AND user_id = uid)
    AND EXISTS (SELECT 1 FROM ronda_libre_jugadores WHERE id = j2 AND tees = 'rojo' AND is_guest AND telefono_invitado = '+56911112222' AND user_id IS NULL)
    AND EXISTS (SELECT 1 FROM ronda_libre_jugadores WHERE id = j3 AND ronda_id = s AND handicap = 5 AND tees = 'blanco'
                AND user_id IS NULL AND perfil_sugerido_id = uid2 AND scores = '{}'::jsonb)
    AND (SELECT reglas_juego FROM rondas_libres WHERE id = s) = reglas));
  r := r || jsonb_build_object('10_config_guardada_intacta', (SELECT reglas_juego -> 'config' FROM rondas_libres WHERE id = s) = config);

  -- La cuenta sugerida de Tres: un pedido sin la clave la conserva; si pasa a invitado, la pierde.
  BEGIN
    PERFORM editar_jugadores_skins(s, jsonb_set(pedido, '{1}', (pedido -> 1) - 'perfil_sugerido_id'), cong);
    r := r || jsonb_build_object('25_conserva_cuenta_sugerida', (SELECT perfil_sugerido_id = uid2 FROM ronda_libre_jugadores WHERE id = j3));
    PERFORM editar_jugadores_skins(s, jsonb_set(pedido, '{1,is_guest}', 'true'), cong);
    r := r || jsonb_build_object('26_invitado_la_pierde', (SELECT perfil_sugerido_id IS NULL AND is_guest FROM ronda_libre_jugadores WHERE id = j3));
    PERFORM editar_jugadores_skins(s, pedido, cong);
    -- Pasa de «con cuenta» a un nombre a mano (no invitado): la clave en null la quita.
    PERFORM editar_jugadores_skins(s, jsonb_set(pedido, '{1,perfil_sugerido_id}', 'null'), cong);
    r := r || jsonb_build_object('29_null_quita_cuenta', (SELECT perfil_sugerido_id IS NULL AND NOT is_guest FROM ronda_libre_jugadores WHERE id = j3));
    PERFORM editar_jugadores_skins(s, pedido, cong);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('25_conserva_cuenta_sugerida', SQLSTATE || ' ' || SQLERRM); END;

  -- Nadie más la llama.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM editar_jugadores_skins(s, pedido, cong); r := r || jsonb_build_object('03_creador_llama_directo', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('03_creador_llama_directo', SQLSTATE || ' ' || SQLERRM); END;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN PERFORM editar_jugadores_skins(s, pedido, cong); r := r || jsonb_build_object('04_anon_llama', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('04_anon_llama', SQLSTATE || ' ' || SQLERRM); END;

  -- Pedidos que no calzan (con el índice del creador cambiado: si alguno pasara, se notaría).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  -- Dos rivales con cuenta: Dos tiene una pendiente de aceptar y Tres ya la tomó (puestas a mano, sin la API).
  RESET ROLE;
  UPDATE ronda_libre_jugadores SET pending_user_id = uid3 WHERE id = j2;
  UPDATE ronda_libre_jugadores SET user_id = uid2 WHERE id = j3;
  SET LOCAL ROLE service_role;
  antes := (SELECT jsonb_agg(to_jsonb(j) - 'updated_at' ORDER BY id) FROM ronda_libre_jugadores j WHERE ronda_id = s)
           || jsonb_build_array((SELECT reglas_juego FROM rondas_libres WHERE id = s));
  pedido := jsonb_set(pedido, '{0,handicap}', '9');
  BEGIN PERFORM editar_jugadores_skins(s, pedido, '[]'::jsonb); r := r || jsonb_build_object('05_congelado_no_es_objeto', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('05_congelado_no_es_objeto', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, pedido || jsonb_build_array(pedido -> 1), cong); r := r || jsonb_build_object('06_ids_repetidos', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('06_ids_repetidos', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, pedido || jsonb_build_array(jsonb_build_object('id', j4, 'nombre', 'Cuatro', 'user_id', uid2, 'handicap', 1, 'tees', 'azul')),
                                       cong); r := r || jsonb_build_object('07_nuevo_con_cuenta', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('07_nuevo_con_cuenta', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, pedido - 0, cong); r := r || jsonb_build_object('08_saca_al_creador', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('08_saca_al_creador', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, jsonb_build_array(pedido -> 1, pedido -> 0, pedido -> 2), cong); r := r || jsonb_build_object('09_creador_no_primero', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('09_creador_no_primero', SQLSTATE || ' ' || SQLERRM); END;
  -- El creador sigue primero: lo único que frena estos dos es «no se saca a un jugador con cuenta».
  BEGIN PERFORM editar_jugadores_skins(s, jsonb_build_array(pedido -> 0, pedido -> 1), cong); r := r || jsonb_build_object('27_saca_rival_con_cuenta_pendiente', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('27_saca_rival_con_cuenta_pendiente', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, jsonb_build_array(pedido -> 0, pedido -> 2), cong); r := r || jsonb_build_object('28_saca_rival_con_cuenta', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('28_saca_rival_con_cuenta', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, pedido || jsonb_build_array(jsonb_build_object('id', k2, 'nombre', 'Robado', 'user_id', NULL, 'handicap', 1, 'tees', 'azul')),
                                       cong); r := r || jsonb_build_object('11_id_de_otra_ronda', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('11_id_de_otra_ronda', SQLSTATE || ' ' || SQLERRM); END;
  r := r || jsonb_build_object('12_nada_cambio_tras_rechazos',
    (SELECT jsonb_agg(to_jsonb(j) - 'updated_at' ORDER BY id) FROM ronda_libre_jugadores j WHERE ronda_id = s)
      || jsonb_build_array((SELECT reglas_juego FROM rondas_libres WHERE id = s)) = antes
    AND (SELECT nombre FROM ronda_libre_jugadores WHERE id = k2) = 'Dos');

  -- Solo un Skins en curso.
  BEGIN PERFORM editar_jugadores_skins(t, jsonb_build_array(jsonb_build_object('id', tj, 'nombre', 'T', 'handicap', 1, 'tees', 'azul')), cong);
    r := r || jsonb_build_object('13_timba', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('13_timba', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(f, jsonb_build_array(jsonb_build_object('id', fj, 'nombre', 'F', 'handicap', 1, 'tees', 'azul')), cong);
    r := r || jsonb_build_object('14_finalizada', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('14_finalizada', SQLSTATE || ' ' || SQLERRM); END;
  -- Una ronda demo es de solo lectura: la función (definer) no la toca.
  BEGIN PERFORM editar_jugadores_skins(sd, jsonb_build_array(jsonb_build_object('id', dj, 'nombre', 'D cambiado', 'handicap', 1, 'tees', 'azul')), cong);
    r := r || jsonb_build_object('32_demo', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('32_demo', SQLSTATE || ' ' || SQLERRM); END;
  r := r || jsonb_build_object('33_demo_intacta', (SELECT nombre = 'D' AND handicap = 10 FROM ronda_libre_jugadores WHERE id = dj));
  -- Sin ningún golpe, pero con un punto especial o un retiro: ya empezó.
  r := r || jsonb_build_object('30_punto_especial_sin_golpes', ronda_libre_tiene_golpes(sp), '31_retiro_sin_golpes', ronda_libre_tiene_golpes(sr));
  BEGIN PERFORM editar_jugadores_skins(sp, jsonb_build_array(jsonb_build_object('id', pj, 'nombre', 'P bis', 'handicap', 1, 'tees', 'azul')), cong);
    r := r || jsonb_build_object('30_punto_especial', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('30_punto_especial', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(sr, jsonb_build_array(jsonb_build_object('id', rj, 'nombre', 'R bis', 'handicap', 1, 'tees', 'azul')), cong);
    r := r || jsonb_build_object('31_retiro', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('31_retiro', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(gen_random_uuid(), pedido, cong); r := r || jsonb_build_object('15_no_existe', 1);
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
  BEGIN PERFORM editar_jugadores_skins(s, jsonb_set(pedido, '{1,handicap}', '6'), cong); r := r || jsonb_build_object('17_despues_cambia_indice', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('17_despues_cambia_indice', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, jsonb_set(pedido, '{1,nombre}', '"Tres bis"'), cong); r := r || jsonb_build_object('18_despues_solo_nombre', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('18_despues_solo_nombre', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, pedido, cong); r := r || jsonb_build_object('19_despues_mismo_pedido', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('19_despues_mismo_pedido', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s, pedido || jsonb_build_array(jsonb_build_object('id', j4, 'nombre', 'Cuatro', 'user_id', NULL, 'handicap', 1, 'tees', 'azul')),
                                       cong); r := r || jsonb_build_object('20_despues_suma', 1);
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
  BEGIN PERFORM editar_jugadores_skins(s2, pedido, cong); r := r || jsonb_build_object('23_marca_solo_nombre', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('23_marca_solo_nombre', SQLSTATE || ' ' || SQLERRM); END;
  BEGIN PERFORM editar_jugadores_skins(s2, jsonb_set(pedido, '{1,handicap}', '3'), cong); r := r || jsonb_build_object('24_marca_cambia_indice', 1);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('24_marca_cambia_indice', SQLSTATE || ' ' || SQLERRM); END;
  RESET ROLE;

  FOR k, v IN SELECT * FROM jsonb_each(esperado) LOOP
    obtenido := r -> k;
    calza := CASE WHEN jsonb_typeof(v) = 'string'
                  THEN jsonb_typeof(obtenido) = 'string' AND left(obtenido #>> '{}', length(v #>> '{}')) = v #>> '{}'
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
