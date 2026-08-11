create or replace function private.require_account_available(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then raise exception 'Authentication required'; end if;
  if not private.account_is_available(p_user_id) then
    raise exception 'Account is unavailable during deletion recovery';
  end if;
end;
$$;

revoke all on function private.require_account_available(uuid)
from public, anon, authenticated;

alter function public.register_editing_device(uuid) set schema private;
alter function public.transfer_editing_device(uuid) set schema private;
alter function public.apply_offline_operation(uuid, text, jsonb) set schema private;
alter function public.apply_offline_operation(uuid, text, jsonb, uuid) set schema private;

revoke all on function private.register_editing_device(uuid)
from public, anon, authenticated;
revoke all on function private.transfer_editing_device(uuid)
from public, anon, authenticated;
revoke all on function private.apply_offline_operation(uuid, text, jsonb)
from public, anon, authenticated;
revoke all on function private.apply_offline_operation(uuid, text, jsonb, uuid)
from public, anon, authenticated;

create or replace function public.register_editing_device(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_account_available((select auth.uid()));
  return private.register_editing_device(p_device_id);
end;
$$;

create or replace function public.transfer_editing_device(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_account_available((select auth.uid()));
  return private.transfer_editing_device(p_device_id);
end;
$$;

create or replace function public.apply_offline_operation(
  p_operation_id uuid,
  p_kind text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_account_available((select auth.uid()));
  return private.apply_offline_operation(p_operation_id, p_kind, p_payload);
end;
$$;

create or replace function public.apply_offline_operation(
  p_operation_id uuid,
  p_kind text,
  p_payload jsonb,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_account_available((select auth.uid()));
  return private.apply_offline_operation(
    p_operation_id,
    p_kind,
    p_payload,
    p_device_id
  );
end;
$$;

revoke all on function public.register_editing_device(uuid) from public, anon;
grant execute on function public.register_editing_device(uuid) to authenticated;
revoke all on function public.transfer_editing_device(uuid) from public, anon;
grant execute on function public.transfer_editing_device(uuid) to authenticated;
revoke all on function public.apply_offline_operation(uuid, text, jsonb)
from public, anon;
grant execute on function public.apply_offline_operation(uuid, text, jsonb)
to authenticated;
revoke all on function public.apply_offline_operation(uuid, text, jsonb, uuid)
from public, anon;
grant execute on function public.apply_offline_operation(uuid, text, jsonb, uuid)
to authenticated;
