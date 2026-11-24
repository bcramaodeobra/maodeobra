// Painel da mão de obra — feito para o celular
import {
  sb, exigirPapel, sair, modalTrocarSenha, q, rpc, abrirModal, confirmar, aviso,
  moeda, inteiro, dataBR, isoLocal, inicioSemana, inicioMes, nomeMes,
  selo, esc, $, $$, periodo, rotuloPeriodo, FREQUENCIAS,
} from "./comum.js";
import { NOME_FABRICA } from "../config.js";

const perfil = await exigirPapel("mao_de_obra");
$("#nomeFabrica").textContent = NOME_FABRICA;
$("#quem").textContent = perfil.nome.split(" ")[0];

const main = $("#conteudo");
const lateral = $("#lateral");
const fundo = $("#lateralFundo");
const desktop = () => matchMedia("(min-width: 1000px)").matches;
const soma = (l, c) => l.reduce((s, x) => s + Number(x[c] || 0), 0);
const diaMes = (d) => dataBR(d).slice(0, 5);
const primeiroNome = perfil.nome.split(" ")[0];
let abaAtual = "lotes";

// ---------- Menu lateral recolhível ----------
function lerPref() { try { return localStorage.getItem("lateral-recolhida") === "1"; } catch { return false; } }
function salvarPref(v) { try { localStorage.setItem("lateral-recolhida", v ? "1" : "0"); } catch { /* ignore */ } }
if (lerPref()) document.body.classList.add("lateral-recolhida");
const abrirLateral = () => {
  if (desktop()) { document.body.classList.remove("lateral-recolhida"); salvarPref(false); }
  else { lateral.classList.add("aberta"); fundo.classList.remove("hidden"); }
};
const fecharLateral = () => {
  if (desktop()) { document.body.classList.add("lateral-recolhida"); salvarPref(true); }
  else { lateral.classList.remove("aberta"); fundo.classList.add("hidden"); }
};
$("#btnMenu").onclick = () => {
  const aberta = desktop() ? !document.body.classList.contains("lateral-recolhida") : lateral.classList.contains("aberta");
  aberta ? fecharLateral() : abrirLateral();
};
fundo.onclick = fecharLateral;

// ---------- Dados ----------
async function carregar() {
  const desde = new Date(); desde.setDate(desde.getDate() - 70);
  const [abertos, entregas, pagamentos, notas] = await Promise.all([
    q(sb.from("v_lotes").select("*").eq("status", "aberto").order("enviado_em")),
    q(sb.from("v_entregas").select("*").gte("dia", isoLocal(desde)).order("entregue_em", { ascending: false })),
    q(sb.from("pagamentos").select("*").order("pago_em", { ascending: false }).limit(12)),
    q(sb.from("notas").select("*").order("enviada_em", { ascending: false }).limit(12)),
  ]);
  return { abertos, entregas, pagamentos, notas };
}

