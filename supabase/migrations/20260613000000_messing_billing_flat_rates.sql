-- Create messing_billing_mode enum
CREATE TYPE public.messing_billing_mode AS ENUM ('FLAT_RATE', 'P_REGISTER_SPLIT');

-- Create messing_meal_type enum
CREATE TYPE public.messing_meal_type AS ENUM (
  'breakfast', 
  'morning_tea', 
  'lunch', 
  'evening_tea', 
  'dinner',
  'packed_breakfast',
  'packed_lunch',
  'packed_dinner'
);

-- Add messing_billing_mode column to units table
ALTER TABLE public.units ADD COLUMN messing_billing_mode public.messing_billing_mode NOT NULL DEFAULT 'P_REGISTER_SPLIT';

-- Create messing_flat_rates history table
CREATE TABLE public.messing_flat_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  meal_type public.messing_meal_type NOT NULL,
  rate DECIMAL(12, 2) NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  CONSTRAINT unit_meal_rate_history_unique UNIQUE (unit_id, meal_type, valid_from)
);

-- Index for lookup queries
CREATE INDEX idx_messing_flat_rates_lookup ON public.messing_flat_rates (unit_id, meal_type, valid_from, valid_to);

-- Trigger: app.set_updated_at before update
CREATE TRIGGER messing_flat_rates_set_updated_at
BEFORE UPDATE ON public.messing_flat_rates
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Enable RLS
ALTER TABLE public.messing_flat_rates ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users in the unit or admin
CREATE POLICY messing_flat_rates_select ON public.messing_flat_rates
  FOR SELECT TO authenticated
  USING (app.is_admin() OR unit_id = app.current_unit_id());

-- WRITE (insert/update/delete): authenticated unit admin of the unit or super admin
CREATE POLICY messing_flat_rates_insert ON public.messing_flat_rates
  FOR INSERT TO authenticated
  WITH CHECK (app.is_admin() OR app.is_unit_admin_of(unit_id));

CREATE POLICY messing_flat_rates_update ON public.messing_flat_rates
  FOR UPDATE TO authenticated
  USING (app.is_admin() OR app.is_unit_admin_of(unit_id))
  WITH CHECK (app.is_admin() OR app.is_unit_admin_of(unit_id));

CREATE POLICY messing_flat_rates_delete ON public.messing_flat_rates
  FOR DELETE TO authenticated
  USING (app.is_admin() OR app.is_unit_admin_of(unit_id));

-- Restrictive policies for super_admin (AAL2 enforcement)
CREATE POLICY aal2_super_admin_insert ON public.messing_flat_rates
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(app.current_role()::text, '') <> 'super_admin'
    OR COALESCE(auth.jwt()->>'aal', 'aal1') = 'aal2'
  );

CREATE POLICY aal2_super_admin_update ON public.messing_flat_rates
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    COALESCE(app.current_role()::text, '') <> 'super_admin'
    OR COALESCE(auth.jwt()->>'aal', 'aal1') = 'aal2'
  );

CREATE POLICY aal2_super_admin_delete ON public.messing_flat_rates
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    COALESCE(app.current_role()::text, '') <> 'super_admin'
    OR COALESCE(auth.jwt()->>'aal', 'aal1') = 'aal2'
  );

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messing_flat_rates TO authenticated;

-- Audit Trigger: app.audit_trigger after write
CREATE TRIGGER audit_messing_flat_rates
AFTER INSERT OR UPDATE OR DELETE ON public.messing_flat_rates
FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();
