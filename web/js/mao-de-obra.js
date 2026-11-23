import {
  sb, exigirPapel, sair, modalTrocarSenha, rpc, q,
  moeda, inteiro, dataBR, dataHoraBR, isoLocal, inicioSemana, inicioMes, nomeMes,
  selo, esc, $, $$, aviso, abrirModal, confirmar,
} from "./comum.js";
import { NOME_FABRICA } from "../config.js";

const perfil = await exigirPapel("mao_de_obra");
$("#nomeFabrica").textContent = NOME_FABRICA;
$("#quem").textContent = perfil.nome.split(" ")[0];

const main = $("#conteudo");
const lateral = $("#lateral");
const fundo = $("#lateralFundo");
const desktop = () => matchMedia("(min-width: 1000px)").matches;

// ---------------------------------------------------------------
// Menu lateral recolhível
// ---------------------------------------------------------------
function lerPref() { try { return localStorage.getItem("lateral-recolhida") === "1"; } catch { return false; } }
function salvarPref(v) { try { localStorage.setItem("lateral-recolhida", v ? "1" : "0"); } catch { /* ignore */ } }
if (lerPref()) document.body.classList.add("lateral-recolhida");

$("#btnMenu").onclick = () => {
  if (desktop()) {
    const r = document.body.classList.toggle("lateral-recolhida");
    salvarPref(r);
  } else {
    const aberta = lateral.classList.toggle("aberta");
    fundo.classList.toggle("hidden", !aberta);
  }
};
fundo.onclick = () => { lateral.classList.remove("aberta"); fundo.classList.add("hidden"); };

// ---------------------------------------------------------------
// Dados
// ---------------------------------------------------------------
async function carregar() {
  const hoje = isoLocal();
  const mes = inicioMes();
  const [lotes, mats, producaoMes, entregasMes, pendentes, fechamentos] = await Promise.all([
    q(sb.from("v_lotes").select("*").order("enviado_em", { ascending: false }).limit(60)),
    q(sb.from("lote_materiais").select("*, materiais(nome, unidade)")),
    q(sb.from("v_producao").select("*").gte("data", mes).order("data", { ascending: false }).order("criado_em", { ascending: false })),
    q(sb.from("v_entregas").select("*").eq("status", "conferida").eq("mes_ref", mes)),
    q(sb.from("v_entregas").select("*").eq("status", "pendente")),
    q(sb.from("fechamentos").select("*").order("mes", { ascending: false }).limit(6)),
  ]);
  return { hoje, mes, lotes, mats, producaoMes, entregasMes, pendentes, fechamentos };
}

async function render() {
  let d;
  try { d = await carregar(); }
  catch (e) { main.innerHTML = `<div class="card vazio">Erro ao carregar: ${esc(e.message)}</div>`; return; }
  renderLateral(d);
  renderPrincipal(d);
}

