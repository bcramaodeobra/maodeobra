-- =====================================================================
--  Controle de Mão de Obra — Fábrica de Bordados  (versão 5)
--  Instalação nova: rode este arquivo inteiro no Supabase (SQL Editor > Run)
--  Pode ser rodado de novo sem apagar dados (é assim que se atualiza).
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

-- Forma de pagamento de cada mão de obra
alter table public.perfis add column if not exists frequencia_pagamento text not null default 'mensal';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'perfis_frequencia_chk') then
    alter table public.perfis add constraint perfis_frequencia_chk check (frequencia_pagamento in ('semanal','quinzenal','mensal'));
  end if;
end $$;

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
-- valor_unitario = o que o dono PAGA à mão de obra; valor_cliente = o que a EMPRESA paga ao dono
alter table public.servicos add column if not exists valor_cliente numeric(10,2) check (valor_cliente >= 0);

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
-- 5. PAGAMENTOS (período pago para cada mão de obra: semana, quinzena ou mês)
-- ---------------------------------------------------------------------
create table if not exists public.pagamentos (
  id              bigint generated always as identity primary key,
  mao_de_obra_id  uuid not null references public.perfis(id),
  tipo            text not null default 'mensal' check (tipo in ('semanal','quinzenal','mensal')),
  inicio          date not null,
  fim             date not null check (fim >= inicio),
  quantidade      integer not null default 0,
  valor_total     numeric(12,2) not null default 0,
  pago_em         timestamptz not null default now()
);
create index if not exists pagamentos_mo_idx on public.pagamentos (mao_de_obra_id, inicio);

-- Cada entrega paga aponta para o pagamento que a quitou
alter table public.entregas add column if not exists pagamento_id bigint references public.pagamentos(id) on delete set null;
create index if not exists entregas_pag_idx on public.entregas (pagamento_id);

-- ---------------------------------------------------------------------
-- 6. CONFIGURAÇÕES do dono (link da planilha de backup etc.)
-- ---------------------------------------------------------------------
create table if not exists public.configuracoes (
  chave  text primary key,
  valor  text
);


