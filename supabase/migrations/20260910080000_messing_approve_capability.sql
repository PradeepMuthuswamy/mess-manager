-- Phase 3: Food Member register approval capability.
-- ALTER TYPE ... ADD VALUE cannot be referenced in the same transaction.

alter type public.capability add value if not exists 'messing.approve';