// ---------------------------------------------------------------
// Menu lateral: dia, semana, mês e acumulado
// ---------------------------------------------------------------
function renderLateral(d) {
  const semana = inicioSemana();
  const soma = (lista, campo) => lista.reduce((s, x) => s + Number(x[campo] || 0), 0);
  const doDia = d.producaoMes.filter((p) => p.data === d.hoje);
  const daSemana = d.producaoMes.filter((p) => p.data >= semana);

  // Agrupa a semana por dia
  const porDia = {};
  daSemana.forEach((p) => { porDia[p.data] = (porDia[p.data] || 0) + p.quantidade; });
  const diasSemana = Object.keys(porDia).sort().reverse();

  // Agrupa o mês por semana (segunda a domingo)
  const porSemana = {};
  d.producaoMes.forEach((p) => {
    const [a, m, dia] = p.data.split("-").map(Number);
    const ini = inicioSemana(new Date(a, m - 1, dia));
    porSemana[ini] ??= { qtd: 0, valor: 0 };
    porSemana[ini].qtd += p.quantidade; porSemana[ini].valor += Number(p.valor_estimado);
  });

  const confirmado = soma(d.entregasMes, "valor");
  const emConferencia = d.pendentes.reduce((s, e) => s + e.quantidade * Number(e.valor_unitario), 0);
  const fechMes = d.fechamentos.find((f) => f.mes === d.mes);

  lateral.innerHTML = `
    <div class="section-head" style="margin-bottom:.5rem"><h2 style="margin:0">Meu resumo</h2>
      <button class="icon-btn" id="btnFecharLateral" aria-label="Fechar menu" style="color:var(--muted)">✕</button></div>
    <div class="bloco acumulado">
      <h3>Acumulado de ${nomeMes(d.mes).split(" ")[0].toLowerCase()}</h3>
      <div class="grande">${moeda(confirmado)}</div>
      <div class="small" style="opacity:.85">conferido pelo dono${fechMes ? " · <strong>PAGO</strong>" : ""}</div>
      ${emConferencia ? `<div class="par small" style="margin-top:.5rem"><span>Aguardando conferência</span><span>${moeda(emConferencia)}</span></div>` : ""}
    </div>

    <div class="bloco">
      <h3>Hoje · ${dataBR(d.hoje)}</h3>
      <div class="par"><span>${inteiro(soma(doDia, "quantidade"))} peças</span><strong>${moeda(soma(doDia, "valor_estimado"))}</strong></div>
      ${doDia.length ? `<ul>${doDia.map((p) => `<li><span>#${p.lote_id} ${esc(p.produto_nome)} · ${p.quantidade} pç</span>
        <button class="btn perigo peq" data-apagar="${p.id}" title="Apagar lançamento">✕</button></li>`).join("")}</ul>`
        : `<div class="muted small">Nada lançado hoje ainda.</div>`}
    </div>

    <div class="bloco">
      <h3>Esta semana</h3>
      <div class="par"><span>${inteiro(soma(daSemana, "quantidade"))} peças</span><strong>${moeda(soma(daSemana, "valor_estimado"))}</strong></div>
      ${diasSemana.length ? `<ul>${diasSemana.map((dia) => `<li><span>${dataBR(dia)}</span><span>${inteiro(porDia[dia])} pç</span></li>`).join("")}</ul>` : ""}
    </div>

    <div class="bloco">
      <h3>Este mês (produção lançada)</h3>
      <div class="par"><span>${inteiro(soma(d.producaoMes, "quantidade"))} peças</span><strong>${moeda(soma(d.producaoMes, "valor_estimado"))}</strong></div>
      ${Object.keys(porSemana).length ? `<ul>${Object.keys(porSemana).sort().reverse().map((s) =>
        `<li><span>Semana de ${dataBR(s).slice(0, 5)}</span><span>${inteiro(porSemana[s].qtd)} pç · ${moeda(porSemana[s].valor)}</span></li>`).join("")}</ul>` : ""}
      <p class="muted small" style="margin:.5rem 0 0">O valor que vale para pagamento é o conferido pelo dono.</p>
    </div>

    ${d.fechamentos.length ? `<div class="bloco"><h3>Pagamentos recebidos</h3><ul>
      ${d.fechamentos.map((f) => `<li><span>${nomeMes(f.mes)}</span><strong>${moeda(f.valor_total)}</strong></li>`).join("")}</ul></div>` : ""}

    <div class="acoes" style="margin-top:.4rem">
      <button class="btn sec peq" id="btnSenha">🔑 Trocar senha</button>
      <button class="btn sec peq" id="btnSair">Sair</button>
    </div>`;

  $("#btnFecharLateral", lateral).onclick = () => {
    if (desktop()) { document.body.classList.add("lateral-recolhida"); salvarPref(true); }
    else fundo.click();
  };
  $("#btnSenha", lateral).onclick = () => modalTrocarSenha(perfil.usuario);
  $("#btnSair", lateral).onclick = sair;
  $$("[data-apagar]", lateral).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Apagar este lançamento de produção?", "Apagar"))) return;
    try { await rpc("apagar_producao", { p_id: Number(b.dataset.apagar) }); aviso("Lançamento apagado."); render(); }
    catch (e) { aviso(e.message, true); }
  }));
}

