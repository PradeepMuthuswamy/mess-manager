-- Seed standard Indian Army ration items (global, unit_id is null) and
-- sample (rank x terrain) scales per existing unit.
-- Idempotent: skips items / scales / scale-items that already exist.

-- ------------------------------------------------------------------
-- 1. Global ration items (unit_id null = visible to every unit)
-- ------------------------------------------------------------------
do $$
declare
  r record;
  v_item_id uuid;
  v_has_products boolean;
begin
  select exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'products'
  ) into v_has_products;

  for r in
    select * from (values
      -- name, uom, indicative_rate
      ('Atta',                'kg'::public.uom,     45.00),
      ('Rice',                'kg'::public.uom,     55.00),
      ('Dal',                 'kg'::public.uom,    140.00),
      ('Sugar',               'kg'::public.uom,     45.00),
      ('Salt',                'kg'::public.uom,     22.00),
      ('Tea',                 'kg'::public.uom,    420.00),
      ('Coffee',              'kg'::public.uom,    620.00),
      ('Cooking Oil',         'l'::public.uom,     180.00),
      ('LPG',                 'kg'::public.uom,    110.00),
      ('Onion',               'kg'::public.uom,     35.00),
      ('Potato',              'kg'::public.uom,     30.00),
      ('Vegetables (Fresh)',  'kg'::public.uom,     60.00),
      ('Fruit (Fresh)',       'kg'::public.uom,    120.00),
      ('Egg',                 'piece'::public.uom,   8.00),
      ('Meat (Dressed)',      'kg'::public.uom,    420.00),
      ('Fowl (Alive)',        'kg'::public.uom,    280.00),
      ('Milk (Fresh)',        'l'::public.uom,      60.00),
      ('Milk Powder',         'kg'::public.uom,    520.00),
      ('Cheese',              'kg'::public.uom,    480.00),
      ('Butter',              'kg'::public.uom,    540.00),
      ('Margarine (MOH)',     'kg'::public.uom,    260.00),
      ('Suji',                'kg'::public.uom,     55.00),
      ('Maida',               'kg'::public.uom,     50.00),
      ('Bread',               'kg'::public.uom,     60.00),
      ('Cornflakes',          'kg'::public.uom,    420.00),
      ('Jam',                 'kg'::public.uom,    260.00),
      ('Condiments',          'kg'::public.uom,    320.00),
      ('Dalia',               'kg'::public.uom,     70.00),
      ('Firewood',            'kg'::public.uom,     15.00),
      ('Raisin (Brown)',      'kg'::public.uom,    420.00),
      ('Tetra Milk',          'l'::public.uom,      75.00)
    ) as t(name, uom, rate)
  loop
    if v_has_products then
      select id into v_item_id
        from public.products
       where unit_id is null
         and category_id = '00000000-0000-0000-0000-000000000005'::uuid
         and lower(name) = lower(r.name);

      if v_item_id is null then
        insert into public.products (unit_id, category_id, name)
        values (null, '00000000-0000-0000-0000-000000000005'::uuid, r.name)
        returning id into v_item_id;

        insert into public.product_variants (product_id, unit_value, unit_type, package_type)
        values (
          v_item_id,
          1.000,
          case r.uom
            when 'kg' then 'KG'::public.unit_type
            when 'g' then 'GRAM'::public.unit_type
            when 'l' then 'LITRE'::public.unit_type
            when 'ml' then 'ML'::public.unit_type
            else 'PIECE'::public.unit_type
          end,
          'LOOSE'::public.package_type
        );
      end if;
    else
      select id into v_item_id
        from public.items
       where unit_id is null
         and category = 'ration'
         and lower(name) = lower(r.name);

      if v_item_id is null then
        insert into public.items (unit_id, category, name, uom)
        values (null, 'ration', r.name, r.uom)
        returning id into v_item_id;

        perform public.set_item_rate(v_item_id, r.rate, null, 'Seeded from standard ration scale.');
      end if;
    end if;
  end loop;
end$$;

-- ------------------------------------------------------------------
-- 2. For each existing unit, create four (rank x terrain) scales
--    and seed a representative subset of item entitlements.
-- ------------------------------------------------------------------
do $$
declare
  u             record;
  scale_def     record;
  v_scale_id    uuid;
  ent           record;
  v_item_id     uuid;
  v_qty         numeric;
  v_multiplier  numeric;
  v_uom         public.uom;
  v_has_products boolean;
