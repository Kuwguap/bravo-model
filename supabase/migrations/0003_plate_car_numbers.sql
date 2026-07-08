-- ============================================================
-- Plate + document-number allocation, matching the real dealer plates.
--   • Plate: NJ = H######, non-NJ = ######V.
--   • Doc number (the 10-digit number printed under "30 Day … Temporary
--     Plate") gets its own counter.
--   • Both counters jump by a random 100–300 per allocation so the sequence
--     looks organic (not +1), controllable from the central dashboard.
-- ============================================================

alter table public.settings
  add column if not exists nj_car_next_number     bigint not null default 6000000000,
  add column if not exists non_nj_car_next_number bigint not null default 6000000000;

-- Return type changes text -> jsonb, so drop first.
drop function if exists public.allocate_plate(boolean);

create function public.allocate_plate(p_is_nj boolean)
returns jsonb
language plpgsql
as $$
declare
  v_plate_n bigint;
  v_car_n   bigint;
  v_prefix  text;
  v_suffix  text;
  v_digits  integer;
  v_plate   text;
begin
  -- random jump of 100..300
  if p_is_nj then
    select nj_plate_next_number, nj_plate_prefix, nj_plate_digits, nj_car_next_number
      into v_plate_n, v_prefix, v_digits, v_car_n
      from public.settings where id = 1 for update;
    v_plate := v_prefix || lpad(v_plate_n::text, v_digits, '0');
    update public.settings set
      nj_plate_next_number = nj_plate_next_number + floor(random() * 201 + 100)::int,
      nj_car_next_number   = nj_car_next_number   + floor(random() * 201 + 100)::int,
      updated_at = now()
    where id = 1;
  else
    select non_nj_plate_next_number, non_nj_plate_suffix, non_nj_plate_digits, non_nj_car_next_number
      into v_plate_n, v_suffix, v_digits, v_car_n
      from public.settings where id = 1 for update;
    v_plate := lpad(v_plate_n::text, v_digits, '0') || v_suffix;
    update public.settings set
      non_nj_plate_next_number = non_nj_plate_next_number + floor(random() * 201 + 100)::int,
      non_nj_car_next_number   = non_nj_car_next_number   + floor(random() * 201 + 100)::int,
      updated_at = now()
    where id = 1;
  end if;

  return jsonb_build_object(
    'plate', v_plate,
    'car',   lpad(v_car_n::text, 10, '0')
  );
end;
$$;