async function render() {
  let d;
  try { d = await carregar(); }
  catch (e) { main.innerHTML = `<div class="card vazio">Erro ao carregar: ${esc(e.message)}</div>`; return; }

  const freq = perfil.frequencia_pagamento || "mensal";
  const per = periodo(freq, isoLocal());
  const hoje = isoLocal(), semana = inicioSemana(), mes = inicioMes();
  const noPeriodo = d.entregas.filter((e) => e.dia >= per.inicio && e.dia <= per.fim);
  const valorAberto = soma(d.abertos, "valor_aberto");
  const finalizadoPer = soma(noPeriodo, "valor");
  const naoPago = d.entregas.filter((e) => !e.pago).reduce((t, e) => t + Number(e.valor), 0);
  const aReceber = valorAberto + naoPago;
  const notasNovas = d.notas.filter((n) => !n.lida_em);

  renderLateral(d, { hoje, semana, mes, per, freq });

  main.innerHTML = `
    <div class="mo-ola"><h1>Olá, ${esc(primeiroNome)}! 👋</h1><span class="muted small">${dataBR(new Date())}</span></div>

    <div class="mo-hero">
      <div class="r">A RECEBER</div>
      <div class="v">${moeda(aReceber)}</div>
      <div class="mo-hero-linha">
        <div><span>Em aberto</span><strong>${moeda(valorAberto)}</strong></div>
        <div><span>Finalizado ${freq === "mensal" ? "no mês" : freq === "semanal" ? "na semana" : "na quinzena"}</span><strong>${moeda(finalizadoPer)}</strong></div>
        <div><span>Próximo fechamento</span><strong>${dataBR(per.fim).slice(0, 5)}</strong></div>
      </div>
    </div>

    ${notasNovas.length ? `<button class="mo-alerta" id="verNotaNova">📩 Você recebeu ${notasNovas.length > 1 ? `${notasNovas.length} notas` : "uma nota"} de pagamento <span>Ver ›</span></button>` : ""}

    <div class="mo-abas">
      <button data-aba="lotes" class="${abaAtual === "lotes" ? "ativo" : ""}">Meus lotes <b>${d.abertos.length}</b></button>
      <button data-aba="finalizados" class="${abaAtual === "finalizados" ? "ativo" : ""}">Finalizados</button>
      <button data-aba="pagamentos" class="${abaAtual === "pagamentos" ? "ativo" : ""}">Pagamentos${notasNovas.length ? ` <b class="novo">${notasNovas.length}</b>` : ""}</button>
    </div>
    <div id="abaConteudo"></div>`;

  $$(".mo-abas button", main).forEach((b) => (b.onclick = () => { abaAtual = b.dataset.aba; render(); }));
  $("#verNotaNova")?.addEventListener("click", () => verNota(notasNovas[0]));

  const area = $("#abaConteudo");
  if (abaAtual === "lotes") abaLotes(area, d);
  if (abaAtual === "finalizados") abaFinalizados(area, d, per, freq);
  if (abaAtual === "pagamentos") abaPagamentos(area, d);
}

// ---------- Aba: meus lotes ----------
function abaLotes(area, d) {
  if (!d.abertos.length) { area.innerHTML = `<div class="card vazio">Nenhum lote com você no momento. 🙂</div>`; return; }
  area.innerHTML = d.abertos.map((l) => {
    const pct = Math.round((l.qtd_entregue / l.quantidade) * 100);
    return `<div class="mo-lote ${l.aviso_em ? "avisado" : ""}">
      <div class="mo-lote-topo">
        <div><div class="prod">${esc(l.produto_nome)}</div><div class="serv">${esc(l.servico_nome)}</div></div>
        <div class="valor">${moeda(l.valor_total)}</div>
      </div>
      <div class="mo-lote-info">${inteiro(l.quantidade)} peças · ${moeda(l.valor_unitario)} por peça · enviado em ${diaMes(l.enviado_em)}</div>
      <div class="mo-barra"><div style="width:${pct}%"></div></div>
      <div class="mo-lote-info"><strong>${inteiro(l.qtd_entregue)}</strong> de ${inteiro(l.quantidade)} entregues · faltam <strong>${inteiro(l.qtd_falta)}</strong> (${moeda(l.valor_aberto)})</div>
      ${l.observacoes ? `<div class="mo-obs">📝 ${esc(l.observacoes)}</div>` : ""}
      ${l.aviso_em
        ? `<div class="mo-avisado">⏳ Você avisou que terminou em ${diaMes(l.aviso_em)}. Aguardando a conferência.
            <button class="link" data-cancelar="${l.id}">Cancelar aviso</button></div>`
        : `<button class="btn mo-btn-terminei" data-terminei="${l.id}">✋ Terminei este lote</button>`}
    </div>`;
  }).join("");

  $$("[data-terminei]", area).forEach((b) => (b.onclick = () => {
    const l = d.abertos.find((x) => x.id == b.dataset.terminei);
    abrirModal({
      titulo: "Terminei este lote",
      conteudo: `<p><strong>${esc(l.produto_nome)} · ${esc(l.servico_nome)}</strong><br>
        <span class="muted small">${inteiro(l.qtd_falta)} peças que faltam · ${moeda(l.valor_aberto)}</span></p>
        <p class="small">O dono vai receber o aviso, conferir as peças e finalizar o lote. O valor passa para "finalizado" depois da conferência.</p>
        <div class="linha"><div><label>Recado (opcional)</label><input name="msg" placeholder="Ex.: pode buscar à tarde"></div></div>
        <button type="submit" class="btn bloco mo-btn-terminei">Enviar aviso</button>`,
      onSubmit: async (fd) => {
        await rpc("avisar_terminei", { p_lote: l.id, p_mensagem: fd.get("msg") || null });
        aviso("Aviso enviado! 👍"); render();
      },
    });
  }));
  $$("[data-cancelar]", area).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Cancelar o aviso de que terminou este lote?", "Cancelar aviso"))) return;
    try { await rpc("cancelar_aviso", { p_lote: Number(b.dataset.cancelar) }); aviso("Aviso cancelado."); render(); }
    catch (e) { aviso(e.message, true); }
  }));
}