begin
  select exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'products'
  ) into v_has_products;

  for u in select id, name from public.units loop

    for scale_def in
      select * from (values
        ('officer'::public.ration_class, 'plains'::public.ration_terrain,        'Officers — Plains'),
        ('officer'::public.ration_class, 'high_altitude'::public.ration_terrain, 'Officers — High Altitude'),
        ('jco'::public.ration_class,     'plains'::public.ration_terrain,        'JCOs — Plains'),
        ('or'::public.ration_class,      'plains'::public.ration_terrain,        'OR — Plains')
      ) as t(rank_class, terrain, label)
    loop
      select id into v_scale_id
        from public.ration_scales
       where unit_id = u.id
         and rank_class = scale_def.rank_class
         and terrain    = scale_def.terrain;

      if v_scale_id is null then
        insert into public.ration_scales (unit_id, name, rank_class, terrain, description)
        values (u.id, scale_def.label, scale_def.rank_class, scale_def.terrain,
                'Seeded from standard ration scale.')
        returning id into v_scale_id;
      end if;

      -- High altitude gets a 25% bump on plains quantities (rough field-service uplift).
      v_multiplier := case scale_def.terrain when 'high_altitude' then 1.25 else 1.00 end;

      for ent in
        select * from (values
          -- item_name,            officer_qty, jco_or_qty, qty_uom
          ('Atta',                 0.230,       0.620,       'kg'::public.uom),
          ('Rice',                 0.220,       0.400,       'kg'::public.uom),
          ('Dal',                  0.040,       0.090,       'kg'::public.uom),
          ('Sugar',                0.090,       0.090,       'kg'::public.uom),
          ('Tea',                  0.009,       0.009,       'kg'::public.uom),
          ('Salt',                 0.020,       0.020,       'kg'::public.uom),
          ('Cooking Oil',          0.020,       0.040,       'l'::public.uom),
          ('Onion',                0.060,       0.060,       'kg'::public.uom),
          ('Potato',               0.110,       0.116,       'kg'::public.uom),
          ('Vegetables (Fresh)',   0.200,       0.170,       'kg'::public.uom),
          ('Fruit (Fresh)',        0.200,       0.290,       'kg'::public.uom),
          ('Egg',                  2.000,       2.000,       'piece'::public.uom),
          ('Meat (Dressed)',       0.180,       0.180,       'kg'::public.uom),
          ('Milk (Fresh)',         0.750,       0.850,       'l'::public.uom),
          ('Margarine (MOH)',      0.090,       0.450,       'kg'::public.uom),
          ('LPG',                  0.060,       0.125,       'kg'::public.uom)
        ) as t(item_name, officer_qty, jco_or_qty, qty_uom)
      loop
        if v_has_products then
          select pv.id into v_item_id
            from public.product_variants pv
            join public.products p on p.id = pv.product_id
           where p.unit_id is null
             and p.category_id = '00000000-0000-0000-0000-000000000005'::uuid
             and lower(p.name) = lower(ent.item_name)
           limit 1;
        else
          select id into v_item_id
            from public.items
           where unit_id is null
             and category = 'ration'
             and lower(name) = lower(ent.item_name);
        end if;

        if v_item_id is null then
          continue;
        end if;

        v_qty := case scale_def.rank_class
                   when 'officer' then ent.officer_qty
                   else                ent.jco_or_qty
                 end * v_multiplier;
        v_uom := ent.qty_uom;

        -- Skip if already authorised (open row exists)
        if v_has_products then
          if not exists (
            select 1 from public.ration_scale_item_versions
             where scale_id = v_scale_id and variant_id = v_item_id and valid_to is null
          ) then
            perform public.set_ration_scale_item(v_scale_id, v_item_id, v_qty, v_uom,
                                                 'Seeded from standard ration scale.');
          end if;
        else
          if not exists (
            select 1 from public.ration_scale_item_versions
             where scale_id = v_scale_id and item_id = v_item_id and valid_to is null
          ) then
            perform public.set_ration_scale_item(v_scale_id, v_item_id, v_qty, v_uom,
                                                 'Seeded from standard ration scale.');
          end if;
        end if;
      end loop;
    end loop;
  end loop;
end$$;
