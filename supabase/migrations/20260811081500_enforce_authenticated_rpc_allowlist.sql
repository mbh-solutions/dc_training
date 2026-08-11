do $$
declare
  allowed_rpc_oids oid[] := array[
    'public.account_deletion_status()'::regprocedure::oid,
    'public.account_is_available()'::regprocedure::oid,
    'public.apply_offline_operation(uuid, text, jsonb)'::regprocedure::oid,
    'public.apply_offline_operation(uuid, text, jsonb, uuid)'::regprocedure::oid,
    'public.cancel_account_deletion()'::regprocedure::oid,
    'public.register_editing_device(uuid)'::regprocedure::oid,
    'public.request_account_deletion(uuid)'::regprocedure::oid,
    'public.transfer_editing_device(uuid)'::regprocedure::oid
  ];
  candidate_oid oid;
begin
  for candidate_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.oid <> all (allowed_rpc_oids)
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      candidate_oid::regprocedure
    );
  end loop;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.oid <> all (allowed_rpc_oids)
      and has_function_privilege('authenticated', p.oid, 'execute')
  ) then
    raise exception 'Unexpected authenticated security-definer RPC';
  end if;
end;
$$;
