-- Simplify user roles and permissions helper functions and policies

-- 5. Re-create helper functions
CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app.current_role() = 'super_admin' $$;

CREATE OR REPLACE FUNCTION app.guard_profile_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_jwt_role text;
  v_app_role text;
BEGIN
  v_jwt_role := COALESCE(auth.role(), '');
  IF v_jwt_role = 'service_role' THEN
    RETURN new;
  END IF;
  v_app_role := COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), 'user');
  IF (new.role IS DISTINCT FROM old.role) OR (new.unit_id IS DISTINCT FROM old.unit_id) THEN
    IF v_app_role <> 'super_admin' THEN
      RAISE EXCEPTION 'Only admin may change role or unit_id' USING errcode = '42501';
    END IF;
  END IF;
  RETURN new;
END$$;

-- 6. Recreate has_capability function to dynamically map roles to capabilities
CREATE OR REPLACE FUNCTION app.has_capability(p_cap public.capability, p_unit uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    -- super_admin has all capabilities everywhere
    WHEN app.current_role() = 'super_admin' THEN TRUE
    
    -- unit_admin has all capabilities in their unit
    WHEN app.current_role() = 'unit_admin' AND (p_unit IS NULL OR p_unit = app.current_unit_id()) THEN TRUE
    
    -- mess_secretary has all capabilities in their unit (just like unit_admin)
    WHEN app.current_role() = 'mess_secretary' AND (p_unit IS NULL OR p_unit = app.current_unit_id()) THEN TRUE
    
    -- mess_havildar has: attendance.read/write, ration.read/issue, inventory.read/write, reports.unit
    WHEN app.current_role() = 'mess_havildar' AND (p_unit IS NULL OR p_unit = app.current_unit_id()) AND p_cap IN (
      'attendance.read'::public.capability, 'attendance.write'::public.capability, 
      'ration.read'::public.capability, 'ration.issue'::public.capability, 
      'inventory.read'::public.capability, 'inventory.write'::public.capability,
      'reports.unit'::public.capability
    ) THEN TRUE
    
    -- bar_nco has: bar.read/write, inventory.read/write
    WHEN app.current_role() = 'bar_nco' AND (p_unit IS NULL OR p_unit = app.current_unit_id()) AND p_cap IN (
      'bar.read'::public.capability, 'bar.write'::public.capability, 
      'inventory.read'::public.capability, 'inventory.write'::public.capability
    ) THEN TRUE
    
    -- property_nco has: rooms.read/booking.write/manage
    WHEN app.current_role() = 'property_nco' AND (p_unit IS NULL OR p_unit = app.current_unit_id()) AND p_cap IN (
      'rooms.read'::public.capability, 'rooms.booking.write'::public.capability, 'rooms.manage'::public.capability
    ) THEN TRUE
    
    -- user has read-only billing/attendance
    WHEN app.current_role() = 'user' AND (p_unit IS NULL OR p_unit = app.current_unit_id()) AND p_cap IN (
      'billing.read'::public.capability, 'attendance.read'::public.capability
    ) THEN TRUE
    
    -- manager has general read-only ops
    WHEN app.current_role() = 'manager' AND (p_unit IS NULL OR p_unit = app.current_unit_id()) AND p_cap IN (
      'masters.read'::public.capability, 'inventory.read'::public.capability, 'attendance.read'::public.capability, 
      'ration.read'::public.capability, 'bar.read'::public.capability, 'rooms.read'::public.capability, 
      'parties.read'::public.capability, 'billing.read'::public.capability
    ) THEN TRUE
    
    ELSE EXISTS (
      SELECT 1 FROM public.user_capabilities uc
       WHERE uc.user_id = (SELECT auth.uid())
         AND uc.capability = p_cap
         AND (uc.unit_id IS NULL OR uc.unit_id = p_unit)
    )
  END
$$;

-- 7. Drop and recreate restrictive MFA policies for super_admin
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT c.relname as tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
  LOOP
    -- drop old 'admin' restrictive policies
    EXECUTE format('DROP POLICY IF EXISTS aal2_admin_insert ON public.%I', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS aal2_admin_update ON public.%I', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS aal2_admin_delete ON public.%I', t.tablename);
    
    -- drop new 'super_admin' restrictive policies (for idempotency)
    EXECUTE format('DROP POLICY IF EXISTS aal2_super_admin_insert ON public.%I', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS aal2_super_admin_update ON public.%I', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS aal2_super_admin_delete ON public.%I', t.tablename);

    -- create new super_admin restrictive policies
    EXECUTE format($f$
      CREATE POLICY aal2_super_admin_insert ON public.%I
        AS restrictive FOR insert TO authenticated
        WITH CHECK (
          COALESCE(app.current_role()::text, '') <> 'super_admin'
          OR COALESCE(auth.jwt()->>'aal', 'aal1') = 'aal2'
        )
    $f$, t.tablename);

    EXECUTE format($f$
      CREATE POLICY aal2_super_admin_update ON public.%I
        AS restrictive FOR update TO authenticated
        USING (
          COALESCE(app.current_role()::text, '') <> 'super_admin'
          OR COALESCE(auth.jwt()->>'aal', 'aal1') = 'aal2'
        )
    $f$, t.tablename);

    EXECUTE format($f$
      CREATE POLICY aal2_super_admin_delete ON public.%I
        AS restrictive FOR delete TO authenticated
        USING (
          COALESCE(app.current_role()::text, '') <> 'super_admin'
          OR COALESCE(auth.jwt()->>'aal', 'aal1') = 'aal2'
        )
    $f$, t.tablename);
  END LOOP;
END $$;