// ---------- Aba: finalizados ----------
function abaFinalizados(area, d, per, freq) {
  const noPer = d.entregas.filter((e) => e.dia >= per.inicio && e.dia <= per.fim);
  const anteriores = d.entregas.filter((e) => e.dia < per.inicio);
  const lista = (l) => `<ul class="lista-final">${l.map((e) => `
    <li><span>${diaMes(e.entregue_em)} – ${esc(e.produto_nome)}: ${esc(e.servico_nome)}<br>
      <span class="small muted">${inteiro(e.quantidade)} peças · ${e.tipo === "pronto" ? "lote pronto" : "entrega parcial"}</span></span>
      <span class="right"><strong class="num">${moeda(e.valor)}</strong><br>${e.pago ? selo("pago", "Pago") : selo("aberto", "A receber")}</span></li>`).join("")}</ul>`;
  area.innerHTML = `
    <div class="card">
      <div class="section-head" style="margin-bottom:.2rem"><h2 style="margin:0">${esc(per.rotulo)}</h2><span class="selo parcial">${FREQUENCIAS[freq]}</span></div>
      ${noPer.length ? lista(noPer) + `<div class="soma-final"><span>TOTAL DO PERÍODO</span><span>${moeda(soma(noPer, "valor"))}</span></div>`
        : `<p class="muted">Nada finalizado neste período ainda.</p>`}
    </div>
    ${anteriores.length ? `<div class="card" style="margin-top:.8rem"><h2>Antes disso</h2>${lista(anteriores.slice(0, 30))}</div>` : ""}`;
}

// ---------- Aba: pagamentos ----------
function abaPagamentos(area, d) {
  area.innerHTML = `
    <div class="card">
      <h2>📩 Notas de pagamento</h2>
      ${d.notas.length ? d.notas.map((n) => `<div class="nota-item ${n.lida_em ? "" : "nao-lida"}">
        <span><strong>${esc(n.inicio ? rotuloPeriodo(n.tipo, n.inicio) : nomeMes(n.mes))}</strong><br><span class="small muted">Enviada em ${dataBR(n.enviada_em)} · ${inteiro(n.quantidade)} peças</span></span>
        <span style="display:flex;gap:.6rem;align-items:center"><strong class="num">${moeda(n.valor_total)}</strong><button class="btn ${n.lida_em ? "sec" : ""} peq" data-nota="${n.id}">Ver</button></span>
      </div>`).join("") : `<p class="muted">Nenhuma nota recebida ainda.</p>`}
    </div>
    <div class="card" style="margin-top:.8rem">
      <h2>💰 Pagamentos recebidos</h2>
      ${d.pagamentos.length ? `<ul class="lista-final">${d.pagamentos.map((p) => `<li>
        <span>${esc(rotuloPeriodo(p.tipo, p.inicio))}<br><span class="small muted">pago em ${dataBR(p.pago_em)} · ${inteiro(p.quantidade)} peças</span></span>
        <strong class="num">${moeda(p.valor_total)}</strong></li>`).join("")}</ul>` : `<p class="muted">Nenhum pagamento registrado ainda.</p>`}
    </div>`;
  $$("[data-nota]", area).forEach((b) => (b.onclick = () => verNota(d.notas.find((n) => n.id == b.dataset.nota))));
}