// ---------------------------------------------------------------
// Painel principal: lotes recebidos
// ---------------------------------------------------------------
function cardLote(l, mats) {
  const meus = mats.filter((m) => m.lote_id === l.id);
  const pAp = (l.qtd_aprovada / l.quantidade) * 100;
  const pCo = (l.qtd_em_conferencia / l.quantidade) * 100;
  const aberto = !["concluido", "cancelado"].includes(l.status);
  return `<div class="card">
    <div class="lote-topo">
      <div><div class="lote-titulo">Lote #${l.id}</div><div class="muted small">Enviado em ${dataBR(l.enviado_em)}</div></div>
      <div>${l.atrasado ? selo("atrasado", "Atrasado") : selo(l.status)}</div>
    </div>
    <div style="margin-top:.6rem">
      <div class="lote-linha"><span class="muted">Produto</span><strong>${esc(l.produto_nome)}</strong></div>
      <div class="lote-linha"><span class="muted">Serviço</span><strong>${esc(l.servico_nome)}</strong></div>
      <div class="lote-linha"><span class="muted">Quantidade</span><span class="num">${inteiro(l.quantidade)} peças</span></div>
      <div class="lote-linha"><span class="muted">Valor por peça</span><span class="num">${moeda(l.valor_unitario)}</span></div>
      ${l.prazo ? `<div class="lote-linha"><span class="muted">Prazo</span><span>${dataBR(l.prazo)}</span></div>` : ""}
      ${meus.length ? `<div class="lote-linha"><span class="muted">Material</span><span class="right">${meus.map((m) => `${inteiro(m.quantidade)} ${esc(m.materiais?.unidade)} ${esc(m.materiais?.nome)}`).join("<br>")}</span></div>` : ""}
    </div>
    ${l.observacoes ? `<p class="small" style="margin:.5rem 0 0"><strong>Obs.:</strong> ${esc(l.observacoes)}</p>` : ""}
    <div class="lote-total"><span>Valor total do lote</span><span class="num">${moeda(l.valor_total)}</span></div>
    <div class="progresso"><div class="ap" style="width:${pAp}%"></div><div class="co" style="width:${pCo}%"></div></div>
    <div class="legenda"><span><i style="background:var(--ok)"></i>${inteiro(l.qtd_aprovada)} aprovadas</span>
      <span><i style="background:#e0a43a"></i>${inteiro(l.qtd_em_conferencia)} em conferência</span>
      <span><i style="background:var(--line)"></i>${inteiro(l.qtd_saldo)} faltam</span>
      ${l.qtd_retorno ? `<span>↺ ${inteiro(l.qtd_retorno)} voltaram p/ refazer</span>` : ""}</div>
    ${aberto ? `<div class="acoes">
      ${l.status === "enviado" ? `<button class="btn acento bloco" data-receber="${l.id}">✓ Confirmar que recebi</button>` : `
      <button class="btn" data-lancar="${l.id}">＋ Lançar produção</button>
      ${l.qtd_saldo > 0 ? `<button class="btn ok" data-entregar="${l.id}">Entregar peças</button>` : ""}`}
    </div>` : `<p class="muted small" style="margin:.6rem 0 0">Valor aprovado: <strong>${moeda(l.valor_aprovado)}</strong>${l.concluido_em ? ` · concluído em ${dataBR(l.concluido_em)}` : ""}</p>`}
  </div>`;
}

