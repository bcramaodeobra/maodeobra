import {
  sb, exigirPapel, sair, modalTrocarSenha, adminUsuarios, rpc, q,
  moeda, inteiro, dataBR, dataHoraBR, isoLocal, inicioMes, nomeMes,
  selo, esc, $, $$, aviso, abrirModal, confirmar,
} from "./comum.js";
import { NOME_FABRICA } from "../config.js";

const perfil = await exigirPapel("dono");
$("#nomeFabrica").textContent = NOME_FABRICA;
$("#quem").textContent = perfil.nome;
$("#btnSair").onclick = sair;
$("#btnSenha").onclick = () => modalTrocarSenha(perfil.usuario);

const main = $("#conteudo");
const cad = { maos: [], produtos: [], servicos: [], precos: [], materiais: [] };
let abaAtual = "inicio";
let subCadastro = "maos";
let filtroLotes = { mo: "", status: "abertos", busca: "" };
let mesFechamento = inicioMes().slice(0, 7);

// ---------------------------------------------------------------
// Cadastros em memória
// ---------------------------------------------------------------
async function carregarCadastros() {
  const [maos, produtos, servicos, precos, materiais] = await Promise.all([
    q(sb.from("perfis").select("*").eq("papel", "mao_de_obra").order("nome")),
    q(sb.from("produtos").select("*").order("nome")),
    q(sb.from("servicos").select("*").order("nome")),
    q(sb.from("precos").select("*")),
    q(sb.from("materiais").select("*").order("nome")),
  ]);
  Object.assign(cad, { maos, produtos, servicos, precos, materiais });
}
const nomePor = (lista, id) => lista.find((x) => String(x.id) === String(id))?.nome ?? "—";
const precoDe = (p, s) => cad.precos.find((x) => x.produto_id == p && x.servico_id == s);
const opcoes = (lista, sel, vazio = "Selecione…") =>
  `<option value="">${vazio}</option>` +
  lista.filter((x) => x.ativo !== false || String(x.id) === String(sel))
    .map((x) => `<option value="${x.id}" ${String(x.id) === String(sel) ? "selected" : ""}>${esc(x.nome)}</option>`).join("");

// ---------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------
$("#abas").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-aba]");
  if (!b) return;
  $$("#abas button").forEach((x) => x.classList.toggle("ativo", x === b));
  abaAtual = b.dataset.aba;
  render();
});

async function render() {
  try {
    if (abaAtual === "inicio") await renderInicio();
    if (abaAtual === "lotes") await renderLotes();
    if (abaAtual === "fechamento") await renderFechamento();
    if (abaAtual === "cadastros") await renderCadastros();
  } catch (e) {
    main.innerHTML = `<div class="card vazio">Erro ao carregar: ${esc(e.message)}</div>`;
  }
}

// ===============================================================
// INÍCIO
// ===============================================================
async function renderInicio() {
  const mes = inicioMes();
  const [abertos, pendentes, resumo] = await Promise.all([
    q(sb.from("v_lotes").select("*").not("status", "in", "(concluido,cancelado)").order("prazo", { ascending: true, nullsFirst: false })),
    q(sb.from("v_entregas").select("*").eq("status", "pendente").order("entregue_em")),
    q(sb.from("v_resumo_mensal").select("*").eq("mes", mes)),
  ]);
  const comMaos = abertos.reduce((s, l) => s + l.qtd_saldo + l.qtd_em_conferencia, 0);
  const aPagar = resumo.filter((r) => !r.pago_em).reduce((s, r) => s + Number(r.valor_total), 0);
  const atrasados = abertos.filter((l) => l.atrasado);

  main.innerHTML = `
    <div class="section-head"><h1>Visão geral</h1><button class="btn acento" id="btnNovoLote">＋ Enviar novo lote</button></div>
    <div class="grid kpis">
      <div class="card kpi"><div class="rotulo">Lotes em aberto</div><div class="valor">${inteiro(abertos.length)}</div></div>
      <div class="card kpi"><div class="rotulo">Peças com as mãos de obra</div><div class="valor">${inteiro(comMaos)}</div></div>
      <div class="card kpi"><div class="rotulo">Entregas para conferir</div><div class="valor">${inteiro(pendentes.length)}</div></div>
      <div class="card kpi destaque"><div class="rotulo">A pagar em ${nomeMes(mes).split(" ")[0].toLowerCase()} (conferido)</div><div class="valor">${moeda(aPagar)}</div></div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Entregas para conferir</h2></div>
      ${pendentes.length ? `<div class="card tabela-wrap"><table>
        <thead><tr><th>Entregue em</th><th>Mão de obra</th><th>Lote</th><th>Produto / serviço</th><th class="right">Peças</th><th></th></tr></thead>
        <tbody>${pendentes.map((e) => `<tr>
          <td>${dataHoraBR(e.entregue_em)}</td><td>${esc(e.mao_de_obra_nome)}</td><td>#${e.lote_id}</td>
          <td>${esc(e.produto_nome)} · ${esc(e.servico_nome)}</td><td class="right num">${inteiro(e.quantidade)}</td>
          <td class="right"><button class="btn ok peq" data-conferir="${e.id}">Conferir</button></td></tr>`).join("")}
        </tbody></table></div>` : `<div class="card vazio">Nenhuma entrega aguardando conferência.</div>`}
    </div>

    <div class="section">
      <div class="section-head"><h2>Lotes atrasados</h2></div>
      ${atrasados.length ? `<div class="grid cards">${atrasados.map(cardLote).join("")}</div>`
        : `<div class="card vazio">Nenhum lote atrasado. 👍</div>`}
    </div>`;

  $("#btnNovoLote").onclick = modalNovoLote;
  ligarAcoesLote(main);
  $$("[data-conferir]", main).forEach((b) => (b.onclick = () => modalConferir(pendentes.find((e) => e.id == b.dataset.conferir))));
}

