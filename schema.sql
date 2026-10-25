-- =====================================================================
-- Meu Controle Financeiro · esquema PostgreSQL (Supabase)
-- Como usar: Supabase → SQL Editor → New query → cole tudo → Run.
-- Pode rodar mais de uma vez: os comandos são idempotentes.
-- =====================================================================

-- 1) Lançamentos (gastos e receitas) -----------------------------------
create table if not exists public.transacoes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo       text not null check (tipo in ('gasto', 'receita')),
  descricao  text not null check (char_length(descricao) between 1 and 120),
  categoria  text not null default 'Outros',
  valor      numeric(12, 2) not null check (valor > 0),
  data       date not null default current_date,
  fixo       boolean not null default false,   -- conta fixa (aluguel, internet...)
  criado_em  timestamptz not null default now()
);

create index if not exists transacoes_user_data_idx
  on public.transacoes (user_id, data desc);

-- 2) Planejamento do usuário (1 linha por usuário) ---------------------
create table if not exists public.configuracoes (
  user_id           uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  orcamento_mensal  numeric(12, 2) not null default 0 check (orcamento_mensal >= 0),
  contas_fixas      numeric(12, 2) not null default 0 check (contas_fixas >= 0),
  meta_economia     numeric(12, 2) not null default 0 check (meta_economia >= 0),
  atualizado_em     timestamptz not null default now(),
  check (contas_fixas <= orcamento_mensal)
);

-- 3) Segurança: RLS — cada usuário só enxerga e altera as próprias linhas
alter table public.transacoes    enable row level security;
alter table public.configuracoes enable row level security;

drop policy if exists "transacoes_select" on public.transacoes;
drop policy if exists "transacoes_insert" on public.transacoes;
drop policy if exists "transacoes_update" on public.transacoes;
drop policy if exists "transacoes_delete" on public.transacoes;

create policy "transacoes_select" on public.transacoes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "transacoes_insert" on public.transacoes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "transacoes_update" on public.transacoes
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "transacoes_delete" on public.transacoes
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "config_select" on public.configuracoes;
drop policy if exists "config_insert" on public.configuracoes;
drop policy if exists "config_update" on public.configuracoes;
drop policy if exists "config_delete" on public.configuracoes;

create policy "config_select" on public.configuracoes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "config_insert" on public.configuracoes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "config_update" on public.configuracoes
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "config_delete" on public.configuracoes
  for delete to authenticated using (user_id = (select auth.uid()));

-- 4) Tempo real: o dashboard recebe mudanças assim que elas acontecem ---
do $$
begin
  alter publication supabase_realtime add table public.transacoes;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.configuracoes;
exception when duplicate_object then null;
end $$;