function renderPrincipal(d) {
  const abertos = d.lotes.filter((l) => !["concluido", "cancelado"].includes(l.status));
  const concluidos = d.lotes.filter((l) => l.status === "concluido").slice(0, 6);
  const novos = abertos.filter((l) => l.status === "enviado").length;

  main.innerHTML = `
    <div class="section-head"><h1>Olá, ${esc(perfil.nome.split(" ")[0])}</h1>
      <button class="btn sec peq" id="btnResumo">📊 Meu resumo</button></div>
    ${novos ? `<div class="alerta">📦 Você tem ${novos} lote(s) novo(s). Confirme quando receber.</div>` : ""}
    <div class="section">
      <h2>Lotes em andamento</h2>
      ${abertos.length ? `<div class="grid cards">${abertos.map((l) => cardLote(l, d.mats)).join("")}</div>`
        : `<div class="card vazio">Nenhum lote com você no momento.</div>`}
    </div>
    ${d.pendentes.length ? `<div class="section"><h2>Entregas aguardando conferência</h2>
      <div class="card tabela-wrap"><table><thead><tr><th>Entregue em</th><th>Lote</th><th class="right">Peças</th><th class="right">Valor</th></tr></thead>
      <tbody>${d.pendentes.map((e) => `<tr><td>${dataHoraBR(e.entregue_em)}</td><td>#${e.lote_id} ${esc(e.produto_nome)}</td>
        <td class="right num">${inteiro(e.quantidade)}</td><td class="right num">${moeda(e.quantidade * e.valor_unitario)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
    ${concluidos.length ? `<div class="section"><h2>Concluídos recentemente</h2>
      <div class="grid cards">${concluidos.map((l) => cardLote(l, d.mats)).join("")}</div></div>` : ""}`;

  $("#btnResumo").onclick = () => {
    if (desktop()) { document.body.classList.remove("lateral-recolhida"); salvarPref(false); }
    else { lateral.classList.add("aberta"); fundo.classList.remove("hidden"); }
  };

  $$("[data-receber]", main).forEach((b) => (b.onclick = async () => {
    try { await rpc("confirmar_recebimento", { p_lote: Number(b.dataset.receber) }); aviso("Recebimento confirmado!"); render(); }
    catch (e) { aviso(e.message, true); }
  }));

  $$("[data-lancar]", main).forEach((b) => (b.onclick = () => {
    const l = d.lotes.find((x) => x.id == b.dataset.lancar);
    abrirModal({
      titulo: `Lançar produção — lote #${l.id}`,
      conteudo: `
        <p class="muted small">${esc(l.produto_nome)} · ${esc(l.servico_nome)} · ${moeda(l.valor_unitario)} por peça<br>
        Já lançado neste lote: ${inteiro(l.qtd_produzida_lancada)} de ${inteiro(l.quantidade)}</p>
        <div class="linha">
          <div><label>Peças feitas</label><input name="qtd" type="number" min="1" step="1" required inputmode="numeric"></div>
          <div><label>Dia</label><input name="data" type="date" value="${d.hoje}" max="${d.hoje}"></div>
        </div>
        <p class="small" id="prev"></p>
        <div class="linha"><div><label>Observação (opcional)</label><input name="obs"></div></div>
        <button type="submit" class="btn bloco">Lançar</button>`,
      aoAbrir: (form) => { form.qtd.oninput = () => ($("#prev", form).innerHTML = `Valor estimado: <strong>${moeda(Number(form.qtd.value || 0) * l.valor_unitario)}</strong>`); },
      onSubmit: async (fd) => {
        const qtd = parseInt(fd.get("qtd"), 10);
        if (!(qtd > 0)) throw new Error("Informe quantas peças você fez.");
        await rpc("lancar_producao", { p_lote: l.id, p_quantidade: qtd, p_data: fd.get("data") || null, p_observacao: fd.get("obs") || null });
        aviso("Produção lançada!"); render();
      },
    });
  }));

  $$("[data-entregar]", main).forEach((b) => (b.onclick = () => {
    const l = d.lotes.find((x) => x.id == b.dataset.entregar);
    abrirModal({
      titulo: `Entregar peças — lote #${l.id}`,
      conteudo: `
        <p class="muted small">Faltam entregar <strong>${inteiro(l.qtd_saldo)}</strong> peças. Pode ser uma entrega parcial.</p>
        <div class="linha"><div><label>Quantas peças você está entregando?</label>
          <input name="qtd" type="number" min="1" max="${l.qtd_saldo}" value="${l.qtd_saldo}" required inputmode="numeric"></div></div>
        <div class="linha"><div><label>Observação (opcional)</label><input name="obs"></div></div>
        <p class="muted small">O dono vai conferir as peças. O valor entra no seu acumulado depois da conferência.</p>
        <button type="submit" class="btn bloco ok">Registrar entrega</button>`,
      onSubmit: async (fd) => {
        const qtd = parseInt(fd.get("qtd"), 10);
        if (!(qtd > 0)) throw new Error("Informe a quantidade.");
        await rpc("registrar_entrega", { p_lote: l.id, p_quantidade: qtd, p_observacao: fd.get("obs") || null });
        aviso("Entrega registrada!"); render();
      },
    });
  }));
}

// Atualiza sozinho a cada 2 minutos (novos lotes, conferências)
render();
setInterval(() => { if (!document.querySelector(".modal-fundo")) render(); }, 120000);