// ===============================================================
// LOTES
// ===============================================================
function cardLote(l) {
  const pAp = (l.qtd_aprovada / l.quantidade) * 100;
  const pCo = (l.qtd_em_conferencia / l.quantidade) * 100;
  return `<div class="card">
    <div class="lote-topo">
      <div><div class="lote-titulo">#${l.id} · ${esc(l.produto_nome)}</div><div class="muted small">${esc(l.servico_nome)}</div></div>
      <div>${l.atrasado ? selo("atrasado", "Atrasado") : selo(l.status)}</div>
    </div>
    <div style="margin-top:.5rem">
      <div class="lote-linha"><span class="muted">Mão de obra</span><strong>${esc(l.mao_de_obra_nome)}</strong></div>
      <div class="lote-linha"><span class="muted">Quantidade</span><span class="num">${inteiro(l.quantidade)} × ${moeda(l.valor_unitario)}</span></div>
      <div class="lote-linha"><span class="muted">Enviado / prazo</span><span>${dataBR(l.enviado_em)} → ${dataBR(l.prazo)}</span></div>
    </div>
    <div class="progresso"><div class="ap" style="width:${pAp}%"></div><div class="co" style="width:${pCo}%"></div></div>
    <div class="legenda"><span><i style="background:var(--ok)"></i>${inteiro(l.qtd_aprovada)} aprovadas</span>
      <span><i style="background:#e0a43a"></i>${inteiro(l.qtd_em_conferencia)} a conferir</span>
      <span><i style="background:var(--line)"></i>${inteiro(l.qtd_saldo)} faltam</span></div>
    <div class="lote-total"><span>Total do lote</span><span class="num">${moeda(l.valor_total)}</span></div>
    <div class="acoes"><button class="btn sec peq" data-detalhe="${l.id}">Detalhes</button></div>
  </div>`;
}

function ligarAcoesLote(raiz) {
  $$("[data-detalhe]", raiz).forEach((b) => (b.onclick = () => modalDetalheLote(Number(b.dataset.detalhe))));
}

