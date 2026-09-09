-- Migration: 20260614000000_messing_kitchen_and_monthly_billing.sql
-- Supports:
-- 1. Daily Kitchen Expenditures & P-Register Average Rates (Mess Havildar)
-- 2. Member Meal Cuts (Flat Rate & P-Register)
-- 3. Casual Guest Meals
-- 4. Monthly Subscriptions & Miscellaneous Debits/Recoveries
-- 5. Monthly Billing Cycle (26th to 25th) & Mess Bills with Granular Line Items

-- ============================================================================
-- 1. DAILY KITCHEN EXPENDITURES (Mess Havildar Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mess_daily_expenditures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  expenditure_date DATE NOT NULL,
  morning_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (morning_amount >= 0),
  afternoon_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (afternoon_amount >= 0),
  dinner_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (dinner_amount >= 0),
  total_amount DECIMAL(12, 2) NOT NULL CHECK (total_amount >= 0),
  notes TEXT,
  receipt_ref TEXT,
  vendor_name TEXT,
  sourcing_category TEXT NOT NULL DEFAULT 'LOCAL_PURCHASE' CHECK (sourcing_category IN ('LOCAL_PURCHASE', 'CANTEEN', 'OTHER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT mess_daily_expenditures_unit_date_ux UNIQUE (unit_id, expenditure_date)
);

CREATE INDEX IF NOT EXISTS idx_mess_daily_expenditures_lookup ON public.mess_daily_expenditures (unit_id, expenditure_date);

DROP TRIGGER IF EXISTS mess_daily_expenditures_set_updated_at ON public.mess_daily_expenditures;
CREATE TRIGGER mess_daily_expenditures_set_updated_at
BEFORE UPDATE ON public.mess_daily_expenditures
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================================
-- 2. DAILY P-RATES SNAPSHOT (P_d = Daily Cost / Total Present Diners)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mess_daily_p_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  rate_date DATE NOT NULL,
  total_expenditure DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (total_expenditure >= 0),
  present_count INT NOT NULL DEFAULT 0 CHECK (present_count >= 0),
  rate_per_diner DECIMAL(12, 4) NOT NULL DEFAULT 0 CHECK (rate_per_diner >= 0),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  calculated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT mess_daily_p_rates_unit_date_ux UNIQUE (unit_id, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_mess_daily_p_rates_lookup ON public.mess_daily_p_rates (unit_id, rate_date);

-- ============================================================================
-- 3. MEMBER MEAL CUTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mess_meal_cuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cut_date DATE NOT NULL,
  meal_type public.messing_meal_type NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('requested', 'approved', 'rejected', 'cancelled')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mess_meal_cuts_profile_date_meal_ux UNIQUE (profile_id, cut_date, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_mess_meal_cuts_lookup ON public.mess_meal_cuts (unit_id, cut_date, profile_id);

DROP TRIGGER IF EXISTS mess_meal_cuts_set_updated_at ON public.mess_meal_cuts;
CREATE TRIGGER mess_meal_cuts_set_updated_at
BEFORE UPDATE ON public.mess_meal_cuts
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================================
-- 4. CASUAL GUEST MEALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.guest_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  host_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  meal_date DATE NOT NULL,
  meal_type public.messing_meal_type NOT NULL,
  guest_count INT NOT NULL DEFAULT 1 CHECK (guest_count >= 1),
  guest_names TEXT,
  rate_charged DECIMAL(12, 2) NOT NULL CHECK (rate_charged >= 0),
  total_amount DECIMAL(12, 2) NOT NULL CHECK (total_amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_guest_meals_lookup ON public.guest_meals (unit_id, meal_date, host_profile_id);

-- ============================================================================
-- 5. MONTHLY SUBSCRIPTIONS (Mess Maintenance, Sports, Library, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mess_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mess_subscriptions_unit_name_ux UNIQUE (unit_id, name)
);

CREATE INDEX IF NOT EXISTS idx_mess_subscriptions_unit ON public.mess_subscriptions (unit_id);

DROP TRIGGER IF EXISTS mess_subscriptions_set_updated_at ON public.mess_subscriptions;
CREATE TRIGGER mess_subscriptions_set_updated_at
BEFORE UPDATE ON public.mess_subscriptions
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================================
-- 6. MISCELLANEOUS DEBITS & RECOVERIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mess_misc_debits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  charge_date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('personal_recovery', 'damage_breakage', 'laundry_tailor', 'sports_club', 'other')),
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  receipt_ref TEXT,
  is_billed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mess_misc_debits_lookup ON public.mess_misc_debits (unit_id, profile_id, is_billed);

-- ============================================================================
-- 7. BILLING PERIODS (26th to 25th Cycle)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mess_billing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  billing_year INT NOT NULL,
  billing_month INT NOT NULL CHECK (billing_month BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'calculating', 'draft', 'published', 'closed')),
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mess_billing_periods_unit_month_ux UNIQUE (unit_id, billing_year, billing_month),
  CONSTRAINT mess_billing_period_dates_check CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_mess_billing_periods_lookup ON public.mess_billing_periods (unit_id, billing_year, billing_month);

DROP TRIGGER IF EXISTS mess_billing_periods_set_updated_at ON public.mess_billing_periods;
CREATE TRIGGER mess_billing_periods_set_updated_at
BEFORE UPDATE ON public.mess_billing_periods
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================================
-- 8. MESS BILLS (Consolidated Monthly Bill per Officer)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mess_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  billing_period_id UUID NOT NULL REFERENCES public.mess_billing_periods(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bill_number TEXT NOT NULL,
  messing_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (messing_amount >= 0),
  bar_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (bar_amount >= 0),
  room_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (room_amount >= 0),
  guest_meal_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (guest_meal_amount >= 0),
  subscriptions_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (subscriptions_amount >= 0),
  misc_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (misc_amount >= 0),
  arrears_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (arrears_amount >= 0),
  total_amount DECIMAL(12, 2) NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paid', 'overdue', 'cancelled')),
  due_date DATE NOT NULL,
  paid_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  payment_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mess_bills_period_profile_ux UNIQUE (billing_period_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_mess_bills_period ON public.mess_bills (billing_period_id);
CREATE INDEX IF NOT EXISTS idx_mess_bills_profile ON public.mess_bills (profile_id);
CREATE INDEX IF NOT EXISTS idx_mess_bills_unit ON public.mess_bills (unit_id);

DROP TRIGGER IF EXISTS mess_bills_set_updated_at ON public.mess_bills;
CREATE TRIGGER mess_bills_set_updated_at
BEFORE UPDATE ON public.mess_bills
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ============================================================================
-- 9. MESS BILL LINE ITEMS (Audit Breakdown)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mess_bill_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.mess_bills(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('messing', 'bar', 'room', 'guest_meal', 'subscription', 'misc', 'arrear')),
  item_date DATE,
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit_rate DECIMAL(12, 2) NOT NULL DEFAULT 0,
  amount DECIMAL(12, 2) NOT NULL,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mess_bill_line_items_bill ON public.mess_bill_line_items (bill_id);

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.mess_daily_expenditures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mess_daily_p_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mess_meal_cuts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mess_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mess_misc_debits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mess_billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mess_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mess_bill_line_items ENABLE ROW LEVEL SECURITY;

-- mess_daily_expenditures
DROP POLICY IF EXISTS mess_daily_expenditures_select ON public.mess_daily_expenditures;
CREATE POLICY mess_daily_expenditures_select ON public.mess_daily_expenditures
  FOR SELECT TO authenticated
  USING (app.is_admin() OR unit_id = app.current_unit_id());

DROP POLICY IF EXISTS mess_daily_expenditures_write ON public.mess_daily_expenditures;
CREATE POLICY mess_daily_expenditures_write ON public.mess_daily_expenditures
  FOR ALL TO authenticated
  USING (app.is_admin() OR app.is_unit_admin_of(unit_id) OR app.has_capability('attendance.write', unit_id))
  WITH CHECK (app.is_admin() OR app.is_unit_admin_of(unit_id) OR app.has_capability('attendance.write', unit_id));

-- mess_daily_p_rates
DROP POLICY IF EXISTS mess_daily_p_rates_select ON public.mess_daily_p_rates;
CREATE POLICY mess_daily_p_rates_select ON public.mess_daily_p_rates
  FOR SELECT TO authenticated
  USING (app.is_admin() OR unit_id = app.current_unit_id());

DROP POLICY IF EXISTS mess_daily_p_rates_write ON public.mess_daily_p_rates;
CREATE POLICY mess_daily_p_rates_write ON public.mess_daily_p_rates
  FOR ALL TO authenticated
  USING (app.is_admin() OR app.is_unit_admin_of(unit_id) OR app.has_capability('attendance.write', unit_id))
  WITH CHECK (app.is_admin() OR app.is_unit_admin_of(unit_id) OR app.has_capability('attendance.write', unit_id));

-- mess_meal_cuts
DROP POLICY IF EXISTS mess_meal_cuts_select ON public.mess_meal_cuts;
CREATE POLICY mess_meal_cuts_select ON public.mess_meal_cuts
  FOR SELECT TO authenticated
  USING (app.is_admin() OR profile_id = auth.uid() OR unit_id = app.current_unit_id());

DROP POLICY IF EXISTS mess_meal_cuts_insert ON public.mess_meal_cuts;
CREATE POLICY mess_meal_cuts_insert ON public.mess_meal_cuts
  FOR INSERT TO authenticated
  WITH CHECK (app.is_admin() OR profile_id = auth.uid() OR app.has_capability('attendance.write', unit_id));

DROP POLICY IF EXISTS mess_meal_cuts_update ON public.mess_meal_cuts;
CREATE POLICY mess_meal_cuts_update ON public.mess_meal_cuts
  FOR UPDATE TO authenticated
  USING (app.is_admin() OR profile_id = auth.uid() OR app.has_capability('attendance.write', unit_id))
  WITH CHECK (app.is_admin() OR profile_id = auth.uid() OR app.has_capability('attendance.write', unit_id));

DROP POLICY IF EXISTS mess_meal_cuts_delete ON public.mess_meal_cuts;
CREATE POLICY mess_meal_cuts_delete ON public.mess_meal_cuts
  FOR DELETE TO authenticated
  USING (app.is_admin() OR profile_id = auth.uid() OR app.has_capability('attendance.write', unit_id));

-- guest_meals
DROP POLICY IF EXISTS guest_meals_select ON public.guest_meals;
CREATE POLICY guest_meals_select ON public.guest_meals
  FOR SELECT TO authenticated
  USING (app.is_admin() OR host_profile_id = auth.uid() OR unit_id = app.current_unit_id());

DROP POLICY IF EXISTS guest_meals_write ON public.guest_meals;
CREATE POLICY guest_meals_write ON public.guest_meals
  FOR ALL TO authenticated
  USING (app.is_admin() OR app.is_unit_admin_of(unit_id) OR app.has_capability('attendance.write', unit_id))
  WITH CHECK (app.is_admin() OR app.is_unit_admin_of(unit_id) OR app.has_capability('attendance.write', unit_id));

-- mess_subscriptions
DROP POLICY IF EXISTS mess_subscriptions_select ON public.mess_subscriptions;
CREATE POLICY mess_subscriptions_select ON public.mess_subscriptions
  FOR SELECT TO authenticated
  USING (app.is_admin() OR unit_id = app.current_unit_id());

DROP POLICY IF EXISTS mess_subscriptions_write ON public.mess_subscriptions;
CREATE POLICY mess_subscriptions_write ON public.mess_subscriptions
  FOR ALL TO authenticated
  USING (app.is_admin() OR app.is_unit_admin_of(unit_id))
  WITH CHECK (app.is_admin() OR app.is_unit_admin_of(unit_id));

-- mess_misc_debits
DROP POLICY IF EXISTS mess_misc_debits_select ON public.mess_misc_debits;
CREATE POLICY mess_misc_debits_select ON public.mess_misc_debits
  FOR SELECT TO authenticated
  USING (app.is_admin() OR profile_id = auth.uid() OR unit_id = app.current_unit_id());

DROP POLICY IF EXISTS mess_misc_debits_write ON public.mess_misc_debits;
CREATE POLICY mess_misc_debits_write ON public.mess_misc_debits
  FOR ALL TO authenticated
  USING (app.is_admin() OR app.is_unit_admin_of(unit_id) OR app.has_capability('billing.draft', unit_id))
  WITH CHECK (app.is_admin() OR app.is_unit_admin_of(unit_id) OR app.has_capability('billing.draft', unit_id));

-- mess_billing_periods
DROP POLICY IF EXISTS mess_billing_periods_select ON public.mess_billing_periods;
CREATE POLICY mess_billing_periods_select ON public.mess_billing_periods
  FOR SELECT TO authenticated
  USING (app.is_admin() OR unit_id = app.current_unit_id());

DROP POLICY IF EXISTS mess_billing_periods_write ON public.mess_billing_periods;
CREATE POLICY mess_billing_periods_write ON public.mess_billing_periods
  FOR ALL TO authenticated
  USING (app.is_admin() OR app.is_unit_admin_of(unit_id) OR app.has_capability('billing.draft', unit_id) OR app.has_capability('billing.finalize', unit_id))
  WITH CHECK (app.is_admin() OR app.is_unit_admin_of(unit_id) OR app.has_capability('billing.draft', unit_id) OR app.has_capability('billing.finalize', unit_id));

-- mess_bills
DROP POLICY IF EXISTS mess_bills_select ON public.mess_bills;
CREATE POLICY mess_bills_select ON public.mess_bills
  FOR SELECT TO authenticated
  USING (
    app.is_admin() 
    OR (profile_id = auth.uid() AND status IN ('published', 'paid', 'overdue'))
    OR app.has_capability('billing.read', unit_id)
  );

DROP POLICY IF EXISTS mess_bills_write ON public.mess_bills;
CREATE POLICY mess_bills_write ON public.mess_bills
  FOR ALL TO authenticated
  USING (app.is_admin() OR app.is_unit_admin_of(unit_id) OR app.has_capability('billing.draft', unit_id) OR app.has_capability('billing.finalize', unit_id))
  WITH CHECK (app.is_admin() OR app.is_unit_admin_of(unit_id) OR app.has_capability('billing.draft', unit_id) OR app.has_capability('billing.finalize', unit_id));

-- mess_bill_line_items
DROP POLICY IF EXISTS mess_bill_line_items_select ON public.mess_bill_line_items;
CREATE POLICY mess_bill_line_items_select ON public.mess_bill_line_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mess_bills b
      WHERE b.id = mess_bill_line_items.bill_id
        AND (
          app.is_admin()
          OR (b.profile_id = auth.uid() AND b.status IN ('published', 'paid', 'overdue'))
          OR app.has_capability('billing.read', b.unit_id)
        )
    )
  );

DROP POLICY IF EXISTS mess_bill_line_items_write ON public.mess_bill_line_items;
CREATE POLICY mess_bill_line_items_write ON public.mess_bill_line_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mess_bills b
      WHERE b.id = mess_bill_line_items.bill_id
        AND (app.is_admin() OR app.is_unit_admin_of(b.unit_id) OR app.has_capability('billing.draft', b.unit_id) OR app.has_capability('billing.finalize', b.unit_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mess_bills b
      WHERE b.id = mess_bill_line_items.bill_id
        AND (app.is_admin() OR app.is_unit_admin_of(b.unit_id) OR app.has_capability('billing.draft', b.unit_id) OR app.has_capability('billing.finalize', b.unit_id))
    )
  );

-- Restrictive AAL2 policies for super_admin
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'mess_daily_expenditures',
    'mess_daily_p_rates',
    'mess_meal_cuts',
    'guest_meals',
    'mess_subscriptions',
    'mess_misc_debits',
    'mess_billing_periods',
    'mess_bills',
    'mess_bill_line_items'
  ] LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS aal2_super_admin_insert_%1$I ON public.%1$I;
      CREATE POLICY aal2_super_admin_insert_%1$I ON public.%1$I
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          COALESCE(app.current_role()::text, '''') <> ''super_admin''
          OR COALESCE(auth.jwt()->>''aal'', ''aal1'') = ''aal2''
        );
      DROP POLICY IF EXISTS aal2_super_admin_update_%1$I ON public.%1$I;
      CREATE POLICY aal2_super_admin_update_%1$I ON public.%1$I
        AS RESTRICTIVE FOR UPDATE TO authenticated
        USING (
          COALESCE(app.current_role()::text, '''') <> ''super_admin''
          OR COALESCE(auth.jwt()->>''aal'', ''aal1'') = ''aal2''
        );
      DROP POLICY IF EXISTS aal2_super_admin_delete_%1$I ON public.%1$I;
      CREATE POLICY aal2_super_admin_delete_%1$I ON public.%1$I
        AS RESTRICTIVE FOR DELETE TO authenticated
        USING (
          COALESCE(app.current_role()::text, '''') <> ''super_admin''
          OR COALESCE(auth.jwt()->>''aal'', ''aal1'') = ''aal2''
        );
    ', tbl);
  END LOOP;
END $$;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mess_daily_expenditures TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mess_daily_p_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mess_meal_cuts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_meals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mess_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mess_misc_debits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mess_billing_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mess_bills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mess_bill_line_items TO authenticated;

-- Audit triggers
DROP TRIGGER IF EXISTS audit_mess_daily_expenditures ON public.mess_daily_expenditures;
CREATE TRIGGER audit_mess_daily_expenditures AFTER INSERT OR UPDATE OR DELETE ON public.mess_daily_expenditures FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();

DROP TRIGGER IF EXISTS audit_mess_daily_p_rates ON public.mess_daily_p_rates;
CREATE TRIGGER audit_mess_daily_p_rates AFTER INSERT OR UPDATE OR DELETE ON public.mess_daily_p_rates FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();

DROP TRIGGER IF EXISTS audit_mess_meal_cuts ON public.mess_meal_cuts;
CREATE TRIGGER audit_mess_meal_cuts AFTER INSERT OR UPDATE OR DELETE ON public.mess_meal_cuts FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();

DROP TRIGGER IF EXISTS audit_guest_meals ON public.guest_meals;
CREATE TRIGGER audit_guest_meals AFTER INSERT OR UPDATE OR DELETE ON public.guest_meals FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();

DROP TRIGGER IF EXISTS audit_mess_subscriptions ON public.mess_subscriptions;
CREATE TRIGGER audit_mess_subscriptions AFTER INSERT OR UPDATE OR DELETE ON public.mess_subscriptions FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();

DROP TRIGGER IF EXISTS audit_mess_misc_debits ON public.mess_misc_debits;
CREATE TRIGGER audit_mess_misc_debits AFTER INSERT OR UPDATE OR DELETE ON public.mess_misc_debits FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();

DROP TRIGGER IF EXISTS audit_mess_billing_periods ON public.mess_billing_periods;
CREATE TRIGGER audit_mess_billing_periods AFTER INSERT OR UPDATE OR DELETE ON public.mess_billing_periods FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();

DROP TRIGGER IF EXISTS audit_mess_bills ON public.mess_bills;
CREATE TRIGGER audit_mess_bills AFTER INSERT OR UPDATE OR DELETE ON public.mess_bills FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();

DROP TRIGGER IF EXISTS audit_mess_bill_line_items ON public.mess_bill_line_items;
CREATE TRIGGER audit_mess_bill_line_items AFTER INSERT OR UPDATE OR DELETE ON public.mess_bill_line_items FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();
