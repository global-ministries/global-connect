-- usuarios-estado-civil-no-especificado: enum_estado_civil gains
-- 'No especificado' after the four existing values, and a usuario can be
-- stored with it. Run inside BEGIN ... ROLLBACK; it raises on the first
-- failed case and writes nothing that survives.
BEGIN;

DO $$
DECLARE
  v_values text[] := enum_range(NULL::public.enum_estado_civil)::text[];
  v_id uuid;
BEGIN
  IF v_values IS DISTINCT FROM ARRAY['Soltero', 'Casado', 'Divorciado', 'Viudo', 'No especificado'] THEN
    RAISE EXCEPTION 'FAIL enum order: got %', v_values;
  END IF;

  INSERT INTO public.usuarios (nombre, apellido, genero, estado_civil)
  VALUES ('Prueba', 'Estado Civil', 'Femenino', 'No especificado')
  RETURNING id INTO v_id;
  IF (SELECT estado_civil::text FROM public.usuarios WHERE id = v_id) <> 'No especificado' THEN
    RAISE EXCEPTION 'FAIL usuario keeps No especificado';
  END IF;

  RAISE NOTICE 'usuarios-estado-civil-no-especificado: 2 cases passed';
END
$$;

ROLLBACK;