async function renderLotes() {
  let consulta = sb.from("v_lotes").select("*").order("id", { ascending: false }).limit(300);
  if (filtroLotes.mo) consulta = consulta.eq("mao_de_obra_id", filtroLotes.mo);
  if (filtroLotes.status === "abertos") consulta = consulta.not("status", "in", "(concluido,cancelado)");
  else if (filtroLotes.status) consulta = consulta.eq("status", filtroLotes.status);
  let lotes = await q(consulta);
  const b = filtroLotes.busca.trim().toLowerCase();
  if (b) lotes = lotes.filter((l) => `#${l.id} ${l.produto_nome} ${l.servico_nome} ${l.mao_de_obra_nome}`.toLowerCase().includes(b));

  main.innerHTML = `
    <div class="section-head"><h1>Lotes</h1><button class="btn acento" id="btnNovoLote">＋ Enviar novo lote</button></div>
    <div class="card" style="margin-bottom:1rem"><form id="filtros" onsubmit="return false"><div class="linha" style="margin:0">
      <div><label>Mão de obra</label><select name="mo">${opcoes(cad.maos, filtroLotes.mo, "Todas")}</select></div>
      <div><label>Situação</label><select name="status">
        ${[["abertos","Em aberto"],["","Todos"],["enviado","Enviado"],["recebido","Recebido"],["em_producao","Em produção"],["concluido","Concluído"],["cancelado","Cancelado"]]
          .map(([v,t]) => `<option value="${v}" ${filtroLotes.status === v ? "selected" : ""}>${t}</option>`).join("")}
      </select></div>
      <div><label>Buscar</label><input name="busca" value="${esc(filtroLotes.busca)}" placeholder="Nº, produto, serviço…"></div>
    </div></form></div>
    ${lotes.length ? `<div class="grid cards">${lotes.map(cardLote).join("")}</div>` : `<div class="card vazio">Nenhum lote encontrado.</div>`}`;

  $("#btnNovoLote").onclick = modalNovoLote;
  const f = $("#filtros");
  f.mo.onchange = f.status.onchange = () => { filtroLotes.mo = f.mo.value; filtroLotes.status = f.status.value; renderLotes(); };
  let t; f.busca.oninput = () => { clearTimeout(t); t = setTimeout(() => { filtroLotes.busca = f.busca.value; renderLotes().then(() => { const i = $("#filtros").busca; i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 300); };
  ligarAcoesLote(main);
}

function modalNovoLote() {
  if (!cad.maos.some((m) => m.ativo)) return aviso("Cadastre uma mão de obra primeiro (Cadastros).", true);
  if (!cad.precos.length) return aviso("Cadastre produtos, serviços e preços primeiro (Cadastros).", true);

  const linhaMaterial = () => `<div class="linha mat" style="grid-template-columns:2fr 1fr auto;align-items:end">
      <div><label>Material</label><select name="mat_id">${opcoes(cad.materiais)}</select></div>
      <div><label>Qtd</label><input name="mat_qtd" type="number" min="0" step="0.01"></div>
      <button type="button" class="btn perigo peq" data-rm>✕</button></div>`;

  abrirModal({
    titulo: "Enviar novo lote",
    conteudo: `
      <div class="linha"><div><label>Mão de obra *</label><select name="mo" required>${opcoes(cad.maos)}</select></div></div>
      <div class="linha">
        <div><label>Produto *</label><select name="produto" required>${opcoes(cad.produtos)}</select></div>
        <div><label>Serviço *</label><select name="servico" required>${opcoes(cad.servicos)}</select></div>
      </div>
      <div class="linha">
        <div><label>Quantidade *</label><input name="quantidade" type="number" min="1" step="1" required></div>
        <div><label>Valor por peça (R$)</label><input name="valor" type="number" min="0" step="0.01"></div>
        <div><label>Prazo</label><input name="prazo" type="date"></div>
      </div>
      <div class="lote-total" style="margin:0 0 .8rem"><span>Total do lote</span><span id="prevTotal">R$ 0,00</span></div>
      <h3>Materiais enviados</h3>
      <div id="mats"></div>
      <button type="button" class="btn sec peq" id="addMat" style="margin-bottom:.8rem">＋ Material</button>
      <div class="linha"><div><label>Observações</label><textarea name="obs" placeholder="Cores, posição do bordado, detalhes…"></textarea></div></div>
      <button type="submit" class="btn bloco acento">Enviar lote</button>`,
    aoAbrir: (form) => {
      const mats = $("#mats", form);
      const atualiza = () => {
        const p = precoDe(form.produto.value, form.servico.value);
        if (document.activeElement !== form.valor) form.valor.value = p ? p.valor_unitario : "";
        const total = Number(form.quantidade.value || 0) * Number(form.valor.value || 0);
        $("#prevTotal", form).textContent = moeda(total);
      };
      form.produto.onchange = form.servico.onchange = atualiza;
      form.quantidade.oninput = form.valor.oninput = atualiza;
      $("#addMat", form).onclick = () => mats.insertAdjacentHTML("beforeend", linhaMaterial());
      mats.addEventListener("click", (e) => e.target.closest("[data-rm]")?.closest(".mat").remove());
      if (cad.materiais.length) mats.insertAdjacentHTML("beforeend", linhaMaterial());
    },
    onSubmit: async (fd, form) => {
      if (!fd.get("mo") || !fd.get("produto") || !fd.get("servico")) throw new Error("Preencha mão de obra, produto e serviço.");
      const qtd = parseInt(fd.get("quantidade"), 10);
      if (!(qtd > 0)) throw new Error("Informe a quantidade.");
      const materiais = $$(".mat", form)
        .map((r) => ({ material_id: Number($("[name=mat_id]", r).value), quantidade: Number($("[name=mat_qtd]", r).value) }))
        .filter((m) => m.material_id && m.quantidade > 0);
      const id = await rpc("enviar_lote", {
        p_mao_de_obra: fd.get("mo"), p_produto: Number(fd.get("produto")), p_servico: Number(fd.get("servico")),
        p_quantidade: qtd, p_prazo: fd.get("prazo") || null, p_observacoes: fd.get("obs") || null,
        p_valor_unitario: fd.get("valor") === "" ? null : Number(fd.get("valor")), p_materiais: materiais,
      });
      aviso(`Lote #${id} enviado!`);
      render();
    },
  });
}

async function modalDetalheLote(id) {
  const [[l], mats, entregas, producao] = await Promise.all([
    q(sb.from("v_lotes").select("*").eq("id", id)),
    q(sb.from("lote_materiais").select("*, materiais(nome, unidade)").eq("lote_id", id)),
    q(sb.from("entregas").select("*").eq("lote_id", id).order("entregue_em")),
    q(sb.from("producao_diaria").select("*").eq("lote_id", id).order("data")),
  ]);
  const aberto = !["concluido", "cancelado"].includes(l.status);

  const m = abrirModal({
    titulo: `Lote #${l.id}`,
    conteudo: `
      <div class="lote-topo"><div><strong>${esc(l.produto_nome)}</strong> · ${esc(l.servico_nome)}<div class="muted small">${esc(l.mao_de_obra_nome)}</div></div>${selo(l.status)}</div>
      <div style="margin:.6rem 0">
        <div class="lote-linha"><span class="muted">Quantidade</span><span>${inteiro(l.quantidade)} × ${moeda(l.valor_unitario)} = <strong>${moeda(l.valor_total)}</strong></span></div>
        <div class="lote-linha"><span class="muted">Enviado</span><span>${dataHoraBR(l.enviado_em)}</span></div>
        <div class="lote-linha"><span class="muted">Recebido</span><span>${dataHoraBR(l.recebido_em)}</span></div>
        <div class="lote-linha"><span class="muted">Prazo</span><span>${dataBR(l.prazo)}</span></div>
        <div class="lote-linha"><span class="muted">Aprovadas / a conferir / faltam</span><span class="num">${inteiro(l.qtd_aprovada)} / ${inteiro(l.qtd_em_conferencia)} / ${inteiro(l.qtd_saldo)}</span></div>
        <div class="lote-linha"><span class="muted">Produção lançada pela mão de obra</span><span class="num">${inteiro(l.qtd_produzida_lancada)}</span></div>
        <div class="lote-linha"><span class="muted">Valor aprovado até agora</span><strong>${moeda(l.valor_aprovado)}</strong></div>
      </div>
      ${l.observacoes ? `<p class="small"><strong>Obs.:</strong> ${esc(l.observacoes)}</p>` : ""}

      <h3>Materiais</h3>
      ${mats.length ? `<table><thead><tr><th>Material</th><th class="right">Enviado</th><th class="right">Voltou</th></tr></thead><tbody>
        ${mats.map((x) => `<tr><td>${esc(x.materiais?.nome)}</td><td class="right num">${inteiro(x.quantidade)} ${esc(x.materiais?.unidade)}</td>
          <td class="right"><input type="number" step="0.01" min="0" style="width:90px" data-dev="${x.id}" value="${x.devolvido}"></td></tr>`).join("")}
        </tbody></table>` : `<p class="muted small">Nenhum material registrado.</p>`}

      <h3 style="margin-top:1rem">Entregas</h3>
      ${entregas.length ? `<table><thead><tr><th>Data</th><th class="right">Peças</th><th class="right">Aprov.</th><th class="right">Refazer</th><th></th></tr></thead><tbody>
        ${entregas.map((e) => `<tr><td>${dataBR(e.entregue_em)}</td><td class="right num">${e.quantidade}</td>
          <td class="right num">${e.quantidade_aprovada ?? "—"}</td><td class="right num">${e.status === "conferida" ? e.quantidade_retorno : "—"}</td>
          <td class="right">${e.status === "pendente" ? `<button type="button" class="btn ok peq" data-conf="${e.id}">Conferir</button>`
            : `<button type="button" class="btn sec peq" data-desf="${e.id}" title="Desfazer conferência">↺</button>`}</td></tr>`).join("")}
        </tbody></table>` : `<p class="muted small">Nenhuma entrega ainda.</p>`}

      ${producao.length ? `<details style="margin-top:.8rem"><summary class="small">Produção diária lançada (${producao.length})</summary>
        <ul class="small">${producao.map((p) => `<li>${dataBR(p.data)}: ${p.quantidade} peças${p.observacao ? " — " + esc(p.observacao) : ""}</li>`).join("")}</ul></details>` : ""}

      <div class="acoes">
        ${aberto ? `<button type="button" class="btn peq" id="btnEntregaDono">Registrar entrega</button>` : ""}
        ${aberto && l.qtd_aprovada === 0 ? `<button type="button" class="btn perigo peq" id="btnCancelar">Cancelar lote</button>` : ""}
        ${mats.length ? `<button type="button" class="btn sec peq" id="btnSalvarMat">Salvar materiais</button>` : ""}
      </div>`,
  });
  const raiz = m.form;
  $$("[data-conf]", raiz).forEach((b) => (b.onclick = () => {
    const e = entregas.find((x) => x.id == b.dataset.conf);
    m.fechar(); modalConferir({ ...e, mao_de_obra_nome: l.mao_de_obra_nome, produto_nome: l.produto_nome, servico_nome: l.servico_nome, valor_unitario: l.valor_unitario });
  }));
  $$("[data-desf]", raiz).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Desfazer esta conferência? A entrega volta para 'a conferir'."))) return;
    try { await rpc("desfazer_conferencia", { p_entrega: Number(b.dataset.desf) }); aviso("Conferência desfeita."); m.fechar(); render(); }
    catch (e) { aviso(e.message, true); }
  }));
  $("#btnSalvarMat", raiz)?.addEventListener("click", async () => {
    try {
      for (const i of $$("[data-dev]", raiz)) await q(sb.from("lote_materiais").update({ devolvido: Number(i.value || 0) }).eq("id", i.dataset.dev));
      aviso("Materiais atualizados.");
    } catch (e) { aviso(e.message, true); }
  });
  $("#btnCancelar", raiz)?.addEventListener("click", async () => {
    if (!(await confirmar(`Cancelar o lote #${l.id}?`, "Cancelar lote"))) return;
    try { await q(sb.from("lotes").update({ status: "cancelado" }).eq("id", l.id)); aviso("Lote cancelado."); m.fechar(); render(); }
    catch (e) { aviso(e.message, true); }
  });
  $("#btnEntregaDono", raiz)?.addEventListener("click", () => {
    m.fechar();
    abrirModal({
      titulo: `Registrar entrega — lote #${l.id}`,
      conteudo: `<p class="muted small">Faltam ${inteiro(l.qtd_saldo)} peças. Use quando a mão de obra trouxe peças sem lançar no app.</p>
        <div class="linha"><div><label>Peças entregues</label><input name="qtd" type="number" min="1" max="${l.qtd_saldo}" value="${l.qtd_saldo}"></div></div>
        <div class="linha"><div><label>Observação</label><input name="obs"></div></div>
        <button type="submit" class="btn bloco">Registrar</button>`,
      onSubmit: async (fd) => {
        await rpc("registrar_entrega", { p_lote: l.id, p_quantidade: parseInt(fd.get("qtd"), 10), p_observacao: fd.get("obs") || null });
        aviso("Entrega registrada. Agora é só conferir."); render();
      },
    });
  });
}

