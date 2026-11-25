-- =====================================================================
--  Controle de Mão de Obra — Fábrica de Bordados  (versão 8)
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

-- Tipo de mão de obra e forma de pagamento (por produção ou por hora)
alter table public.perfis add column if not exists tipo text not null default 'externa';
alter table public.perfis add column if not exists forma_pagamento text not null default 'producao';
alter table public.perfis add column if not exists valor_hora numeric(10,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'perfis_tipo_chk') then
    alter table public.perfis add constraint perfis_tipo_chk check (tipo in ('externa','interna'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfis_forma_chk') then
    alter table public.perfis add constraint perfis_forma_chk check (forma_pagamento in ('producao','hora'));
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
alter table public.pagamentos alter column quantidade type numeric(12,2);

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
alter table public.notas alter column quantidade type numeric(12,2);
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

-- ---------------------------------------------------------------------
-- 6f. HORAS trabalhadas (mão de obra paga por hora) — lançadas pelo dono
-- ---------------------------------------------------------------------
create table if not exists public.horas (
  id              bigint generated always as identity primary key,
  mao_de_obra_id  uuid not null references public.perfis(id),
  data            date not null default (now() at time zone 'America/Sao_Paulo')::date,
  horas           numeric(5,2) not null check (horas > 0 and horas <= 24),
  valor_hora      numeric(10,2) not null check (valor_hora >= 0),   -- congelado no lançamento
  valor           numeric(12,2) generated always as (round(horas * valor_hora, 2)) stored,
  observacao      text,
  pagamento_id    bigint references public.pagamentos(id) on delete set null,
  criado_em       timestamptz not null default now()
);
create index if not exists horas_mo_idx on public.horas (mao_de_obra_id, data);

-- ---------------------------------------------------------------------
-- 6g. FUNCIONÁRIOS FIXOS (registrados, salário mensal — sem login)
-- ---------------------------------------------------------------------
create table if not exists public.funcionarios_fixos (
  id         bigint generated always as identity primary key,
  nome       text not null,
  cargo      text,
  salario    numeric(10,2),
  whatsapp   text,
  pix        text,
  endereco   text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- =====================================================================
-- 6h. VERSÃO 8 — quem fez cada alteração (colunas nas tabelas antigas)
--     (vem antes das visões para elas já mostrarem essas colunas)
-- =====================================================================
do $$ declare t text; begin
  foreach t in array array['perfis','produtos','servicos','lotes','entregas','pagamentos','notas','empresas','entradas','horas','funcionarios_fixos','avisos'] loop
    execute format('alter table public.%I add column if not exists criado_por uuid', t);
    execute format('alter table public.%I add column if not exists alterado_por uuid', t);
    execute format('alter table public.%I add column if not exists alterado_em timestamptz', t);
  end loop;
end $$;

-- =====================================================================
-- 7. VISÕES (cálculos prontos) — recriadas a cada atualização
-- =====================================================================
drop view if exists public.v_resumo_mensal, public.v_fechamento, public.v_ganhos, public.v_horas,
  public.v_entregas, public.v_lotes, public.v_entradas, public.v_distribuicao cascade;

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
  pf.nome as mao_de_obra_nome,
  pf.tipo as mao_de_obra_tipo
from public.entregas e
join public.lotes l    on l.id = e.lote_id
join public.produtos p on p.id = l.produto_id
join public.servicos s on s.id = l.servico_id
join public.perfis pf  on pf.id = l.mao_de_obra_id
where l.status <> 'cancelado';

-- Horas com nomes
create view public.v_horas with (security_invoker = true) as
select h.*, pf.nome as mao_de_obra_nome, pf.tipo as mao_de_obra_tipo,
       date_trunc('month', h.data)::date as mes_ref, (h.pagamento_id is not null) as pago
from public.horas h
join public.perfis pf on pf.id = h.mao_de_obra_id;

-- Tudo o que cada mão de obra ganhou: peças entregues + horas trabalhadas
create view public.v_ganhos with (security_invoker = true) as
select 'producao'::text as origem, e.id, e.mao_de_obra_id, e.mao_de_obra_nome, e.mao_de_obra_tipo,
       e.dia, e.mes_ref, e.produto_nome, e.servico_nome, e.quantidade::numeric as quantidade,
       e.valor_unitario, e.valor, e.pago, e.pagamento_id
  from public.v_entregas e
union all
select 'hora', h.id, h.mao_de_obra_id, h.mao_de_obra_nome, h.mao_de_obra_tipo,
       h.data, h.mes_ref, 'Horas', 'Horas trabalhadas', h.horas,
       h.valor_hora, h.valor, h.pago, h.pagamento_id
  from public.v_horas h;

-- Fechamento detalhado por mês: mão de obra × produto × serviço (horas incluídas)
create view public.v_fechamento with (security_invoker = true) as
select
  mao_de_obra_id, mao_de_obra_nome, mao_de_obra_tipo, mes_ref as mes,
  produto_nome, servico_nome, valor_unitario,
  sum(quantidade) as quantidade,
  sum(valor)      as valor,
  sum(valor) filter (where pago) as valor_pago
from public.v_ganhos
group by mao_de_obra_id, mao_de_obra_nome, mao_de_obra_tipo, mes_ref, produto_nome, servico_nome, valor_unitario;

-- Total do mês por mão de obra
create view public.v_resumo_mensal with (security_invoker = true) as
select
  mao_de_obra_id, mao_de_obra_nome, mao_de_obra_tipo, mes_ref as mes,
  sum(quantidade) as quantidade,
  sum(valor)      as valor_total,
  coalesce(sum(valor) filter (where pago), 0) as valor_pago
from public.v_ganhos
group by mao_de_obra_id, mao_de_obra_nome, mao_de_obra_tipo, mes_ref;

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

-- Horas já pagas ficam travadas
create or replace function public.trava_horas_pagas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and old.pagamento_id is not null then
    raise exception 'Essas horas já foram pagas. Desfaça o pagamento antes de alterar.';
  end if;
  if tg_op = 'UPDATE' and old.pagamento_id is not null and new.pagamento_id is not distinct from old.pagamento_id
     and (new.horas <> old.horas or new.valor_hora <> old.valor_hora or new.data <> old.data) then
    raise exception 'Essas horas já foram pagas. Desfaça o pagamento antes de alterar.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_trava_horas on public.horas;
create trigger trg_trava_horas before update or delete on public.horas
for each row execute function public.trava_horas_pagas();

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

-- Marca como pago tudo o que a mão de obra ganhou no período (peças + horas) e ainda não foi pago
drop function if exists public.enviar_nota(uuid, date, date, text, text);
create or replace function public.pagar_periodo(p_mao_de_obra uuid, p_inicio date, p_fim date, p_tipo text default 'mensal')
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_qtd numeric; v_valor numeric;
begin
  if not eh_dono() then raise exception 'Apenas o dono pode registrar pagamentos.'; end if;
  select coalesce(sum(quantidade), 0), coalesce(sum(valor), 0) into v_qtd, v_valor
    from v_ganhos where mao_de_obra_id = p_mao_de_obra and not pago and dia between p_inicio and p_fim;
  if v_qtd = 0 then raise exception 'Não há nada a pagar neste período.'; end if;
  insert into pagamentos (mao_de_obra_id, tipo, inicio, fim, quantidade, valor_total)
  values (p_mao_de_obra, coalesce(p_tipo, 'mensal'), p_inicio, p_fim, v_qtd, v_valor) returning id into v_id;
  update entregas e set pagamento_id = v_id
    from lotes l
   where l.id = e.lote_id and l.mao_de_obra_id = p_mao_de_obra and l.status <> 'cancelado'
     and e.pagamento_id is null
     and (e.entregue_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;
  update horas set pagamento_id = v_id
   where mao_de_obra_id = p_mao_de_obra and pagamento_id is null and data between p_inicio and p_fim;
  return v_id;
end $$;

-- Desfaz um pagamento (peças e horas voltam para "a pagar")
create or replace function public.desfazer_pagamento(p_pagamento bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_dono() then raise exception 'Apenas o dono.'; end if;
  update entregas set pagamento_id = null where pagamento_id = p_pagamento;
  update horas set pagamento_id = null where pagamento_id = p_pagamento;
  delete from pagamentos where id = p_pagamento;
end $$;

-- Nota de pagamento do período (aviso para a mão de obra; não marca como pago)
create or replace function public.enviar_nota(p_mao_de_obra uuid, p_inicio date, p_fim date,
  p_tipo text default 'mensal', p_mensagem text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_itens jsonb; v_qtd numeric; v_valor numeric; v_id bigint;
begin
  if not eh_dono() then raise exception 'Apenas o dono pode enviar notas.'; end if;
  with g as (
    select produto_nome, servico_nome, valor_unitario, sum(quantidade) quantidade, sum(valor) valor
      from v_ganhos where mao_de_obra_id = p_mao_de_obra and dia between p_inicio and p_fim
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

-- Lança horas trabalhadas (o valor da hora vem do cadastro, do padrão ou do informado)
create or replace function public.lancar_horas(p_mao_de_obra uuid, p_data date, p_horas numeric,
  p_valor_hora numeric default null, p_observacao text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_valor numeric; v_id bigint;
begin
  if not eh_dono() then raise exception 'Apenas o dono pode lançar horas.'; end if;
  if p_horas is null or p_horas <= 0 or p_horas > 24 then raise exception 'Informe as horas (entre 0 e 24).'; end if;
  select coalesce(p_valor_hora, pf.valor_hora,
                  (select nullif(replace(valor, ',', '.'), '')::numeric from configuracoes where chave = 'valor_hora_padrao'))
    into v_valor from perfis pf where pf.id = p_mao_de_obra;
  if v_valor is null then raise exception 'Defina o valor da hora no cadastro ou no Administrativo.'; end if;
  insert into horas (mao_de_obra_id, data, horas, valor_hora, observacao)
  values (p_mao_de_obra, coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date), p_horas, v_valor,
          nullif(trim(p_observacao), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.excluir_horas(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_dono() then raise exception 'Apenas o dono.'; end if;
  delete from horas where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
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
alter table public.horas              enable row level security;
alter table public.funcionarios_fixos enable row level security;
drop policy if exists horas_dono on public.horas;
create policy horas_dono on public.horas for all to authenticated using (eh_dono()) with check (eh_dono());
drop policy if exists horas_mo on public.horas;
create policy horas_mo on public.horas for select to authenticated using (mao_de_obra_id = auth.uid());
drop policy if exists fixos_dono on public.funcionarios_fixos;
create policy fixos_dono on public.funcionarios_fixos for all to authenticated using (eh_dono()) with check (eh_dono());

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
-- 9. VERSÃO 7 — funcionários (mensal ou por hora), folha de pagamento,
--    gastos do mês, equipamentos e exclusão que mantém o histórico
-- =====================================================================
alter table public.perfis add column if not exists cargo text;
alter table public.perfis add column if not exists valor_hora_extra numeric(10,2);
alter table public.perfis add column if not exists excluido_em timestamptz;
alter table public.funcionarios_fixos add column if not exists valor_hora_extra numeric(10,2);
alter table public.funcionarios_fixos add column if not exists excluido_em timestamptz;
alter table public.produtos add column if not exists excluido_em timestamptz;
alter table public.servicos add column if not exists excluido_em timestamptz;
alter table public.empresas add column if not exists excluido_em timestamptz;

-- Folha: um pagamento por funcionário por mês (valores congelados ao pagar)
create table if not exists public.folha_pagamentos (
  id            bigint generated always as identity primary key,
  mes           date not null,
  fixo_id       bigint references public.funcionarios_fixos(id),
  perfil_id     uuid references public.perfis(id),
  salario       numeric(12,2) not null default 0,
  horas         numeric(8,2) not null default 0,
  valor_horas   numeric(12,2) not null default 0,
  horas_extras  numeric(8,2) not null default 0,
  valor_extras  numeric(12,2) not null default 0,
  bonus         numeric(12,2) not null default 0,
  vales         numeric(12,2) not null default 0,
  descontos     numeric(12,2) not null default 0,
  liquido       numeric(12,2) not null default 0,
  pagamento_id  bigint references public.pagamentos(id) on delete set null,
  pago_em       timestamptz not null default now(),
  check ((fixo_id is null) <> (perfil_id is null))
);
create unique index if not exists folha_pag_fixo_uk on public.folha_pagamentos (mes, fixo_id) where fixo_id is not null;
create unique index if not exists folha_pag_perfil_uk on public.folha_pagamentos (mes, perfil_id) where perfil_id is not null;

-- Folha: horas extras, bonificações, vales e descontos
create table if not exists public.folha_lancamentos (
  id                 bigint generated always as identity primary key,
  fixo_id            bigint references public.funcionarios_fixos(id),
  perfil_id          uuid references public.perfis(id),
  data               date not null default (now() at time zone 'America/Sao_Paulo')::date,
  tipo               text not null check (tipo in ('hora_extra','bonus','vale','desconto')),
  horas              numeric(6,2),
  valor_hora         numeric(10,2),
  valor              numeric(12,2) not null check (valor >= 0),
  descricao          text,
  folha_pagamento_id bigint references public.folha_pagamentos(id) on delete set null,
  criado_em          timestamptz not null default now(),
  check ((fixo_id is null) <> (perfil_id is null))
);
create index if not exists folha_lanc_idx on public.folha_lancamentos (data);

create or replace function public.trava_folha_paga()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and old.folha_pagamento_id is not null then
    raise exception 'Este lançamento já foi pago na folha. Desfaça o pagamento antes.';
  end if;
  if tg_op = 'UPDATE' and old.folha_pagamento_id is not null and new.folha_pagamento_id is not distinct from old.folha_pagamento_id then
    raise exception 'Este lançamento já foi pago na folha. Desfaça o pagamento antes.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_trava_folha on public.folha_lancamentos;
create trigger trg_trava_folha before update or delete on public.folha_lancamentos
for each row execute function public.trava_folha_paga();

-- Equipamentos e manutenções
create table if not exists public.equipamentos (
  id            bigint generated always as identity primary key,
  nome          text not null,
  modelo        text,
  numero_serie  text,
  data_compra   date,
  valor_compra  numeric(12,2),
  situacao      text not null default 'funcionando' check (situacao in ('funcionando','manutencao','parado')),
  observacao    text,
  excluido_em   timestamptz,
  criado_em     timestamptz not null default now()
);
create table if not exists public.manutencoes (
  id              bigint generated always as identity primary key,
  equipamento_id  bigint not null references public.equipamentos(id),
  data            date not null default (now() at time zone 'America/Sao_Paulo')::date,
  descricao       text not null,
  responsavel     text,
  valor           numeric(12,2) not null default 0 check (valor >= 0),
  criado_em       timestamptz not null default now()
);

-- Gastos do mês (fixos se repetem todo mês)
create table if not exists public.gastos_fixos (
  id          bigint generated always as identity primary key,
  descricao   text not null,
  categoria   text not null default 'Outros',
  valor       numeric(12,2) not null default 0 check (valor >= 0),
  dia         int not null default 5 check (dia between 1 and 28),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);
create table if not exists public.gastos (
  id              bigint generated always as identity primary key,
  data            date not null default (now() at time zone 'America/Sao_Paulo')::date,
  descricao       text not null,
  categoria       text not null default 'Outros',
  valor           numeric(12,2) not null default 0 check (valor >= 0),
  observacao      text,
  gasto_fixo_id   bigint references public.gastos_fixos(id) on delete set null,
  mes_fixo        date,
  manutencao_id   bigint references public.manutencoes(id) on delete cascade,
  criado_em       timestamptz not null default now()
);
alter table public.gastos add column if not exists cancelado boolean not null default false;
create unique index if not exists gastos_fixo_mes_uk on public.gastos (gasto_fixo_id, mes_fixo) where gasto_fixo_id is not null;
create index if not exists gastos_data_idx on public.gastos (data);

-- Toda manutenção entra também nos gastos do mês
create or replace function public.manutencao_gasto()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from equipamentos where id = new.equipamento_id;
  if tg_op = 'INSERT' then
    insert into gastos (data, descricao, categoria, valor, observacao, manutencao_id)
    values (new.data, 'Manutenção: ' || new.descricao, 'Manutenção', new.valor, v_nome, new.id);
  else
    update gastos set data = new.data, descricao = 'Manutenção: ' || new.descricao, valor = new.valor, observacao = v_nome
     where manutencao_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_manutencao_gasto on public.manutencoes;
create trigger trg_manutencao_gasto after insert or update on public.manutencoes
for each row execute function public.manutencao_gasto();

-- Lança no mês os gastos fixos que ainda não entraram
create or replace function public.gerar_gastos_fixos(p_mes date)
returns int language plpgsql security definer set search_path = public as $$
declare v_mes date := date_trunc('month', p_mes)::date; v_n int;
begin
  if not eh_dono() then raise exception 'Apenas o dono.'; end if;
  if v_mes > date_trunc('month', now() at time zone 'America/Sao_Paulo')::date then return 0; end if;
  insert into gastos (data, descricao, categoria, valor, gasto_fixo_id, mes_fixo)
  select v_mes + (f.dia - 1), f.descricao, f.categoria, f.valor, f.id, v_mes
    from gastos_fixos f
   where f.ativo and f.criado_em < (v_mes + interval '1 month')
     and not exists (select 1 from gastos g where g.gasto_fixo_id = f.id and g.mes_fixo = v_mes);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Resumo da folha do mês (quem já foi pago mostra os valores congelados)
drop function if exists public.resumo_folha(date);
create or replace function public.resumo_folha(p_mes date)
returns table (fixo_id bigint, perfil_id uuid, nome text, cargo text, forma text, pix text, whatsapp text,
  salario numeric, horas numeric, valor_horas numeric, horas_extras numeric, valor_extras numeric,
  bonus numeric, vales numeric, descontos numeric, liquido numeric, folha_pagamento_id bigint, pago_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_ini date := date_trunc('month', p_mes)::date; v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
begin
  if not eh_dono() then raise exception 'Apenas o dono.'; end if;
  return query
  with pessoas as (
    select f.id as fx, null::uuid as pf, f.nome, f.cargo, 'mensal'::text as forma, f.pix, f.whatsapp, coalesce(f.salario, 0) as sal
      from funcionarios_fixos f
     where (f.excluido_em is null and f.ativo and f.criado_em::date <= v_fim)
        or exists (select 1 from folha_lancamentos l where l.fixo_id = f.id and l.data between v_ini and v_fim)
        or exists (select 1 from folha_pagamentos p where p.fixo_id = f.id and p.mes = v_ini)
    union all
    select null::bigint, p.id, p.nome, p.cargo, 'hora', p.pix, p.whatsapp, 0::numeric
      from perfis p
     where p.papel = 'mao_de_obra' and p.tipo = 'interna' and p.forma_pagamento = 'hora'
       and ((p.excluido_em is null and p.ativo)
         or exists (select 1 from horas h where h.mao_de_obra_id = p.id and h.data between v_ini and v_fim)
         or exists (select 1 from folha_lancamentos l where l.perfil_id = p.id and l.data between v_ini and v_fim)
         or exists (select 1 from folha_pagamentos fp where fp.perfil_id = p.id and fp.mes = v_ini))
  ), calc as (
    select pe.*,
      coalesce((select sum(h.horas) from horas h where h.mao_de_obra_id = pe.pf and h.data between v_ini and v_fim), 0) as hs,
      coalesce((select sum(h.valor) from horas h where h.mao_de_obra_id = pe.pf and h.data between v_ini and v_fim), 0) as vhs,
      coalesce((select sum(l.horas) from folha_lancamentos l where (l.fixo_id = pe.fx or l.perfil_id = pe.pf) and l.tipo = 'hora_extra' and l.data between v_ini and v_fim), 0) as he,
      coalesce((select sum(l.valor) from folha_lancamentos l where (l.fixo_id = pe.fx or l.perfil_id = pe.pf) and l.tipo = 'hora_extra' and l.data between v_ini and v_fim), 0) as vhe,
      coalesce((select sum(l.valor) from folha_lancamentos l where (l.fixo_id = pe.fx or l.perfil_id = pe.pf) and l.tipo = 'bonus' and l.data between v_ini and v_fim), 0) as bo,
      coalesce((select sum(l.valor) from folha_lancamentos l where (l.fixo_id = pe.fx or l.perfil_id = pe.pf) and l.tipo = 'vale' and l.data between v_ini and v_fim), 0) as va,
      coalesce((select sum(l.valor) from folha_lancamentos l where (l.fixo_id = pe.fx or l.perfil_id = pe.pf) and l.tipo = 'desconto' and l.data between v_ini and v_fim), 0) as de,
      (select fp from folha_pagamentos fp where fp.mes = v_ini and (fp.fixo_id = pe.fx or fp.perfil_id = pe.pf)) as pg
    from pessoas pe
  )
  select c.fx, c.pf, c.nome, c.cargo, c.forma, c.pix, c.whatsapp,
    coalesce((c.pg).salario, c.sal), coalesce((c.pg).horas, c.hs), coalesce((c.pg).valor_horas, c.vhs),
    coalesce((c.pg).horas_extras, c.he), coalesce((c.pg).valor_extras, c.vhe), coalesce((c.pg).bonus, c.bo),
    coalesce((c.pg).vales, c.va), coalesce((c.pg).descontos, c.de),
    coalesce((c.pg).liquido, c.sal + c.vhs + c.vhe + c.bo - c.va - c.de),
    (c.pg).id, (c.pg).pago_em
  from calc c
  order by c.forma desc, c.nome;
end $$;

-- Marca o funcionário como pago no mês (trava os lançamentos e as horas)
create or replace function public.pagar_folha(p_mes date, p_fixo bigint default null, p_perfil uuid default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare r record; v_id bigint; v_pag bigint; v_ini date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
begin
  if not eh_dono() then raise exception 'Apenas o dono pode pagar a folha.'; end if;
  select * into r from resumo_folha(v_ini) x
   where (p_fixo is not null and x.fixo_id = p_fixo) or (p_perfil is not null and x.perfil_id = p_perfil);
  if not found then raise exception 'Funcionário não encontrado nesta folha.'; end if;
  if r.folha_pagamento_id is not null then raise exception 'Este funcionário já está pago neste mês.'; end if;
  if p_perfil is not null then
    insert into pagamentos (mao_de_obra_id, tipo, inicio, fim, quantidade, valor_total)
    values (p_perfil, 'mensal', v_ini, v_fim, r.horas, r.liquido) returning id into v_pag;
    update horas set pagamento_id = v_pag where mao_de_obra_id = p_perfil and pagamento_id is null and data between v_ini and v_fim;
  end if;
  insert into folha_pagamentos (mes, fixo_id, perfil_id, salario, horas, valor_horas, horas_extras, valor_extras, bonus, vales, descontos, liquido, pagamento_id)
  values (v_ini, p_fixo, p_perfil, r.salario, r.horas, r.valor_horas, r.horas_extras, r.valor_extras, r.bonus, r.vales, r.descontos, r.liquido, v_pag)
  returning id into v_id;
  update folha_lancamentos set folha_pagamento_id = v_id
   where ((p_fixo is not null and fixo_id = p_fixo) or (p_perfil is not null and perfil_id = p_perfil)) and data between v_ini and v_fim;
  return v_id;
end $$;

create or replace function public.desfazer_folha(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_pag bigint;
begin
  if not eh_dono() then raise exception 'Apenas o dono.'; end if;
  select pagamento_id into v_pag from folha_pagamentos where id = p_id;
  update folha_lancamentos set folha_pagamento_id = null where folha_pagamento_id = p_id;
  delete from folha_pagamentos where id = p_id;
  if v_pag is not null then
    update horas set pagamento_id = null where pagamento_id = v_pag;
    delete from pagamentos where id = v_pag;
  end if;
end $$;

-- Segurança das tabelas novas
alter table public.folha_pagamentos  enable row level security;
alter table public.folha_lancamentos enable row level security;
alter table public.equipamentos      enable row level security;
alter table public.manutencoes       enable row level security;
alter table public.gastos_fixos      enable row level security;
alter table public.gastos            enable row level security;
do $$ declare t text; begin
  foreach t in array array['folha_pagamentos','folha_lancamentos','equipamentos','manutencoes','gastos_fixos','gastos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_dono', t);
    execute format('create policy %I on public.%I for all to authenticated using (eh_dono()) with check (eh_dono())', t || '_dono', t);
  end loop;
end $$;
drop policy if exists folha_pag_mo on public.folha_pagamentos;
create policy folha_pag_mo on public.folha_pagamentos for select to authenticated using (perfil_id = auth.uid());
drop policy if exists folha_lanc_mo on public.folha_lancamentos;
create policy folha_lanc_mo on public.folha_lancamentos for select to authenticated using (perfil_id = auth.uid());


-- =====================================================================
-- 10. VERSÃO 8 — vários administradores e histórico de alterações
-- =====================================================================
do $$ declare t text; begin
  foreach t in array array['folha_pagamentos','folha_lancamentos','equipamentos','manutencoes','gastos_fixos','gastos'] loop
    execute format('alter table public.%I add column if not exists criado_por uuid', t);
    execute format('alter table public.%I add column if not exists alterado_por uuid', t);
    execute format('alter table public.%I add column if not exists alterado_em timestamptz', t);
  end loop;
end $$;

-- Anota quem criou / alterou cada linha (quem está logado)
create or replace function public.marca_autor()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.criado_por := coalesce(new.criado_por, auth.uid()); end if;
    new.alterado_por := auth.uid();
  end if;
  new.alterado_em := now();
  return new;
end $$;

-- Histórico de alterações (o que foi feito, por quem e quando)
create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  quando      timestamptz not null default now(),
  usuario_id  uuid,
  tabela      text not null,
  registro    text,
  acao        text not null,
  dados       jsonb
);
create index if not exists auditoria_quando_idx on public.auditoria (quando desc);
alter table public.auditoria enable row level security;
drop policy if exists auditoria_dono on public.auditoria;
create policy auditoria_dono on public.auditoria for select to authenticated using (eh_dono());

create or replace function public.registra_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ign text[] := array['alterado_por','alterado_em','pagamento_id','folha_pagamento_id','status','finalizado_em','lida_em','visto_em'];
  v_new jsonb; v_old jsonb; k text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' then
    v_new := to_jsonb(new); v_old := to_jsonb(old);
    foreach k in array ign loop v_new := v_new - k; v_old := v_old - k; end loop;
    if v_new = v_old then return new; end if;
  end if;
  insert into auditoria (usuario_id, tabela, registro, acao, dados)
  values (auth.uid(), tg_table_name, (to_jsonb(coalesce(new, old)) ->> 'id'), lower(tg_op),
          to_jsonb(coalesce(new, old)) - array['criado_por','alterado_por','alterado_em','itens']);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['perfis','produtos','servicos','lotes','entregas','pagamentos','notas','empresas','entradas','horas',
                           'funcionarios_fixos','folha_pagamentos','folha_lancamentos','equipamentos','manutencoes','gastos_fixos','gastos'] loop
    execute format('drop trigger if exists trg_autor on public.%I', t);
    execute format('create trigger trg_autor before insert or update on public.%I for each row execute function public.marca_autor()', t);
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.registra_auditoria()', t);
  end loop;
end $$;
drop trigger if exists trg_autor on public.avisos;
create trigger trg_autor before insert or update on public.avisos for each row execute function public.marca_autor();

-- Novo administrador: só um administrador pode transformar um login em administrador
create or replace function public.tornar_admin(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_dono() then raise exception 'Apenas um administrador pode fazer isso.'; end if;
  update perfis set papel = 'dono' where id = p_id;
end $$;


-- =====================================================================
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
