-- Admin: change an order's status (token-gated), + two demo orders
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_order_status(
  p_token    uuid,
  p_order_id uuid,
  p_status   text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not exists (
    select 1 from public.admin_sessions s
    where s.token = p_token and s.expires_at > now()
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if p_status not in ('requested','dispatched','completed','cancelled') then
    raise exception 'invalid status: %', p_status;
  end if;

  update public.orders
    set status = p_status
    where id = p_order_id
    returning * into v_order;

  if not found then
    raise exception 'order not found';
  end if;

  return v_order;
end;
$$;

grant execute on function public.admin_update_order_status(uuid, uuid, text) to anon, authenticated;

-- Two placeholder/demo orders (fixed ids => idempotent re-runs)
insert into public.orders
  (id, created_at, situation, engine_started, litres, location, vehicle,
   severity, price, eta_minutes, lang, status, contact_name, contact_phone)
values
  ('00000000-0000-0000-0000-0000000d0001', now() - interval '2 hours',
   'Diesel in Benzin', 'Kurz angelassen', '15–30 Liter',
   'A5, Ausfahrt 7, Nähe Frankfurt', 'BMW 320d, 2021',
   'medium', 190, 40, 'de', 'dispatched', 'Max Mustermann', '+49 170 1234567'),
  ('00000000-0000-0000-0000-0000000d0002', now() - interval '1 day',
   'Benzin in Diesel', 'Ja, gefahren', 'Mehr als 30 Liter',
   'B27, Tübingen', 'Audi A4 Avant, 2018',
   'high', 230, 30, 'de', 'completed', 'Erika Beispiel', '+49 151 7654321')
on conflict (id) do nothing;