-- ---------------------------------------------------------------------
-- 6b. MINHA MÃO DE OBRA — empresas e entradas de serviço
-- ---------------------------------------------------------------------
create table if not exists public.empresas (
  id         bigint generated always as identity primary key,
  nome       text not null,
  whatsapp   text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table if not exists public.entradas (
  id              bigint generated always as identity primary key,
  empresa_id      bigint not null references public.empresas(id),
  produto_id      bigint not null references public.produtos(id),
  servico_id      bigint not null references public.servicos(id),
  quantidade      integer not null check (quantidade > 0),
  valor_unitario  numeric(10,2) not null check (valor_unitario >= 0),  -- o que a empresa paga por peça
  valor_total     numeric(12,2) generated always as (quantidade * valor_unitario) stored,
  data            date not null default (now() at time zone 'America/Sao_Paulo')::date,
  observacoes     text,
  criado_em       timestamptz not null default now()
);
create index if not exists entradas_data_idx on public.entradas (data);

-- ---------------------------------------------------------------------
-- 6c. NOTAS DE PAGAMENTO (enviadas pelo dono para a mão de obra)
-- ---------------------------------------------------------------------
create table if not exists public.notas (
  id              bigint generated always as identity primary key,
  mao_de_obra_id  uuid not null references public.perfis(id),
  mes             date,
  quantidade      integer not null default 0,
  valor_total     numeric(12,2) not null default 0,
  itens           jsonb not null default '[]'::jsonb,
  mensagem        text,
  enviada_em      timestamptz not null default now(),
  lida_em         timestamptz
);
create index if not exists notas_mo_idx on public.notas (mao_de_obra_id, enviada_em desc);
alter table public.notas add column if not exists inicio date;
alter table public.notas add column if not exists fim date;
alter table public.notas add column if not exists tipo text;
alter table public.notas alter column mes drop not null;
do $$ begin
  alter table public.notas drop constraint if exists notas_mes_check;
end $$;
update public.notas set inicio = mes, fim = (mes + interval '1 month - 1 day')::date, tipo = 'mensal'
 where inicio is null and mes is not null;

-- ---------------------------------------------------------------------
-- 6d. MIGRAÇÃO da versão 3: "fechamentos" (por mês) viram "pagamentos"
-- ---------------------------------------------------------------------
do $$
declare f record; v_id bigint;
begin
  if to_regclass('public.fechamentos') is not null then
    alter table public.entregas disable trigger user;
    for f in select * from public.fechamentos loop
      insert into public.pagamentos (mao_de_obra_id, tipo, inicio, fim, quantidade, valor_total, pago_em)
      values (f.mao_de_obra_id, 'mensal', f.mes, (f.mes + interval '1 month - 1 day')::date, f.quantidade, f.valor_total, f.pago_em)
      returning id into v_id;
      update public.entregas e set pagamento_id = v_id
        from public.lotes l
       where l.id = e.lote_id and l.mao_de_obra_id = f.mao_de_obra_id and e.pagamento_id is null
         and date_trunc('month', e.entregue_em at time zone 'America/Sao_Paulo')::date = f.mes;
    end loop;
    alter table public.entregas enable trigger user;
    drop table public.fechamentos cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6e. AVISOS da mão de obra ("terminei este lote")
-- ---------------------------------------------------------------------
create table if not exists public.avisos (
  id              bigint generated always as identity primary key,
  lote_id         bigint not null references public.lotes(id) on delete cascade,
  mao_de_obra_id  uuid not null references public.perfis(id),
  mensagem        text,
  criado_em       timestamptz not null default now(),
  visto_em        timestamptz
);
create index if not exists avisos_pend_idx on public.avisos (lote_id) where visto_em is null;

-- =====================================================================
-- 7. VISÕES (cálculos prontos) — recriadas a cada atualização
-- =====================================================================
drop view if exists public.v_resumo_mensal, public.v_fechamento, public.v_entregas, public.v_lotes,
  public.v_entradas, public.v_distribuicao cascade;

create view public.v_lotes with (security_invoker = true) as
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
       else 0 end                                            as valor_aberto,
  (select max(a.criado_em) from public.avisos a where a.lote_id = l.id and a.visto_em is null) as aviso_em,
  (select a.mensagem from public.avisos a where a.lote_id = l.id and a.visto_em is null order by a.criado_em desc limit 1) as aviso_mensagem
from public.lotes l
join public.produtos p on p.id = l.produto_id
join public.servicos s on s.id = l.servico_id
join public.perfis  pf on pf.id = l.mao_de_obra_id
left join lateral (select sum(quantidade) as entregue from public.entregas where lote_id = l.id) e on true;

create view public.v_entregas with (security_invoker = true) as
select
  e.*,
  l.mao_de_obra_id,
  l.produto_id,
  l.servico_id,
  l.valor_unitario,
  e.quantidade * l.valor_unitario as valor,
  (e.entregue_em at time zone 'America/Sao_Paulo')::date as dia,
  date_trunc('month', e.entregue_em at time zone 'America/Sao_Paulo')::date as mes_ref,
  (e.pagamento_id is not null) as pago,
  p.nome  as produto_nome,
  s.nome  as servico_nome,
  pf.nome as mao_de_obra_nome
from public.entregas e
join public.lotes l    on l.id = e.lote_id
join public.produtos p on p.id = l.produto_id
join public.servicos s on s.id = l.servico_id
join public.perfis pf  on pf.id = l.mao_de_obra_id
where l.status <> 'cancelado';

-- Fechamento detalhado por mês: mão de obra × produto × serviço
create view public.v_fechamento with (security_invoker = true) as
select
  mao_de_obra_id, mao_de_obra_nome, mes_ref as mes,
  produto_nome, servico_nome, valor_unitario,
  sum(quantidade) as quantidade,
  sum(valor)      as valor,
  sum(valor) filter (where pago) as valor_pago
from public.v_entregas
group by mao_de_obra_id, mao_de_obra_nome, mes_ref, produto_nome, servico_nome, valor_unitario;

-- Total do mês por mão de obra
create view public.v_resumo_mensal with (security_invoker = true) as
select
  mao_de_obra_id, mao_de_obra_nome, mes_ref as mes,
  sum(quantidade) as quantidade,
  sum(valor)      as valor_total,
  coalesce(sum(valor) filter (where pago), 0) as valor_pago
from public.v_entregas
group by mao_de_obra_id, mao_de_obra_nome, mes_ref;

-- Entradas com nomes
create view public.v_entradas with (security_invoker = true) as
select en.*, em.nome as empresa_nome, p.nome as produto_nome, s.nome as servico_nome,
       s.valor_unitario as valor_mao_de_obra,
       date_trunc('month', en.data)::date as mes_ref
from public.entradas en
join public.empresas em on em.id = en.empresa_id
join public.produtos p  on p.id = en.produto_id
join public.servicos s  on s.id = en.servico_id;

-- Quanto entrou x quanto já foi distribuído, por produto + serviço
create view public.v_distribuicao with (security_invoker = true) as
with ent as (select servico_id, sum(quantidade) q from public.entradas group by servico_id),
     dis as (select servico_id, sum(quantidade) q from public.lotes where status <> 'cancelado' group by servico_id)
select s.id as servico_id, p.nome as produto_nome, s.nome as servico_nome,
       coalesce(ent.q, 0) as entrou,
       coalesce(dis.q, 0) as distribuido,
       coalesce(ent.q, 0) - coalesce(dis.q, 0) as falta
from public.servicos s
join public.produtos p on p.id = s.produto_id
left join ent on ent.servico_id = s.id
left join dis on dis.servico_id = s.id
where coalesce(ent.q, 0) > 0 or coalesce(dis.q, 0) > 0;

-- =====================================================================
-- 8. REGRAS (gatilhos)
-- =====================================================================
-- Entrega já paga fica travada (desfaça o pagamento antes de alterar)
create or replace function public.trava_mes_pago()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and old.pagamento_id is not null then
    raise exception 'Esta entrega já foi paga. Desfaça o pagamento antes de alterar.';
  end if;
  if tg_op = 'UPDATE' and old.pagamento_id is not null and new.pagamento_id is not distinct from old.pagamento_id
     and (new.quantidade <> old.quantidade or new.lote_id <> old.lote_id) then
    raise exception 'Esta entrega já foi paga. Desfaça o pagamento antes de alterar.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_trava_mes_pago on public.entregas;
create trigger trg_trava_mes_pago before update or delete on public.entregas
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
    update avisos set visto_em = now() where lote_id = v_lote and visto_em is null;
  else
    update lotes set status = 'aberto', finalizado_em = null
     where id = v_lote and status = 'pronto';
  end if;
  return null;
end $$;

drop trigger if exists trg_status_lote on public.entregas;
create trigger trg_status_lote after insert or update of quantidade, lote_id or delete on public.entregas
for each row execute function public.atualiza_status_lote();

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
  update avisos set visto_em = now() where lote_id = p_lote and visto_em is null;
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

drop function if exists public.fechar_mes(uuid, date), public.reabrir_mes(bigint),
  public.enviar_nota(uuid, date, text);

-- Marca como pago tudo o que a mão de obra finalizou no período e ainda não foi pago
create or replace function public.pagar_periodo(p_mao_de_obra uuid, p_inicio date, p_fim date, p_tipo text default 'mensal')
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_qtd int; v_valor numeric;
begin
  if not eh_dono() then raise exception 'Apenas o dono pode registrar pagamentos.'; end if;
  select coalesce(sum(quantidade), 0), coalesce(sum(valor), 0) into v_qtd, v_valor
    from v_entregas where mao_de_obra_id = p_mao_de_obra and not pago and dia between p_inicio and p_fim;
  if v_qtd = 0 then raise exception 'Não há nada a pagar neste período.'; end if;
  insert into pagamentos (mao_de_obra_id, tipo, inicio, fim, quantidade, valor_total)
  values (p_mao_de_obra, coalesce(p_tipo, 'mensal'), p_inicio, p_fim, v_qtd, v_valor) returning id into v_id;
  update entregas e set pagamento_id = v_id
    from lotes l
   where l.id = e.lote_id and l.mao_de_obra_id = p_mao_de_obra and l.status <> 'cancelado'
     and e.pagamento_id is null
     and (e.entregue_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;
  return v_id;
end $$;

-- Desfaz um pagamento (as entregas voltam para "a pagar")
create or replace function public.desfazer_pagamento(p_pagamento bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_dono() then raise exception 'Apenas o dono.'; end if;
  update entregas set pagamento_id = null where pagamento_id = p_pagamento;
  delete from pagamentos where id = p_pagamento;
end $$;

-- Nota de pagamento do período (aviso para a mão de obra; não marca como pago)
create or replace function public.enviar_nota(p_mao_de_obra uuid, p_inicio date, p_fim date,
  p_tipo text default 'mensal', p_mensagem text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_itens jsonb; v_qtd int; v_valor numeric; v_id bigint;
begin
  if not eh_dono() then raise exception 'Apenas o dono pode enviar notas.'; end if;
  with g as (
    select produto_nome, servico_nome, valor_unitario, sum(quantidade) quantidade, sum(valor) valor
      from v_entregas where mao_de_obra_id = p_mao_de_obra and dia between p_inicio and p_fim
     group by produto_nome, servico_nome, valor_unitario)
  select coalesce(jsonb_agg(jsonb_build_object('produto', produto_nome, 'servico', servico_nome,
           'quantidade', quantidade, 'valor_unitario', valor_unitario, 'valor', valor)
           order by produto_nome, servico_nome), '[]'::jsonb),
         coalesce(sum(quantidade), 0), coalesce(sum(valor), 0)
    into v_itens, v_qtd, v_valor from g;
  if v_qtd = 0 then raise exception 'Esta mão de obra não tem nada finalizado neste período.'; end if;
  insert into notas (mao_de_obra_id, mes, inicio, fim, tipo, quantidade, valor_total, itens, mensagem)
  values (p_mao_de_obra, date_trunc('month', p_inicio)::date, p_inicio, p_fim, coalesce(p_tipo, 'mensal'),
          v_qtd, v_valor, v_itens, nullif(trim(p_mensagem), ''))
  returning id into v_id;
  return v_id;
end $$;

-- A mão de obra avisa que terminou um lote (o dono confere e clica em LOTE PRONTO)
create or replace function public.avisar_terminei(p_lote bigint, p_mensagem text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not exists (select 1 from lotes where id = p_lote and mao_de_obra_id = auth.uid() and status = 'aberto') then
    raise exception 'Lote não encontrado ou já finalizado.';
  end if;
  if exists (select 1 from avisos where lote_id = p_lote and visto_em is null) then
    raise exception 'Você já avisou que terminou este lote. Aguarde a conferência.';
  end if;
  insert into avisos (lote_id, mao_de_obra_id, mensagem)
  values (p_lote, auth.uid(), nullif(trim(p_mensagem), '')) returning id into v_id;
  return v_id;
end $$;

-- A mão de obra cancela o próprio aviso (clicou sem querer)
create or replace function public.cancelar_aviso(p_lote bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from avisos where lote_id = p_lote and mao_de_obra_id = auth.uid() and visto_em is null;
end $$;

-- O dono dispensa um aviso sem finalizar o lote
create or replace function public.dispensar_aviso(p_lote bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_dono() then raise exception 'Apenas o dono.'; end if;
  update avisos set visto_em = now() where lote_id = p_lote and visto_em is null;
end $$;

-- A mão de obra marca a nota como lida
create or replace function public.marcar_nota_lida(p_nota bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update notas set lida_em = coalesce(lida_em, now()) where id = p_nota and mao_de_obra_id = auth.uid();
end $$;

-- =====================================================================
-- 10. SEGURANÇA (RLS) — cada mão de obra só vê o que é dela
-- =====================================================================
alter table public.perfis        enable row level security;
alter table public.produtos      enable row level security;
alter table public.servicos      enable row level security;
alter table public.lotes         enable row level security;
alter table public.entregas      enable row level security;
alter table public.pagamentos    enable row level security;
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

drop policy if exists pag_dono on public.pagamentos;
create policy pag_dono on public.pagamentos for all to authenticated using (eh_dono()) with check (eh_dono());
drop policy if exists pag_mo on public.pagamentos;
create policy pag_mo on public.pagamentos for select to authenticated using (mao_de_obra_id = auth.uid());

drop policy if exists conf_dono on public.configuracoes;
create policy conf_dono on public.configuracoes for all to authenticated using (eh_dono()) with check (eh_dono());

alter table public.empresas      enable row level security;
alter table public.entradas      enable row level security;
alter table public.notas         enable row level security;

drop policy if exists empresas_dono on public.empresas;
create policy empresas_dono on public.empresas for all to authenticated using (eh_dono()) with check (eh_dono());
drop policy if exists entradas_dono on public.entradas;
create policy entradas_dono on public.entradas for all to authenticated using (eh_dono()) with check (eh_dono());
alter table public.avisos        enable row level security;
drop policy if exists avisos_dono on public.avisos;
create policy avisos_dono on public.avisos for all to authenticated using (eh_dono()) with check (eh_dono());
drop policy if exists avisos_mo on public.avisos;
create policy avisos_mo on public.avisos for select to authenticated using (mao_de_obra_id = auth.uid());

drop policy if exists notas_dono on public.notas;
create policy notas_dono on public.notas for all to authenticated using (eh_dono()) with check (eh_dono());
drop policy if exists notas_mo on public.notas;
create policy notas_mo on public.notas for select to authenticated using (mao_de_obra_id = auth.uid());

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
