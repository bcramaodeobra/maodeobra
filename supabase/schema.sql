-- =====================================================================
--  Controle de Mão de Obra — Fábrica de Bordados  (versão 2)
--  Instalação nova: rode este arquivo inteiro no Supabase (SQL Editor > Run)
--  Pode ser rodado de novo sem apagar dados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERFIS (dono e mãos de obra) — ligado ao login do Supabase Auth
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  usuario    text not null unique,
  nome       text not null,
  papel      text not null default 'mao_de_obra' check (papel in ('dono','mao_de_obra')),
  whatsapp   text,
  endereco   text,
  pix        text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create or replace function public.eh_dono()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'dono' and ativo);
$$;

create or replace function public.eh_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;

-- ---------------------------------------------------------------------
-- 2. PRODUTOS e SERVIÇOS (cada produto tem seus serviços, cada serviço seu preço)
-- ---------------------------------------------------------------------
create table if not exists public.produtos (
  id         bigint generated always as identity primary key,
  nome       text not null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table if not exists public.servicos (
  id              bigint generated always as identity primary key,
  produto_id      bigint not null references public.produtos(id) on delete cascade,
  nome            text not null,
  valor_unitario  numeric(10,2) not null check (valor_unitario >= 0),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);
create index if not exists servicos_produto_idx on public.servicos (produto_id);

-- ---------------------------------------------------------------------
-- 3. LOTES (um produto + um serviço enviado para uma mão de obra)
-- ---------------------------------------------------------------------
create table if not exists public.lotes (
  id              bigint generated always as identity primary key,
  mao_de_obra_id  uuid   not null references public.perfis(id),
  produto_id      bigint not null references public.produtos(id),
  servico_id      bigint not null references public.servicos(id),
  quantidade      integer not null check (quantidade > 0),
  valor_unitario  numeric(10,2) not null check (valor_unitario >= 0),  -- congelado no envio
  valor_total     numeric(12,2) generated always as (quantidade * valor_unitario) stored,
  observacoes     text,
  status          text not null default 'aberto' check (status in ('aberto','pronto','cancelado')),
  enviado_em      timestamptz not null default now(),
  finalizado_em   timestamptz
);
create index if not exists lotes_mo_idx on public.lotes (mao_de_obra_id, status);

-- ---------------------------------------------------------------------
-- 4. ENTREGAS (parciais ou "lote pronto") — é o que entra no fechamento
-- ---------------------------------------------------------------------
create table if not exists public.entregas (
  id           bigint generated always as identity primary key,
  lote_id      bigint not null references public.lotes(id) on delete cascade,
  quantidade   integer not null check (quantidade > 0),
  tipo         text not null default 'parcial' check (tipo in ('parcial','pronto')),
  entregue_em  timestamptz not null default now(),
  observacao   text
);
create index if not exists entregas_lote_idx on public.entregas (lote_id);

-- ---------------------------------------------------------------------
-- 5. FECHAMENTOS (mês marcado como pago para cada mão de obra)
-- ---------------------------------------------------------------------
create table if not exists public.fechamentos (
  id              bigint generated always as identity primary key,
  mao_de_obra_id  uuid not null references public.perfis(id),
  mes             date not null check (extract(day from mes) = 1),
  quantidade      integer not null default 0,
  valor_total     numeric(12,2) not null default 0,
  pago_em         timestamptz not null default now(),
  unique (mao_de_obra_id, mes)
);

-- ---------------------------------------------------------------------
-- 6. CONFIGURAÇÕES do dono (link da planilha de backup etc.)
-- ---------------------------------------------------------------------
create table if not exists public.configuracoes (
  chave  text primary key,
  valor  text
);

-- =====================================================================
-- 7. VISÕES (cálculos prontos)
-- =====================================================================
create or replace view public.v_lotes with (security_invoker = true) as
select
  l.*,
  p.nome  as produto_nome,
  s.nome  as servico_nome,
  pf.nome as mao_de_obra_nome,
  coalesce(e.entregue, 0)                                   as qtd_entregue,
  greatest(l.quantidade - coalesce(e.entregue, 0), 0)        as qtd_falta,
  coalesce(e.entregue, 0) * l.valor_unitario                 as valor_entregue,
  case when l.status = 'aberto'
       then greatest(l.quantidade - coalesce(e.entregue, 0), 0) * l.valor_unitario
       else 0 end                                            as valor_aberto
from public.lotes l
join public.produtos p on p.id = l.produto_id
join public.servicos s on s.id = l.servico_id
join public.perfis  pf on pf.id = l.mao_de_obra_id
left join lateral (select sum(quantidade) as entregue from public.entregas where lote_id = l.id) e on true;

create or replace view public.v_entregas with (security_invoker = true) as
select
  e.*,
  l.mao_de_obra_id,
  l.produto_id,
  l.servico_id,
  l.valor_unitario,
  e.quantidade * l.valor_unitario as valor,
  date_trunc('month', e.entregue_em at time zone 'America/Sao_Paulo')::date as mes_ref,
  p.nome  as produto_nome,
  s.nome  as servico_nome,
  pf.nome as mao_de_obra_nome
from public.entregas e
join public.lotes l    on l.id = e.lote_id
join public.produtos p on p.id = l.produto_id
join public.servicos s on s.id = l.servico_id
join public.perfis pf  on pf.id = l.mao_de_obra_id
where l.status <> 'cancelado';

-- Fechamento detalhado: mão de obra × mês × produto × serviço
create or replace view public.v_fechamento with (security_invoker = true) as
select
  mao_de_obra_id, mao_de_obra_nome, mes_ref as mes,
  produto_nome, servico_nome, valor_unitario,
  sum(quantidade) as quantidade,
  sum(valor)      as valor
from public.v_entregas
group by mao_de_obra_id, mao_de_obra_nome, mes_ref, produto_nome, servico_nome, valor_unitario;

-- Total do mês por mão de obra, com situação de pagamento
create or replace view public.v_resumo_mensal with (security_invoker = true) as
select
  ve.mao_de_obra_id, ve.mao_de_obra_nome, ve.mes_ref as mes,
  sum(ve.quantidade) as quantidade,
  sum(ve.valor)      as valor_total,
  f.id as fechamento_id, f.pago_em
from public.v_entregas ve
left join public.fechamentos f on f.mao_de_obra_id = ve.mao_de_obra_id and f.mes = ve.mes_ref
group by ve.mao_de_obra_id, ve.mao_de_obra_nome, ve.mes_ref, f.id, f.pago_em;

-- =====================================================================
-- 8. REGRAS (gatilhos)
-- =====================================================================
-- Mês já pago fica travado
create or replace function public.trava_mes_pago()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_mo uuid; v_quando timestamptz; v_mes date;
begin
  v_quando := case when tg_op = 'INSERT' then new.entregue_em else old.entregue_em end;
  select mao_de_obra_id into v_mo from lotes where id = coalesce(new.lote_id, old.lote_id);
  v_mes := date_trunc('month', v_quando at time zone 'America/Sao_Paulo')::date;
  if exists (select 1 from fechamentos where mao_de_obra_id = v_mo and mes = v_mes) then
    raise exception 'Este mês já foi fechado e pago para esta mão de obra. Reabra o fechamento para alterar.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_trava_mes_pago on public.entregas;
create trigger trg_trava_mes_pago before insert or update or delete on public.entregas
for each row execute function public.trava_mes_pago();

-- Lote fica "pronto" quando tudo foi entregue (e volta a "aberto" se uma entrega for desfeita)
create or replace function public.atualiza_status_lote()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lote bigint; v_qtd int; v_ent int;
begin
  v_lote := coalesce(new.lote_id, old.lote_id);
  select quantidade into v_qtd from lotes where id = v_lote;
  select coalesce(sum(quantidade), 0) into v_ent from entregas where lote_id = v_lote;
  if v_ent >= v_qtd then
    update lotes set status = 'pronto', finalizado_em = coalesce(finalizado_em, now())
     where id = v_lote and status = 'aberto';
  else
    update lotes set status = 'aberto', finalizado_em = null
     where id = v_lote and status = 'pronto';
  end if;
  return null;
end $$;

drop trigger if exists trg_status_lote on public.entregas;
create trigger trg_status_lote after insert or update or delete on public.entregas
for each row execute function public.atualiza_status_lote();

-- =====================================================================
-- 9. AÇÕES (chamadas pelo site — só o dono)
-- =====================================================================
create or replace function public.enviar_lote(
  p_mao_de_obra uuid, p_servico bigint, p_quantidade int,
  p_observacoes text default null, p_valor_unitario numeric default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_s servicos%rowtype; v_id bigint;
begin
  if not eh_dono() then raise exception 'Apenas o dono pode enviar lotes.'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Informe a quantidade.'; end if;
  select * into v_s from servicos where id = p_servico;
  if not found then raise exception 'Serviço não encontrado.'; end if;
  if not exists (select 1 from perfis where id = p_mao_de_obra and papel = 'mao_de_obra') then
    raise exception 'Mão de obra não encontrada.';
  end if;

  insert into lotes (mao_de_obra_id, produto_id, servico_id, quantidade, valor_unitario, observacoes)
  values (p_mao_de_obra, v_s.produto_id, v_s.id, p_quantidade,
          coalesce(p_valor_unitario, v_s.valor_unitario), nullif(trim(p_observacoes), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Entrega parcial (com quantidade)
create or replace function public.registrar_entrega(p_lote bigint, p_quantidade int, p_observacao text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_falta int; v_status text; v_id bigint;
begin
  if not eh_dono() then raise exception 'Apenas o dono pode registrar entregas.'; end if;
  select status, qtd_falta into v_status, v_falta from v_lotes where id = p_lote;
  if not found then raise exception 'Lote não encontrado.'; end if;
  if v_status <> 'aberto' then raise exception 'Este lote já foi finalizado.'; end if;
  if p_quantidade is null or p_quantidade <= 0 or p_quantidade > v_falta then
    raise exception 'Quantidade inválida. Faltam % peças neste lote.', v_falta;
  end if;
  insert into entregas (lote_id, quantidade, tipo, observacao)
  values (p_lote, p_quantidade, case when p_quantidade = v_falta then 'pronto' else 'parcial' end, p_observacao)
  returning id into v_id;
  return v_id;
end $$;

-- LOTE PRONTO: entrega tudo o que falta
create or replace function public.lote_pronto(p_lote bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_falta int; v_status text;
begin
  if not eh_dono() then raise exception 'Apenas o dono pode finalizar lotes.'; end if;
  select status, qtd_falta into v_status, v_falta from v_lotes where id = p_lote;
  if not found then raise exception 'Lote não encontrado.'; end if;
  if v_status <> 'aberto' then raise exception 'Este lote já foi finalizado.'; end if;
  if v_falta > 0 then
    insert into entregas (lote_id, quantidade, tipo) values (p_lote, v_falta, 'pronto');
  end if;
  update lotes set status = 'pronto', finalizado_em = coalesce(finalizado_em, now()) where id = p_lote;
end $$;

-- Desfazer uma entrega lançada por engano
create or replace function public.desfazer_entrega(p_entrega bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_dono() then raise exception 'Apenas o dono.'; end if;
  delete from entregas where id = p_entrega;
  if not found then raise exception 'Entrega não encontrada.'; end if;
end $$;

-- Cancelar lote (só se nada foi entregue)
create or replace function public.cancelar_lote(p_lote bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_dono() then raise exception 'Apenas o dono.'; end if;
  if exists (select 1 from entregas where lote_id = p_lote) then
    raise exception 'Este lote já tem entregas. Desfaça as entregas antes de cancelar.';
  end if;
  update lotes set status = 'cancelado' where id = p_lote and status = 'aberto';
  if not found then raise exception 'Lote não encontrado ou já finalizado.'; end if;
end $$;

create or replace function public.fechar_mes(p_mao_de_obra uuid, p_mes date)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_mes date := date_trunc('month', p_mes)::date; v_qtd int; v_valor numeric; v_id bigint;
begin
  if not eh_dono() then raise exception 'Apenas o dono pode fechar o mês.'; end if;
  select coalesce(sum(quantidade),0), coalesce(sum(valor_total),0) into v_qtd, v_valor
    from v_resumo_mensal where mao_de_obra_id = p_mao_de_obra and mes = v_mes;
  insert into fechamentos (mao_de_obra_id, mes, quantidade, valor_total)
  values (p_mao_de_obra, v_mes, v_qtd, v_valor) returning id into v_id;
  return v_id;
end $$;

create or replace function public.reabrir_mes(p_fechamento bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_dono() then raise exception 'Apenas o dono.'; end if;
  delete from fechamentos where id = p_fechamento;
end $$;

-- =====================================================================
-- 10. SEGURANÇA (RLS) — cada mão de obra só vê o que é dela
-- =====================================================================
alter table public.perfis        enable row level security;
alter table public.produtos      enable row level security;
alter table public.servicos      enable row level security;
alter table public.lotes         enable row level security;
alter table public.entregas      enable row level security;
alter table public.fechamentos   enable row level security;
alter table public.configuracoes enable row level security;

drop policy if exists perfis_dono on public.perfis;
create policy perfis_dono on public.perfis for all to authenticated using (eh_dono()) with check (eh_dono());
drop policy if exists perfis_proprio on public.perfis;
create policy perfis_proprio on public.perfis for select to authenticated using (id = auth.uid());

do $$ declare t text; begin
  foreach t in array array['produtos','servicos'] loop
    execute format('drop policy if exists %1$s_dono on public.%1$s', t);
    execute format('create policy %1$s_dono on public.%1$s for all to authenticated using (eh_dono()) with check (eh_dono())', t);
    execute format('drop policy if exists %1$s_leitura on public.%1$s', t);
    execute format('create policy %1$s_leitura on public.%1$s for select to authenticated using (eh_ativo())', t);
  end loop;
end $$;

drop policy if exists lotes_dono on public.lotes;
create policy lotes_dono on public.lotes for all to authenticated using (eh_dono()) with check (eh_dono());
drop policy if exists lotes_mo on public.lotes;
create policy lotes_mo on public.lotes for select to authenticated using (mao_de_obra_id = auth.uid() and eh_ativo());

drop policy if exists ent_dono on public.entregas;
create policy ent_dono on public.entregas for all to authenticated using (eh_dono()) with check (eh_dono());
drop policy if exists ent_mo on public.entregas;
create policy ent_mo on public.entregas for select to authenticated
  using (exists (select 1 from public.lotes l where l.id = lote_id and l.mao_de_obra_id = auth.uid()));

drop policy if exists fech_dono on public.fechamentos;
create policy fech_dono on public.fechamentos for all to authenticated using (eh_dono()) with check (eh_dono());
drop policy if exists fech_mo on public.fechamentos;
create policy fech_mo on public.fechamentos for select to authenticated using (mao_de_obra_id = auth.uid());

drop policy if exists conf_dono on public.configuracoes;
create policy conf_dono on public.configuracoes for all to authenticated using (eh_dono()) with check (eh_dono());

-- =====================================================================
-- 11. PERMISSÕES DE ACESSO (projetos novos do Supabase não liberam sozinhos;
--     a proteção linha a linha continua sendo feita pelo RLS acima)
-- =====================================================================
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
