update auth.users as u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'role', p.role,
    'first_name', p.first_name,
    'last_name', p.last_name
  )
from public.profiles as p
where p.id = u.id;
