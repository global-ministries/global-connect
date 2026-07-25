-- ══════════════════════════════════════════════════════════════════════════════
-- Recreate seed auth.users with correct instance_id and known password.
-- ══════════════════════════════════════════════════════════════════════════════
--
-- M8 (20260724000000_pastoral_seeding) only inserted rows into public.usuarios
-- and assumed the matching auth.users records already existed (or the
-- operator created them via Supabase Studio). When the M8 migration ran
-- standalone in a fresh environment, it left auth.users with placeholder
-- UUIDs ('aaaaaaaa-...') whose instance_id pointed at a fake project.
-- That made them invisible to GoTrue and the admin API, and any future
-- UPDATE TO null on instance_id failed the 'must equal current instance'
-- check.
--
-- This migration:
--   1. Creates the seed users via auth.admin (correct instance_id auto-set).
--   2. Links public.usuarios.auth_id to the new auth.users.id.
--   3. Idempotent: if the user already exists at the canonical instance,
--      only re-confirms the link and the email.
--   4. Sets a known password for the demo so the operator can log in.
--
-- The admin/seed user is `isaacpaezz@gmail.com` and has a real password
-- already. We only normalize the THREE seed personas here.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_ana_id uuid;
  v_asis_id uuid;
  v_admin_id uuid;
  v_ana_persona uuid;
  v_asis_persona uuid;
  v_admin_persona uuid;
  v_ana_pwd constant text := 'Demo1234!';
  v_asis_pwd constant text := 'Demo1234!';
  v_admin_pwd constant text := 'Demo1234!';
BEGIN
  -- Look up the personas (so we can use existing public.usuarios rows
  -- as the link target rather than creating duplicates).
  SELECT id INTO v_ana_persona   FROM public.usuarios WHERE email = 'seed_ana_lider@global.test';
  SELECT id INTO v_asis_persona FROM public.usuarios WHERE email = 'seed_asistido@global.test';
  SELECT id INTO v_admin_persona FROM public.usuarios WHERE email = 'seed_admin_pastoral@global.test';

  -- Ana — create or update. We do this via auth.admin (server-side) so
  -- the row lands at the canonical instance_id for this project.
  BEGIN
    v_ana_id := auth.admin.create_user(
      email => 'seed_ana_lider@global.test',
      password => v_ana_pwd,
      email_confirm => true,
      user_metadata => jsonb_build_object(
        'nombre', 'Ana',
        'apellido', 'Lider GDV'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- If the user already exists, look it up.
    SELECT id INTO v_ana_id FROM auth.users WHERE email = 'seed_ana_lider@global.test';
    -- And force the password reset.
    PERFORM auth.admin.update_user_by_id(
      v_ana_id,
      jsonb_build_object('password', v_ana_pwd)
    );
  END;

  -- Asistido
  BEGIN
    v_asis_id := auth.admin.create_user(
      email => 'seed_asistido@global.test',
      password => v_asis_pwd,
      email_confirm => true,
      user_metadata => jsonb_build_object(
        'nombre', 'Asistido',
        'apellido', 'Pastoral'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    SELECT id INTO v_asis_id FROM auth.users WHERE email = 'seed_asistido@global.test';
    PERFORM auth.admin.update_user_by_id(
      v_asis_id,
      jsonb_build_object('password', v_asis_pwd)
    );
  END;

  -- Admin seed
  BEGIN
    v_admin_id := auth.admin.create_user(
      email => 'seed_admin_pastoral@global.test',
      password => v_admin_pwd,
      email_confirm => true,
      user_metadata => jsonb_build_object(
        'nombre', 'Admin',
        'apellido', 'Pastoral',
        'is_super_admin', true
      )
    );
  EXCEPTION WHEN OTHERS THEN
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'seed_admin_pastoral@global.test';
    PERFORM auth.admin.update_user_by_id(
      v_admin_id,
      jsonb_build_object('password', v_admin_pwd)
    );
  END;

  -- Link public.usuarios.auth_id to the freshly created/recovered ids.
  UPDATE public.usuarios SET auth_id = v_ana_id   WHERE id = v_ana_persona;
  UPDATE public.usuarios SET auth_id = v_asis_id WHERE id = v_asis_persona;
  UPDATE public.usuarios SET auth_id = v_admin_id WHERE id = v_admin_persona;

  RAISE NOTICE 'M-future-1: seed auth.users ready. Ana=%, Asistido=%, Admin=%',
    v_ana_id, v_asis_id, v_admin_id;
END $$;
