begin;

alter table public.credit_contracts
  add column if not exists required_initial numeric(14, 2) not null default 0;

update public.credit_contracts
set required_initial = coalesce(initial_payment, 0)
where required_initial = 0;

drop policy if exists credit_contracts_tenant_select on public.credit_contracts;

create policy credit_contracts_tenant_select
on public.credit_contracts
for select
to authenticated
using (
  public.is_tenant_member(tenant_id, auth.uid())
  or private.is_platform_admin(auth.uid())
);

commit;

notify pgrst, 'reload schema';
