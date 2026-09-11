-- Run in a new Supabase test project. Membership provisioning is admin-only.
create table public.workspaces(id uuid primary key default gen_random_uuid(), name text not null);
create table public.workspace_members(workspace_id uuid references public.workspaces on delete cascade, user_id uuid references auth.users on delete cascade, primary key(workspace_id,user_id));
create table public.commission_documents(workspace_id uuid references public.workspaces on delete cascade,id uuid not null,revision integer not null default 1,operation_id text not null,document jsonb not null,updated_at timestamptz not null default now(),primary key(workspace_id,id));
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.commission_documents enable row level security;
create policy own_membership on public.workspace_members for select to authenticated using(user_id=(select auth.uid()));
create policy member_workspace on public.workspaces for select to authenticated using(exists(select 1 from public.workspace_members m where m.workspace_id=id and m.user_id=(select auth.uid())));
create policy member_documents on public.commission_documents for all to authenticated using(exists(select 1 from public.workspace_members m where m.workspace_id=commission_documents.workspace_id and m.user_id=(select auth.uid()))) with check(exists(select 1 from public.workspace_members m where m.workspace_id=commission_documents.workspace_id and m.user_id=(select auth.uid())));
grant select on public.workspaces,public.workspace_members to authenticated;
grant select,insert,update on public.commission_documents to authenticated;
create or replace function public.save_commission(p_workspace uuid,p_id uuid,p_expected integer,p_operation text,p_document jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare current_row public.commission_documents;
begin
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=auth.uid()) then raise exception 'Workspace access denied'; end if;
 -- Serialize creates and updates for this document. The operation ID makes retries idempotent.
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text||p_id::text,0));
 select * into current_row from public.commission_documents where workspace_id=p_workspace and id=p_id for update;
 if found then
  if current_row.operation_id=p_operation then return jsonb_build_object('revision',current_row.revision); end if;
  if current_row.revision<>p_expected then return jsonb_build_object('conflict',true,'remote',to_jsonb(current_row)); end if;
  update public.commission_documents set document=p_document,revision=revision+1,operation_id=p_operation,updated_at=now() where workspace_id=p_workspace and id=p_id returning * into current_row;
 else
  if p_expected<>0 then return jsonb_build_object('conflict',true); end if;
  insert into public.commission_documents(workspace_id,id,document,operation_id) values(p_workspace,p_id,p_document,p_operation) returning * into current_row;
 end if;
 return jsonb_build_object('revision',current_row.revision);
end $$;
revoke all on function public.save_commission(uuid,uuid,integer,text,jsonb) from public;
grant execute on function public.save_commission(uuid,uuid,integer,text,jsonb) to authenticated;