function verNota(n) {
  const itens = Array.isArray(n.itens) ? n.itens : [];
  abrirModal({
    titulo: `Fechamento — ${n.inicio ? rotuloPeriodo(n.tipo, n.inicio) : nomeMes(n.mes)}`,
    conteudo: `
      <div class="nota-previa">
        <div class="nota-topo"><strong>${esc(NOME_FABRICA)}</strong><span>Enviada em ${dataBR(n.enviada_em)}</span></div>
        <table><thead><tr><th>Produto · serviço</th><th class="right">Qtd</th><th class="right">R$/peça</th><th class="right">Valor</th></tr></thead>
          <tbody>${itens.map((i) => `<tr><td>${esc(i.produto)} · ${esc(i.servico)}</td><td class="right num">${inteiro(i.quantidade)}</td><td class="right num">${moeda(i.valor_unitario)}</td><td class="right num">${moeda(i.valor)}</td></tr>`).join("")}</tbody>
          <tfoot><tr><td>Total</td><td class="right num">${inteiro(n.quantidade)}</td><td></td><td class="right num">${moeda(n.valor_total)}</td></tr></tfoot></table>
      </div>
      ${n.mensagem ? `<p style="margin:.8rem 0 0"><strong>Recado:</strong> ${esc(n.mensagem)}</p>` : ""}
      <button type="submit" class="btn bloco" style="margin-top:1rem">Fechar</button>`,
  });
  if (!n.lida_em) rpc("marcar_nota_lida", { p_nota: n.id }).then(() => { n.lida_em = new Date().toISOString(); render(); }).catch(() => {});
}

// ---------- Menu lateral: dia, semana, mês ----------
function renderLateral(d, { hoje, semana, mes, per, freq }) {
  const doDia = d.entregas.filter((e) => e.dia === hoje);
  const daSemana = d.entregas.filter((e) => e.dia >= semana);
  const doMes = d.entregas.filter((e) => e.dia >= mes);
  const bloco = (titulo, l) => `<div class="bloco"><h3>${titulo}</h3><div class="par"><span>${inteiro(soma(l, "quantidade"))} peças</span><strong>${moeda(soma(l, "valor"))}</strong></div></div>`;
  lateral.innerHTML = `
    <div class="section-head" style="margin-bottom:.5rem"><h2 style="margin:0">Meu resumo</h2>
      <button class="icon-btn" id="btnFecharLateral" aria-label="Fechar menu" style="color:var(--muted)">✕</button></div>
    <div class="bloco acumulado"><h3>Próximo fechamento</h3><div class="grande">${dataBR(per.fim)}</div>
      <div class="small" style="opacity:.85">Pagamento ${FREQUENCIAS[freq].toLowerCase()} · ${esc(per.rotulo)}</div></div>
    ${bloco("Finalizado hoje", doDia)}
    ${bloco("Finalizado na semana", daSemana)}
    ${bloco("Finalizado no mês", doMes)}
    <div class="acoes" style="margin-top:.4rem">
      <button class="btn sec peq" id="btnSenha">🔑 Trocar senha</button>
      <button class="btn sec peq" id="btnSair">Sair</button>
    </div>`;
  $("#btnFecharLateral").onclick = fecharLateral;
  $("#btnSenha").onclick = () => modalTrocarSenha(perfil.usuario);
  $("#btnSair").onclick = sair;
}

render();
setInterval(() => { if (!document.querySelector(".modal-fundo")) render(); }, 120000);
