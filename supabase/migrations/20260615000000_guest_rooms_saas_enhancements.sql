-- Migration: 20260615000000_guest_rooms_saas_enhancements.sql
-- Supports:
-- 1. Guest Classification (Member Guest vs Transit Officer vs Outside Civilian)
-- 2. Sponsoring Host Officer link (for member's parents, family, visitors)
-- 3. Dual Settlement Routing (Direct Payment on Departure vs Transfer to Host Mess Bill)
-- 4. Payment auditing & Folio numbering on room_bills

-- 1. Create Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_category') THEN
    CREATE TYPE public.booking_category AS ENUM (
      'MEMBER_GUEST',
      'TRANSIT_OFFICER',
      'OFFICIAL_DELEGATION',
      'OUTSIDE_CIVILIAN'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'guest_settlement_type') THEN
    CREATE TYPE public.guest_settlement_type AS ENUM (
      'DIRECT_SETTLEMENT',
      'CHARGE_TO_HOST'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'room_bill_payment_status') THEN
    CREATE TYPE public.room_bill_payment_status AS ENUM (
      'draft',
      'paid',
      'transferred_to_mess_bill'
    );
  END IF;
END $$;

-- 2. Alter bookings table
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_category public.booking_category NOT NULL DEFAULT 'MEMBER_GUEST',
  ADD COLUMN IF NOT EXISTS host_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settlement_type public.guest_settlement_type NOT NULL DEFAULT 'DIRECT_SETTLEMENT',
  ADD COLUMN IF NOT EXISTS special_requests TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_host ON public.bookings(host_profile_id);
CREATE INDEX IF NOT EXISTS idx_bookings_category ON public.bookings(booking_category);

-- 3. Alter room_bills table
ALTER TABLE public.room_bills
  ADD COLUMN IF NOT EXISTS settlement_type public.guest_settlement_type NOT NULL DEFAULT 'DIRECT_SETTLEMENT',
  ADD COLUMN IF NOT EXISTS payment_status public.room_bill_payment_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS folio_number TEXT;

CREATE INDEX IF NOT EXISTS idx_room_bills_payment_status ON public.room_bills(payment_status);
CREATE INDEX IF NOT EXISTS idx_room_bills_settlement ON public.room_bills(settlement_type);