function modalConferir(e) {
  abrirModal({
    titulo: `Conferir entrega — lote #${e.lote_id}`,
    conteudo: `
      <p><strong>${esc(e.mao_de_obra_nome)}</strong> entregou <strong>${inteiro(e.quantidade)}</strong> peças<br>
      <span class="muted small">${esc(e.produto_nome)} · ${esc(e.servico_nome)} · ${moeda(e.valor_unitario)} por peça</span></p>
      ${e.observacao ? `<p class="small">Obs. da mão de obra: ${esc(e.observacao)}</p>` : ""}
      <div class="linha">
        <div><label>Aprovadas (serão pagas)</label><input name="aprov" type="number" min="0" max="${e.quantidade}" value="${e.quantidade}"></div>
        <div><label>Voltam para refazer</label><input name="ret" type="number" min="0" max="${e.quantidade}" value="0"></div>
      </div>
      <p class="small muted" id="resumoConf"></p>
      <div class="linha"><div><label>Observação da conferência</label><input name="obs" placeholder="Ex.: 2 com linha solta"></div></div>
      <button type="submit" class="btn bloco ok">Confirmar conferência</button>`,
    aoAbrir: (form) => {
      const at = () => {
        const a = Number(form.aprov.value || 0), r = Number(form.ret.value || 0), perda = e.quantidade - a - r;
        $("#resumoConf", form).innerHTML = `Valor a pagar: <strong>${moeda(a * e.valor_unitario)}</strong>` +
          (r ? ` · ${r} voltam ao saldo do lote` : "") + (perda > 0 ? ` · ${perda} perdidas (não pagas)` : "") +
          (perda < 0 ? ` · <span style="color:var(--bad)">passa do total entregue</span>` : "");
      };
      form.aprov.oninput = form.ret.oninput = at; at();
    },
    onSubmit: async (fd) => {
      await rpc("conferir_entrega", {
        p_entrega: e.id, p_aprovada: parseInt(fd.get("aprov") || 0, 10),
        p_retorno: parseInt(fd.get("ret") || 0, 10), p_observacao: fd.get("obs") || null,
      });
      aviso("Entrega conferida!"); render();
    },
  });
}

