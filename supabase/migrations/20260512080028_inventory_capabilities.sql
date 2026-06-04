-- Per-Unit Inventory (Phase 1) — capability enum values.
--
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that
-- references the new value, so the enum additions live in their own
-- migration (committed before unit_inventory / templates use them).
-- `if not exists` mirrors the guest_rooms precedent and keeps reruns safe.

alter type public.capability add value if not exists 'inventory.read';
alter type public.capability add value if not exists 'inventory.write';
