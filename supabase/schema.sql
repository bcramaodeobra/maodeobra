-- =====================================================================
--  Controle de Mão de Obra — Fábrica de Bordados
--  Rode este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERFIS (dono e mãos de obra) — ligado ao login do Supabase Auth
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id           uuid primary key references auth.users(id) on delete cascade,
  usuario      text not null unique,
  nome         text not null,
  papel        text not null default 'mao_de_obra' check (papel in ('dono','mao_de_obra')),
  telefone     text,
  endereco     text,
  observacoes  text,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

-- Funções auxiliares usadas nas regras de segurança
create or replace function public.eh_dono()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'dono' and ativo);
$$;

create or replace function public.eh_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;

-- ---------------------------------------------------------------------
-- 2. CADASTROS
-- ---------------------------------------------------------------------
create table if not exists public.produtos (
  id         bigint generated always as identity primary key,
  nome       text not null,
  descricao  text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table if not exists public.servicos (
  id         bigint generated always as identity primary key,
  nome       text not null,
  descricao  text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- Valor pago por peça para cada combinação produto + serviço
create table if not exists public.precos (
  id              bigint generated always as identity primary key,
  produto_id      bigint not null references public.produtos(id) on delete cascade,
  servico_id      bigint not null references public.servicos(id) on delete cascade,
  valor_unitario  numeric(10,2) not null check (valor_unitario >= 0),
  atualizado_em   timestamptz not null default now(),
  unique (produto_id, servico_id)
);

create table if not exists public.materiais (
  id              bigint generated always as identity primary key,
  nome            text not null,
  unidade         text not null default 'un',      -- un, m, kg, cone, rolo...
  custo_unitario  numeric(10,2) not null default 0 check (custo_unitario >= 0),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. LOTES (o que o dono envia para cada mão de obra)
-- ---------------------------------------------------------------------
create table if not exists public.lotes (
  id              bigint generated always as identity primary key,
  mao_de_obra_id  uuid   not null references public.perfis(id),
  produto_id      bigint not null references public.produtos(id),
  servico_id      bigint not null references public.servicos(id),
  quantidade      integer not null check (quantidade > 0),
  valor_unitario  numeric(10,2) not null check (valor_unitario >= 0),  -- congelado no envio
  valor_total     numeric(12,2) generated always as (quantidade * valor_unitario) stored,
  prazo           date,
  observacoes     text,
  status          text not null default 'enviado'
                  check (status in ('enviado','recebido','em_producao','concluido','cancelado')),
  enviado_em      timestamptz not null default now(),
  recebido_em     timestamptz,
  concluido_em    timestamptz,
  criado_por      uuid default auth.uid() references public.perfis(id)
);
create index if not exists lotes_mao_de_obra_idx on public.lotes (mao_de_obra_id, status);

-- Materiais que seguiram junto com o lote (controle)
create table if not exists public.lote_materiais (
  id           bigint generated always as identity primary key,
  lote_id      bigint not null references public.lotes(id) on delete cascade,
  material_id  bigint not null references public.materiais(id),
  quantidade   numeric(10,2) not null check (quantidade > 0),
  devolvido    numeric(10,2) not null default 0 check (devolvido >= 0)
);

-- ---------------------------------------------------------------------
-- 4. PRODUÇÃO DIÁRIA (lançada pela mão de obra — base do acumulado dela)
-- ---------------------------------------------------------------------
create table if not exists public.producao_diaria (
  id              bigint generated always as identity primary key,
  lote_id         bigint not null references public.lotes(id) on delete cascade,
  mao_de_obra_id  uuid   not null default auth.uid() references public.perfis(id),
  data            date   not null default (now() at time zone 'America/Sao_Paulo')::date,
  quantidade      integer not null check (quantidade > 0),
  observacao      text,
  criado_em       timestamptz not null default now()
);
create index if not exists producao_mo_data_idx on public.producao_diaria (mao_de_obra_id, data);

-- ---------------------------------------------------------------------
-- 5. ENTREGAS (parciais ou totais) — o dono confere, e é isso que é pago
-- ---------------------------------------------------------------------
create table if not exists public.entregas (
  id                   bigint generated always as identity primary key,
  lote_id              bigint not null references public.lotes(id) on delete cascade,
  quantidade           integer not null check (quantidade > 0),       -- quanto a mão de obra entregou
  quantidade_aprovada  integer check (quantidade_aprovada >= 0),      -- quanto o dono aprovou
  quantidade_retorno   integer not null default 0 check (quantidade_retorno >= 0), -- voltou p/ refazer
  status               text not null default 'pendente' check (status in ('pendente','conferida')),
  entregue_em          timestamptz not null default now(),
  conferido_em         timestamptz,
  observacao           text,
  observacao_conferencia text,
  check (quantidade_aprovada is null or quantidade_aprovada + quantidade_retorno <= quantidade)
);
create index if not exists entregas_lote_idx on public.entregas (lote_id, status);

-- ---------------------------------------------------------------------
-- 6. FECHAMENTOS (mês pago para cada mão de obra)
-- ---------------------------------------------------------------------
create table if not exists public.fechamentos (
  id              bigint generated always as identity primary key,
  mao_de_obra_id  uuid not null references public.perfis(id),
  mes             date not null check (extract(day from mes) = 1),  -- sempre o dia 1 do mês
  quantidade      integer not null default 0,
  valor_total     numeric(12,2) not null default 0,
  pago_em         timestamptz not null default now(),
  observacao      text,
  unique (mao_de_obra_id, mes)
);

-- =====================================================================
-- 7. VISÕES (cálculos prontos)
-- =====================================================================

-- Lote com saldo: quanto falta entregar, quanto foi aprovado, valor a receber
create or replace view public.v_lotes with (security_invoker = true) as
select
  l.*,
  p.nome  as produto_nome,
  s.nome  as servico_nome,
  pf.nome as mao_de_obra_nome,
  coalesce(e.aprovado, 0)          as qtd_aprovada,
  coalesce(e.pendente, 0)          as qtd_em_conferencia,
  coalesce(e.retorno, 0)           as qtd_retorno,
  greatest(l.quantidade - coalesce(e.aprovado,0) - coalesce(e.pendente,0), 0) as qtd_saldo,
  coalesce(pd.produzido, 0)        as qtd_produzida_lancada,
  coalesce(e.aprovado, 0) * l.valor_unitario as valor_aprovado,
  (l.prazo is not null and l.prazo < (now() at time zone 'America/Sao_Paulo')::date
     and l.status not in ('concluido','cancelado')) as atrasado
from public.lotes l
join public.produtos p  on p.id = l.produto_id
join public.servicos s  on s.id = l.servico_id
join public.perfis  pf  on pf.id = l.mao_de_obra_id
left join lateral (
  select sum(quantidade_aprovada) filter (where status='conferida') as aprovado,
         sum(quantidade)          filter (where status='pendente')  as pendente,
         sum(quantidade_retorno)  filter (where status='conferida') as retorno
  from public.entregas where lote_id = l.id
) e on true
left join lateral (
  select sum(quantidade) as produzido from public.producao_diaria where lote_id = l.id
) pd on true;

-- Entregas com dados do lote (valor de cada entrega)
create or replace view public.v_entregas with (security_invoker = true) as
select
  e.*,
  l.mao_de_obra_id,
  l.valor_unitario,
  coalesce(e.quantidade_aprovada,0) * l.valor_unitario as valor,
  date_trunc('month', e.conferido_em at time zone 'America/Sao_Paulo')::date as mes_ref,
  p.nome  as produto_nome,
  s.nome  as servico_nome,
  pf.nome as mao_de_obra_nome
from public.entregas e
join public.lotes l    on l.id = e.lote_id
join public.produtos p on p.id = l.produto_id
join public.servicos s on s.id = l.servico_id
join public.perfis pf  on pf.id = l.mao_de_obra_id;

-- Resumo mensal por mão de obra (base do fechamento)
create or replace view public.v_resumo_mensal with (security_invoker = true) as
select
  ve.mao_de_obra_id,
  ve.mao_de_obra_nome,
  ve.mes_ref as mes,
  count(*)                          as entregas,
  sum(ve.quantidade_aprovada)       as quantidade,
  sum(ve.valor)                     as valor_total,
  f.id                              as fechamento_id,
  f.pago_em
from public.v_entregas ve
left join public.fechamentos f on f.mao_de_obra_id = ve.mao_de_obra_id and f.mes = ve.mes_ref
where ve.status = 'conferida'
group by ve.mao_de_obra_id, ve.mao_de_obra_nome, ve.mes_ref, f.id, f.pago_em;

-- Produção lançada com valor estimado (para o menu lateral da mão de obra)
create or replace view public.v_producao with (security_invoker = true) as
select
  pd.*,
  l.valor_unitario,
  pd.quantidade * l.valor_unitario as valor_estimado,
  p.nome as produto_nome,
  s.nome as servico_nome
from public.producao_diaria pd
join public.lotes l    on l.id = pd.lote_id
join public.produtos p on p.id = l.produto_id
join public.servicos s on s.id = l.servico_id;

-- =====================================================================
-- 8. REGRAS DE NEGÓCIO (gatilhos)
-- =====================================================================

-- Mês já pago fica travado: não dá para conferir/alterar entregas nele
create or replace function public.trava_mes_pago()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_mo uuid; v_mes date;
begin
  if tg_op = 'DELETE' then
    if old.status = 'conferida' then
      select mao_de_obra_id into v_mo from lotes where id = old.lote_id;
      v_mes := date_trunc('month', old.conferido_em at time zone 'America/Sao_Paulo')::date;
      if exists (select 1 from fechamentos where mao_de_obra_id = v_mo and mes = v_mes) then
        raise exception 'Este mês já foi fechado e pago. Não é possível alterar.';
      end if;
    end if;
    return old;
  end if;

  if new.status = 'conferida' or (tg_op = 'UPDATE' and old.status = 'conferida') then
    select mao_de_obra_id into v_mo from lotes where id = new.lote_id;
    v_mes := date_trunc('month', coalesce(
               case when tg_op = 'UPDATE' and old.status = 'conferida' then old.conferido_em end,
               new.conferido_em, now()) at time zone 'America/Sao_Paulo')::date;
    if exists (select 1 from fechamentos where mao_de_obra_id = v_mo and mes = v_mes) then
      raise exception 'Este mês já foi fechado e pago. Não é possível alterar.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_trava_mes_pago on public.entregas;
create trigger trg_trava_mes_pago before insert or update or delete on public.entregas
for each row execute function public.trava_mes_pago();

-- Atualiza o status do lote conforme as entregas aprovadas
create or replace function public.atualiza_status_lote()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lote bigint; v_qtd int; v_aprov int;
begin
  v_lote := coalesce(new.lote_id, old.lote_id);
  select quantidade into v_qtd from lotes where id = v_lote;
  select coalesce(sum(quantidade_aprovada),0) into v_aprov
    from entregas where lote_id = v_lote and status = 'conferida';

  if v_aprov >= v_qtd then
    update lotes set status = 'concluido', concluido_em = coalesce(concluido_em, now())
     where id = v_lote and status <> 'cancelado';
  else
    update lotes set status = case when status = 'concluido' then 'em_producao' else status end,
                     concluido_em = null
     where id = v_lote and status <> 'cancelado';
  end if;
  return null;
end $$;

drop trigger if exists trg_status_lote on public.entregas;
create trigger trg_status_lote after insert or update or delete on public.entregas
for each row execute function public.atualiza_status_lote();

-- =====================================================================
-- 9. AÇÕES (funções chamadas pelo site)
-- =====================================================================

-- DONO: enviar lote (valor unitário vem da tabela de preços se não informado)
create or replace function public.enviar_lote(
  p_mao_de_obra uuid, p_produto bigint, p_servico bigint, p_quantidade int,
  p_prazo date default null, p_observacoes text default null,
  p_valor_unitario numeric default null, p_materiais jsonb default '[]'::jsonb
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_valor numeric; v_id bigint; m jsonb;
begin
  if not eh_dono() then raise exception 'Apenas o dono pode enviar lotes.'; end if;

  v_valor := coalesce(p_valor_unitario,
    (select valor_unitario from precos where produto_id = p_produto and servico_id = p_servico));
  if v_valor is null then
    raise exception 'Não há preço cadastrado para este produto + serviço.';
  end if;

  insert into lotes (mao_de_obra_id, produto_id, servico_id, quantidade, valor_unitario, prazo, observacoes)
  values (p_mao_de_obra, p_produto, p_servico, p_quantidade, v_valor, p_prazo, p_observacoes)
  returning id into v_id;

  for m in select * from jsonb_array_elements(coalesce(p_materiais,'[]'::jsonb)) loop
    insert into lote_materiais (lote_id, material_id, quantidade)
    values (v_id, (m->>'material_id')::bigint, (m->>'quantidade')::numeric);
  end loop;

  return v_id;
end $$;

-- MÃO DE OBRA: confirmar que recebeu o lote
create or replace function public.confirmar_recebimento(p_lote bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update lotes set status = 'recebido', recebido_em = now()
   where id = p_lote and mao_de_obra_id = auth.uid() and status = 'enviado';
  if not found then raise exception 'Lote não encontrado ou já recebido.'; end if;
end $$;

-- MÃO DE OBRA: lançar produção do dia
create or replace function public.lancar_producao(
  p_lote bigint, p_quantidade int, p_data date default null, p_observacao text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_lote lotes%rowtype; v_lancado int;
begin
  select * into v_lote from lotes where id = p_lote and mao_de_obra_id = auth.uid();
  if not found then raise exception 'Lote não encontrado.'; end if;
  if v_lote.status in ('concluido','cancelado') then raise exception 'Este lote já foi encerrado.'; end if;
  if p_quantidade <= 0 then raise exception 'Informe uma quantidade maior que zero.'; end if;

  select coalesce(sum(quantidade),0) into v_lancado from producao_diaria where lote_id = p_lote;
  if v_lancado + p_quantidade > v_lote.quantidade + (select coalesce(sum(quantidade_retorno),0) from entregas where lote_id = p_lote) then
    raise exception 'A produção lançada passa da quantidade do lote.';
  end if;

  insert into producao_diaria (lote_id, mao_de_obra_id, data, quantidade, observacao)
  values (p_lote, auth.uid(), coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date), p_quantidade, p_observacao)
  returning id into v_id;

  update lotes set status = 'em_producao', recebido_em = coalesce(recebido_em, now())
   where id = p_lote and status in ('enviado','recebido');
  return v_id;
end $$;

-- MÃO DE OBRA: apagar um lançamento de produção (só os próprios, de lotes abertos)
create or replace function public.apagar_producao(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from producao_diaria pd using lotes l
   where pd.id = p_id and pd.mao_de_obra_id = auth.uid()
     and l.id = pd.lote_id and l.status not in ('concluido','cancelado');
  if not found then raise exception 'Lançamento não encontrado.'; end if;
end $$;

-- MÃO DE OBRA ou DONO: registrar entrega (parcial ou total)
create or replace function public.registrar_entrega(
  p_lote bigint, p_quantidade int, p_observacao text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_saldo int;
begin
  if not (eh_dono() or exists (select 1 from lotes where id = p_lote and mao_de_obra_id = auth.uid())) then
    raise exception 'Lote não encontrado.';
  end if;
  if exists (select 1 from lotes where id = p_lote and status in ('concluido','cancelado')) then
    raise exception 'Este lote já foi encerrado.';
  end if;

  select qtd_saldo into v_saldo from v_lotes where id = p_lote;
  if p_quantidade <= 0 or p_quantidade > v_saldo then
    raise exception 'Quantidade inválida. Saldo a entregar: %', v_saldo;
  end if;

  insert into entregas (lote_id, quantidade, observacao)
  values (p_lote, p_quantidade, p_observacao) returning id into v_id;

  update lotes set status = 'em_producao', recebido_em = coalesce(recebido_em, now())
   where id = p_lote and status in ('enviado','recebido');
  return v_id;
end $$;

-- DONO: conferir entrega (aprovadas são pagas; retorno volta para o saldo do lote)
create or replace function public.conferir_entrega(
  p_entrega bigint, p_aprovada int, p_retorno int default 0, p_observacao text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_e entregas%rowtype;
begin
  if not eh_dono() then raise exception 'Apenas o dono pode conferir entregas.'; end if;
  select * into v_e from entregas where id = p_entrega;
  if not found then raise exception 'Entrega não encontrada.'; end if;
  if v_e.status = 'conferida' then raise exception 'Esta entrega já foi conferida.'; end if;
  if p_aprovada < 0 or p_retorno < 0 or p_aprovada + p_retorno > v_e.quantidade then
    raise exception 'Aprovadas + retorno não pode passar de % peças.', v_e.quantidade;
  end if;

  update entregas
     set status = 'conferida', quantidade_aprovada = p_aprovada,
         quantidade_retorno = p_retorno, conferido_em = now(),
         observacao_conferencia = p_observacao
   where id = p_entrega;
end $$;

-- DONO: desfazer conferência (se o mês ainda não foi pago)
create or replace function public.desfazer_conferencia(p_entrega bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_dono() then raise exception 'Apenas o dono.'; end if;
  update entregas set status = 'pendente', quantidade_aprovada = null,
         quantidade_retorno = 0, conferido_em = null, observacao_conferencia = null
   where id = p_entrega and status = 'conferida';
end $$;

-- DONO: fechar e pagar o mês de uma mão de obra
create or replace function public.fechar_mes(p_mao_de_obra uuid, p_mes date, p_observacao text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_mes date := date_trunc('month', p_mes)::date; v_qtd int; v_valor numeric; v_id bigint;
begin
  if not eh_dono() then raise exception 'Apenas o dono pode fechar o mês.'; end if;
  select coalesce(sum(quantidade),0), coalesce(sum(valor_total),0) into v_qtd, v_valor
    from v_resumo_mensal where mao_de_obra_id = p_mao_de_obra and mes = v_mes;

  insert into fechamentos (mao_de_obra_id, mes, quantidade, valor_total, observacao)
  values (p_mao_de_obra, v_mes, v_qtd, v_valor, p_observacao)
  returning id into v_id;
  return v_id;
end $$;

-- DONO: reabrir um mês pago por engano
create or replace function public.reabrir_mes(p_fechamento bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_dono() then raise exception 'Apenas o dono.'; end if;
  delete from fechamentos where id = p_fechamento;
end $$;

-- =====================================================================
-- 10. SEGURANÇA (RLS) — cada mão de obra só vê o que é dela
-- =====================================================================
alter table public.perfis          enable row level security;
alter table public.produtos        enable row level security;
alter table public.servicos        enable row level security;
alter table public.precos          enable row level security;
alter table public.materiais       enable row level security;
alter table public.lotes           enable row level security;
alter table public.lote_materiais  enable row level security;
alter table public.producao_diaria enable row level security;
alter table public.entregas        enable row level security;
alter table public.fechamentos     enable row level security;

-- Perfis: dono gerencia todos; mão de obra só lê o próprio
drop policy if exists perfis_dono on public.perfis;
create policy perfis_dono on public.perfis for all to authenticated
  using (eh_dono()) with check (eh_dono());
drop policy if exists perfis_proprio on public.perfis;
create policy perfis_proprio on public.perfis for select to authenticated
  using (id = auth.uid());

-- Cadastros: dono gerencia; mão de obra ativa só lê
do $$ declare t text; begin
  foreach t in array array['produtos','servicos','precos','materiais'] loop
    execute format('drop policy if exists %1$s_dono on public.%1$s', t);
    execute format('create policy %1$s_dono on public.%1$s for all to authenticated using (eh_dono()) with check (eh_dono())', t);
    execute format('drop policy if exists %1$s_leitura on public.%1$s', t);
    execute format('create policy %1$s_leitura on public.%1$s for select to authenticated using (eh_ativo())', t);
  end loop;
end $$;

-- Lotes
drop policy if exists lotes_dono on public.lotes;
create policy lotes_dono on public.lotes for all to authenticated
  using (eh_dono()) with check (eh_dono());
drop policy if exists lotes_mo on public.lotes;
create policy lotes_mo on public.lotes for select to authenticated
  using (mao_de_obra_id = auth.uid() and eh_ativo());

-- Materiais do lote
drop policy if exists lm_dono on public.lote_materiais;
create policy lm_dono on public.lote_materiais for all to authenticated
  using (eh_dono()) with check (eh_dono());
drop policy if exists lm_mo on public.lote_materiais;
create policy lm_mo on public.lote_materiais for select to authenticated
  using (exists (select 1 from public.lotes l where l.id = lote_id and l.mao_de_obra_id = auth.uid()));

-- Produção diária (gravação só pelas funções acima)
drop policy if exists pd_dono on public.producao_diaria;
create policy pd_dono on public.producao_diaria for all to authenticated
  using (eh_dono()) with check (eh_dono());
drop policy if exists pd_mo on public.producao_diaria;
create policy pd_mo on public.producao_diaria for select to authenticated
  using (mao_de_obra_id = auth.uid());

-- Entregas
drop policy if exists ent_dono on public.entregas;
create policy ent_dono on public.entregas for all to authenticated
  using (eh_dono()) with check (eh_dono());
drop policy if exists ent_mo on public.entregas;
create policy ent_mo on public.entregas for select to authenticated
  using (exists (select 1 from public.lotes l where l.id = lote_id and l.mao_de_obra_id = auth.uid()));

-- Fechamentos
drop policy if exists fech_dono on public.fechamentos;
create policy fech_dono on public.fechamentos for all to authenticated
  using (eh_dono()) with check (eh_dono());
drop policy if exists fech_mo on public.fechamentos;
create policy fech_mo on public.fechamentos for select to authenticated
  using (mao_de_obra_id = auth.uid());

-- Permissões das funções: só usuários logados
revoke execute on function public.enviar_lote, public.confirmar_recebimento, public.lancar_producao,
  public.apagar_producao, public.registrar_entrega, public.conferir_entrega,
  public.desfazer_conferencia, public.fechar_mes, public.reabrir_mes from public, anon;
grant execute on function public.enviar_lote, public.confirmar_recebimento, public.lancar_producao,
  public.apagar_producao, public.registrar_entrega, public.conferir_entrega,
  public.desfazer_conferencia, public.fechar_mes, public.reabrir_mes to authenticated;