// ===============================================================
// FECHAMENTO MENSAL
// ===============================================================
async function renderFechamento() {
  const mes = `${mesFechamento}-01`;
  const proximo = new Date(Number(mesFechamento.slice(0, 4)), Number(mesFechamento.slice(5, 7)), 1);
  const [resumo, pendentes] = await Promise.all([
    q(sb.from("v_resumo_mensal").select("*").eq("mes", mes).order("mao_de_obra_nome")),
    q(sb.from("v_entregas").select("id, mao_de_obra_nome").eq("status", "pendente").lt("entregue_em", proximo.toISOString())),
  ]);
  const total = resumo.reduce((s, r) => s + Number(r.valor_total), 0);
  const pago = resumo.filter((r) => r.pago_em).reduce((s, r) => s + Number(r.valor_total), 0);

  main.innerHTML = `
    <div class="section-head"><h1>Fechamento mensal</h1>
      <div style="display:flex;gap:.5rem;align-items:center"><input type="month" id="mesSel" value="${mesFechamento}" style="width:auto"></div></div>
    ${pendentes.length ? `<div class="alerta">⚠️ Há ${pendentes.length} entrega(s) ainda não conferida(s). Elas só entram no fechamento depois de conferidas.</div>` : ""}
    <div class="grid kpis">
      <div class="card kpi destaque"><div class="rotulo">Total do mês</div><div class="valor">${moeda(total)}</div></div>
      <div class="card kpi"><div class="rotulo">Já pago</div><div class="valor">${moeda(pago)}</div></div>
      <div class="card kpi"><div class="rotulo">Falta pagar</div><div class="valor">${moeda(total - pago)}</div></div>
    </div>
    ${resumo.length ? `<div class="card tabela-wrap"><table>
      <thead><tr><th>Mão de obra</th><th class="right">Peças</th><th class="right">Valor</th><th>Situação</th><th></th></tr></thead>
      <tbody>${resumo.map((r) => `<tr>
        <td>${esc(r.mao_de_obra_nome)}</td><td class="right num">${inteiro(r.quantidade)}</td><td class="right num"><strong>${moeda(r.valor_total)}</strong></td>
        <td>${r.pago_em ? selo("pago", "Pago em " + dataBR(r.pago_em)) : selo("aberto", "Em aberto")}</td>
        <td class="right" style="white-space:nowrap">
          <button class="btn sec peq" data-det="${r.mao_de_obra_id}">Detalhes</button>
          ${r.pago_em ? `<button class="btn perigo peq" data-reabrir="${r.fechamento_id}">Reabrir</button>`
            : `<button class="btn ok peq" data-pagar="${r.mao_de_obra_id}">Fechar e pagar</button>`}
        </td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Total</td><td class="right num">${inteiro(resumo.reduce((s, r) => s + Number(r.quantidade), 0))}</td><td class="right num">${moeda(total)}</td><td colspan="2"></td></tr></tfoot>
    </table></div>` : `<div class="card vazio">Nenhuma entrega conferida em ${nomeMes(mes)}.</div>`}`;

  $("#mesSel").onchange = (e) => { mesFechamento = e.target.value || mesFechamento; renderFechamento(); };
  $$("[data-det]", main).forEach((b) => (b.onclick = () => detalheFechamento(b.dataset.det, mes)));
  $$("[data-pagar]", main).forEach((b) => (b.onclick = async () => {
    const r = resumo.find((x) => x.mao_de_obra_id === b.dataset.pagar);
    if (!(await confirmar(`Fechar ${nomeMes(mes)} de ${r.mao_de_obra_nome} e marcar ${moeda(r.valor_total)} como pago? As entregas deste mês ficarão travadas.`, "Fechar e pagar"))) return;
    try { await rpc("fechar_mes", { p_mao_de_obra: r.mao_de_obra_id, p_mes: mes }); aviso("Mês fechado!"); renderFechamento(); }
    catch (e) { aviso(e.message, true); }
  }));
  $$("[data-reabrir]", main).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Reabrir este fechamento? O pagamento volta para 'em aberto'.", "Reabrir"))) return;
    try { await rpc("reabrir_mes", { p_fechamento: Number(b.dataset.reabrir) }); aviso("Fechamento reaberto."); renderFechamento(); }
    catch (e) { aviso(e.message, true); }
  }));
}

async function detalheFechamento(moId, mes) {
  const itens = await q(sb.from("v_entregas").select("*").eq("mao_de_obra_id", moId).eq("mes_ref", mes).eq("status", "conferida").order("conferido_em"));
  const mo = cad.maos.find((m) => m.id === moId);
  const total = itens.reduce((s, i) => s + Number(i.valor), 0);
  const tabela = `<table><thead><tr><th>Data</th><th>Lote</th><th>Produto / serviço</th><th class="right">Peças</th><th class="right">R$/peça</th><th class="right">Valor</th></tr></thead>
    <tbody>${itens.map((i) => `<tr><td>${dataBR(i.conferido_em)}</td><td>#${i.lote_id}</td><td>${esc(i.produto_nome)} · ${esc(i.servico_nome)}</td>
      <td class="right">${inteiro(i.quantidade_aprovada)}</td><td class="right">${moeda(i.valor_unitario)}</td><td class="right">${moeda(i.valor)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="3">Total</td><td class="right">${inteiro(itens.reduce((s, i) => s + i.quantidade_aprovada, 0))}</td><td></td><td class="right">${moeda(total)}</td></tr></tfoot></table>`;

  const m = abrirModal({
    titulo: `${mo?.nome ?? ""} — ${nomeMes(mes)}`,
    conteudo: `<div class="tabela-wrap">${tabela}</div><div class="acoes"><button type="button" class="btn sec" id="btnImprimir">🖨️ Imprimir recibo</button></div>`,
  });
  $("#btnImprimir", m.form).onclick = () => {
    const w = window.open("", "_blank");
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo ${esc(mo?.nome)} ${nomeMes(mes)}</title>
      <link rel="stylesheet" href="${new URL("css/style.css", location.href)}"></head><body style="background:#fff;padding:1.5rem">
      <h1>${esc(NOME_FABRICA)} — Recibo de serviços</h1>
      <p><strong>Mão de obra:</strong> ${esc(mo?.nome)}<br><strong>Período:</strong> ${nomeMes(mes)}</p>${tabela}
      <p style="margin-top:2.5rem">Recebi a importância de <strong>${moeda(total)}</strong> referente aos serviços acima.</p>
      <p style="margin-top:3rem">_______________________________________<br>${esc(mo?.nome)}</p>
      <script>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  };
}

// ===============================================================
// CADASTROS
// ===============================================================
async function renderCadastros() {
  await carregarCadastros();
  const sub = [["maos", "Mãos de obra"], ["produtos", "Produtos"], ["servicos", "Serviços"], ["precos", "Preços"], ["materiais", "Materiais"]];
  main.innerHTML = `<h1>Cadastros</h1>
    <div class="subtabs">${sub.map(([k, t]) => `<button data-sub="${k}" class="${subCadastro === k ? "ativo" : ""}">${t}</button>`).join("")}</div>
    <div id="areaCad"></div>`;
  $$("[data-sub]", main).forEach((b) => (b.onclick = () => { subCadastro = b.dataset.sub; renderCadastros(); }));
  const area = $("#areaCad");
  if (subCadastro === "maos") cadMaos(area);
  if (subCadastro === "produtos") cadSimples(area, "produtos", "Produto");
  if (subCadastro === "servicos") cadSimples(area, "servicos", "Serviço");
  if (subCadastro === "precos") cadPrecos(area);
  if (subCadastro === "materiais") cadMateriais(area);
}

// ----- Mãos de obra -----
function cadMaos(area) {
  area.innerHTML = `
    <div class="section-head"><p class="muted small" style="margin:0">Cada mão de obra entra com o próprio usuário e senha.</p><button class="btn" id="novoMo">＋ Nova mão de obra</button></div>
    ${cad.maos.length ? `<div class="card tabela-wrap"><table>
      <thead><tr><th>Nome</th><th>Usuário</th><th>Telefone</th><th>Endereço</th><th>Situação</th><th></th></tr></thead>
      <tbody>${cad.maos.map((m) => `<tr>
        <td><strong>${esc(m.nome)}</strong></td><td>${esc(m.usuario)}</td>
        <td>${m.telefone ? `<a href="https://wa.me/55${esc(m.telefone.replace(/\D/g, ""))}" target="_blank" rel="noopener">${esc(m.telefone)}</a>` : "—"}</td>
        <td class="small">${esc(m.endereco || "—")}</td>
        <td>${m.ativo ? selo("conferida", "Ativo") : selo("inativo", "Inativo")}</td>
        <td class="right" style="white-space:nowrap">
          <button class="btn sec peq" data-ed="${m.id}">Editar</button>
          <button class="btn sec peq" data-senha="${m.id}">Senha</button>
          <button class="btn ${m.ativo ? "perigo" : "ok"} peq" data-at="${m.id}">${m.ativo ? "Desativar" : "Ativar"}</button>
        </td></tr>`).join("")}</tbody></table></div>` : `<div class="card vazio">Nenhuma mão de obra cadastrada.</div>`}`;

  $("#novoMo").onclick = () => abrirModal({
    titulo: "Nova mão de obra",
    conteudo: `
      <div class="linha"><div><label>Nome completo *</label><input name="nome" required></div></div>
      <div class="linha">
        <div><label>Usuário (login) *</label><input name="usuario" required autocapitalize="none" placeholder="ex.: maria.silva"></div>
        <div><label>Senha inicial *</label><input name="senha" required minlength="6" placeholder="mín. 6 caracteres"></div>
      </div>
      <div class="linha"><div><label>Telefone / WhatsApp</label><input name="telefone" inputmode="tel"></div></div>
      <div class="linha"><div><label>Endereço</label><input name="endereco"></div></div>
      <div class="linha"><div><label>Observações</label><textarea name="observacoes"></textarea></div></div>
      <button type="submit" class="btn bloco">Criar acesso</button>`,
    onSubmit: async (fd) => {
      await adminUsuarios({ acao: "criar", ...Object.fromEntries(fd) });
      aviso(`Acesso criado! Usuário: ${String(fd.get("usuario")).toLowerCase()}`);
      renderCadastros();
    },
  });

  $$("[data-ed]", area).forEach((b) => (b.onclick = () => {
    const m = cad.maos.find((x) => x.id === b.dataset.ed);
    abrirModal({
      titulo: `Editar ${m.nome}`,
      conteudo: `
        <div class="linha"><div><label>Nome</label><input name="nome" value="${esc(m.nome)}" required></div></div>
        <div class="linha"><div><label>Telefone / WhatsApp</label><input name="telefone" value="${esc(m.telefone)}"></div></div>
        <div class="linha"><div><label>Endereço</label><input name="endereco" value="${esc(m.endereco)}"></div></div>
        <div class="linha"><div><label>Observações</label><textarea name="observacoes">${esc(m.observacoes)}</textarea></div></div>
        <p class="muted small">Usuário: <strong>${esc(m.usuario)}</strong> (não pode ser alterado)</p>
        <button type="submit" class="btn bloco">Salvar</button>`,
      onSubmit: async (fd) => {
        await q(sb.from("perfis").update({
          nome: fd.get("nome"), telefone: fd.get("telefone") || null,
          endereco: fd.get("endereco") || null, observacoes: fd.get("observacoes") || null,
        }).eq("id", m.id));
        aviso("Salvo!"); renderCadastros();
      },
    });
  }));

  $$("[data-senha]", area).forEach((b) => (b.onclick = () => {
    const m = cad.maos.find((x) => x.id === b.dataset.senha);
    abrirModal({
      titulo: `Nova senha para ${m.nome}`,
      conteudo: `<div class="linha"><div><label>Nova senha (mín. 6)</label><input name="senha" required minlength="6"></div></div>
        <p class="muted small">Passe a nova senha para ${esc(m.nome)}. Ela poderá trocar depois no próprio painel.</p>
        <button type="submit" class="btn bloco">Redefinir senha</button>`,
      onSubmit: async (fd) => { await adminUsuarios({ acao: "redefinir_senha", id: m.id, senha: fd.get("senha") }); aviso("Senha redefinida!"); },
    });
  }));

  $$("[data-at]", area).forEach((b) => (b.onclick = async () => {
    const m = cad.maos.find((x) => x.id === b.dataset.at);
    const acao = m.ativo ? "desativar" : "ativar";
    if (!(await confirmar(`${m.ativo ? "Desativar" : "Ativar"} o acesso de ${m.nome}?`))) return;
    try { await adminUsuarios({ acao, id: m.id }); aviso("Pronto!"); renderCadastros(); } catch (e) { aviso(e.message, true); }
  }));
}

// ----- Produtos / Serviços -----
function cadSimples(area, tabela, rotulo) {
  const lista = cad[tabela];
  area.innerHTML = `
    <div class="section-head"><span></span><button class="btn" id="novo">＋ Novo ${rotulo.toLowerCase()}</button></div>
    ${lista.length ? `<div class="card tabela-wrap"><table><thead><tr><th>Nome</th><th>Descrição</th><th>Situação</th><th></th></tr></thead>
      <tbody>${lista.map((x) => `<tr><td><strong>${esc(x.nome)}</strong></td><td class="small">${esc(x.descricao || "—")}</td>
        <td>${x.ativo ? selo("conferida", "Ativo") : selo("inativo", "Inativo")}</td>
        <td class="right"><button class="btn sec peq" data-ed="${x.id}">Editar</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="card vazio">Nenhum ${rotulo.toLowerCase()} cadastrado.</div>`}`;

  const form = (x = {}) => abrirModal({
    titulo: x.id ? `Editar ${rotulo.toLowerCase()}` : `Novo ${rotulo.toLowerCase()}`,
    conteudo: `
      <div class="linha"><div><label>Nome *</label><input name="nome" value="${esc(x.nome)}" required></div></div>
      <div class="linha"><div><label>Descrição</label><textarea name="descricao">${esc(x.descricao)}</textarea></div></div>
      ${x.id ? `<label style="display:flex;gap:.5rem;align-items:center;margin-bottom:.8rem"><input type="checkbox" name="ativo" style="width:auto" ${x.ativo ? "checked" : ""}> Ativo</label>` : ""}
      <button type="submit" class="btn bloco">Salvar</button>`,
    onSubmit: async (fd) => {
      if (!fd.get("nome")) throw new Error("Informe o nome.");
      const dados = { nome: fd.get("nome"), descricao: fd.get("descricao") || null };
      if (x.id) await q(sb.from(tabela).update({ ...dados, ativo: fd.get("ativo") === "on" }).eq("id", x.id));
      else await q(sb.from(tabela).insert(dados));
      aviso("Salvo!"); renderCadastros();
    },
  });
  $("#novo").onclick = () => form();
  $$("[data-ed]", area).forEach((b) => (b.onclick = () => form(lista.find((x) => x.id == b.dataset.ed))));
}

// ----- Preços (produto + serviço) -----
function cadPrecos(area) {
  const linhas = cad.precos.map((p) => ({ ...p, produto: nomePor(cad.produtos, p.produto_id), servico: nomePor(cad.servicos, p.servico_id) }))
    .sort((a, b) => a.produto.localeCompare(b.produto) || a.servico.localeCompare(b.servico));
  area.innerHTML = `
    <div class="section-head"><p class="muted small" style="margin:0">Valor pago à mão de obra por peça. Mudar o preço não altera lotes já enviados.</p>
      <button class="btn" id="novo">＋ Novo preço</button></div>
    ${linhas.length ? `<div class="card tabela-wrap"><table><thead><tr><th>Produto</th><th>Serviço</th><th class="right">R$ por peça</th><th></th></tr></thead>
      <tbody>${linhas.map((p) => `<tr><td>${esc(p.produto)}</td><td>${esc(p.servico)}</td><td class="right num"><strong>${moeda(p.valor_unitario)}</strong></td>
        <td class="right" style="white-space:nowrap"><button class="btn sec peq" data-ed="${p.id}">Editar</button> <button class="btn perigo peq" data-rm="${p.id}">Excluir</button></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="card vazio">${cad.produtos.length && cad.servicos.length ? "Nenhum preço cadastrado." : "Cadastre produtos e serviços antes dos preços."}</div>`}`;

  const form = (p = {}) => abrirModal({
    titulo: p.id ? "Editar preço" : "Novo preço",
    conteudo: `
      <div class="linha">
        <div><label>Produto *</label><select name="produto" ${p.id ? "disabled" : ""}>${opcoes(cad.produtos, p.produto_id)}</select></div>
        <div><label>Serviço *</label><select name="servico" ${p.id ? "disabled" : ""}>${opcoes(cad.servicos, p.servico_id)}</select></div>
      </div>
      <div class="linha"><div><label>Valor por peça (R$) *</label><input name="valor" type="number" step="0.01" min="0" value="${p.valor_unitario ?? ""}" required></div></div>
      <button type="submit" class="btn bloco">Salvar</button>`,
    onSubmit: async (fd) => {
      const valor = Number(fd.get("valor"));
      if (fd.get("valor") === "" || valor < 0) throw new Error("Informe o valor.");
      if (p.id) await q(sb.from("precos").update({ valor_unitario: valor, atualizado_em: new Date().toISOString() }).eq("id", p.id));
      else {
        if (!fd.get("produto") || !fd.get("servico")) throw new Error("Escolha produto e serviço.");
        await q(sb.from("precos").upsert({ produto_id: Number(fd.get("produto")), servico_id: Number(fd.get("servico")), valor_unitario: valor }, { onConflict: "produto_id,servico_id" }));
      }
      aviso("Preço salvo!"); renderCadastros();
    },
  });
  $("#novo").onclick = () => form();
  $$("[data-ed]", area).forEach((b) => (b.onclick = () => form(cad.precos.find((x) => x.id == b.dataset.ed))));
  $$("[data-rm]", area).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Excluir este preço?", "Excluir"))) return;
    try { await q(sb.from("precos").delete().eq("id", b.dataset.rm)); aviso("Excluído."); renderCadastros(); } catch (e) { aviso(e.message, true); }
  }));
}

// ----- Materiais -----
function cadMateriais(area) {
  area.innerHTML = `
    <div class="section-head"><span></span><button class="btn" id="novo">＋ Novo material</button></div>
    ${cad.materiais.length ? `<div class="card tabela-wrap"><table><thead><tr><th>Material</th><th>Unidade</th><th class="right">Custo unitário</th><th>Situação</th><th></th></tr></thead>
      <tbody>${cad.materiais.map((x) => `<tr><td><strong>${esc(x.nome)}</strong></td><td>${esc(x.unidade)}</td><td class="right num">${moeda(x.custo_unitario)}</td>
        <td>${x.ativo ? selo("conferida", "Ativo") : selo("inativo", "Inativo")}</td>
        <td class="right"><button class="btn sec peq" data-ed="${x.id}">Editar</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="card vazio">Nenhum material cadastrado.</div>`}`;

  const form = (x = {}) => abrirModal({
    titulo: x.id ? "Editar material" : "Novo material",
    conteudo: `
      <div class="linha"><div><label>Nome *</label><input name="nome" value="${esc(x.nome)}" required placeholder="Ex.: Linha branca 120"></div></div>
      <div class="linha">
        <div><label>Unidade</label><input name="unidade" value="${esc(x.unidade ?? "un")}" placeholder="un, m, cone, rolo…"></div>
        <div><label>Custo unitário (R$)</label><input name="custo" type="number" step="0.01" min="0" value="${x.custo_unitario ?? 0}"></div>
      </div>
      ${x.id ? `<label style="display:flex;gap:.5rem;align-items:center;margin-bottom:.8rem"><input type="checkbox" name="ativo" style="width:auto" ${x.ativo ? "checked" : ""}> Ativo</label>` : ""}
      <button type="submit" class="btn bloco">Salvar</button>`,
    onSubmit: async (fd) => {
      if (!fd.get("nome")) throw new Error("Informe o nome.");
      const dados = { nome: fd.get("nome"), unidade: fd.get("unidade") || "un", custo_unitario: Number(fd.get("custo") || 0) };
      if (x.id) await q(sb.from("materiais").update({ ...dados, ativo: fd.get("ativo") === "on" }).eq("id", x.id));
      else await q(sb.from("materiais").insert(dados));
      aviso("Salvo!"); renderCadastros();
    },
  });
  $("#novo").onclick = () => form();
  $$("[data-ed]", area).forEach((b) => (b.onclick = () => form(cad.materiais.find((x) => x.id == b.dataset.ed))));
}

// ---------------------------------------------------------------
await carregarCadastros();
render();
