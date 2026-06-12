-- 1. Drop check constraint on profiles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_unit_required;

-- 2. Rename enum value 'admin' to 'super_admin' in public.user_role
ALTER TYPE public.user_role RENAME VALUE 'admin' TO 'super_admin';

-- 3. Add the new roles
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'mess_secretary';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'mess_havildar';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'bar_nco';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'property_nco';

-- 4. Recreate profile check constraint
ALTER TABLE public.profiles ADD CONSTRAINT profiles_unit_required CHECK (role = 'super_admin' OR unit_id IS NOT NULL);
