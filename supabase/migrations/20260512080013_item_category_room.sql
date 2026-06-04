-- Add 'room' to the item_category enum so guest room types can live in
-- the same versioned masters catalog as ration/bar items. Rate represents
-- the nightly tariff; ration_scale is unused for this category.

alter type public.item_category add value if not exists 'room';
