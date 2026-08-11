create or replace function private.resolve_offline_blast_reference(
  p_owner_id uuid,
  p_reference text
)
returns uuid
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  reference_operation_id uuid;
  resolved_blast_id uuid;
begin
  if p_reference like 'local:%' then
    begin
      reference_operation_id := substring(p_reference from 7)::uuid;
    exception when invalid_text_representation then
      raise exception 'Offline lifecycle blast is invalid';
    end;
    select (operation.result ->> 'blast_id')::uuid into resolved_blast_id
    from private.offline_operations operation
    where operation.operation_id = reference_operation_id
      and operation.user_id = p_owner_id
      and operation.kind = 'transition_training_lifecycle'
      and operation.payload ->> 'action' = 'start_new_blast';
    if resolved_blast_id is null then
      raise exception 'Offline lifecycle blast is not synchronized';
    end if;
    return resolved_blast_id;
  end if;
  begin
    return p_reference::uuid;
  exception when invalid_text_representation then
    raise exception 'Offline lifecycle blast is invalid';
  end;
end;
$$;

revoke all on function private.resolve_offline_blast_reference(uuid, text)
from public, anon, authenticated;
