// Painel da mão de obra — versão provisória (só acompanhamento)
import {
  sb, exigirPapel, sair, modalTrocarSenha, q, rpc, abrirModal,
  moeda, inteiro, dataBR, isoLocal, inicioSemana, inicioMes, nomeMes,
  selo, esc, $, $$, rotuloPeriodo, FREQUENCIAS,
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
async function render() {
  const mes = inicioMes();
  let abertos, entregasMes, pagamentos, notas;
  try {
    [abertos, entregasMes, pagamentos, notas] = await Promise.all([
      q(sb.from("v_lotes").select("*").eq("status", "aberto").order("enviado_em")),
      q(sb.from("v_entregas").select("*").eq("mes_ref", mes).order("entregue_em", { ascending: false })),
      q(sb.from("pagamentos").select("*").order("pago_em", { ascending: false }).limit(8)),
      q(sb.from("notas").select("*").order("enviada_em", { ascending: false }).limit(12)),
    ]);
  } catch (e) { main.innerHTML = `<div class="card vazio">Erro ao carregar: ${esc(e.message)}</div>`; return; }

  const valorAberto = soma(abertos, "valor_aberto");
  const valorFinal = soma(entregasMes, "valor");
  const hoje = isoLocal(), semana = inicioSemana();
  const dia = (e) => isoLocal(new Date(e.entregue_em));
  const doDia = entregasMes.filter((e) => dia(e) === hoje);
  const daSemana = entregasMes.filter((e) => dia(e) >= semana);
  const aPagarMes = entregasMes.filter((e) => !e.pago).reduce((t, e) => t + Number(e.valor), 0);

  // Menu lateral
  lateral.innerHTML = `
    <div class="section-head" style="margin-bottom:.5rem"><h2 style="margin:0">Meu resumo</h2>
      <button class="icon-btn" id="btnFecharLateral" aria-label="Fechar menu" style="color:var(--muted)">✕</button></div>
    <div class="bloco acumulado"><h3>Saldo a receber</h3><div class="grande">${moeda(valorAberto + valorFinal)}</div>
      <div class="small" style="opacity:.85">em aberto + finalizado no mês</div>
      <div class="par small" style="margin-top:.4rem"><span>Finalizado ainda não pago</span><span>${moeda(aPagarMes)}</span></div>
      <div class="small" style="opacity:.75;margin-top:.2rem">Pagamento ${(FREQUENCIAS[perfil.frequencia_pagamento] || "Mensal").toLowerCase()}</div></div>
    <div class="bloco"><h3>Finalizado hoje</h3><div class="par"><span>${inteiro(soma(doDia, "quantidade"))} peças</span><strong>${moeda(soma(doDia, "valor"))}</strong></div></div>
    <div class="bloco"><h3>Finalizado na semana</h3><div class="par"><span>${inteiro(soma(daSemana, "quantidade"))} peças</span><strong>${moeda(soma(daSemana, "valor"))}</strong></div></div>
    <div class="bloco"><h3>Finalizado no mês</h3><div class="par"><span>${inteiro(soma(entregasMes, "quantidade"))} peças</span><strong>${moeda(valorFinal)}</strong></div></div>
    ${pagamentos.length ? `<div class="bloco"><h3>Pagamentos recebidos</h3><ul>
      ${pagamentos.map((f) => `<li><span>${esc(rotuloPeriodo(f.tipo, f.inicio))}<br><span class="muted">pago em ${dataBR(f.pago_em)}</span></span><strong>${moeda(f.valor_total)}</strong></li>`).join("")}</ul></div>` : ""}
    <div class="acoes" style="margin-top:.4rem">
      <button class="btn sec peq" id="btnSenha">🔑 Trocar senha</button>
      <button class="btn sec peq" id="btnSair">Sair</button>
    </div>`;
  $("#btnFecharLateral").onclick = fecharLateral;
  $("#btnSenha").onclick = () => modalTrocarSenha(perfil.usuario);
  $("#btnSair").onclick = sair;

  // Principal
  main.innerHTML = `
    <div class="section-head"><h1>Olá, ${esc(perfil.nome.split(" ")[0])}</h1>
      <button class="btn sec peq" id="btnResumo">📊 Meu resumo</button></div>
    ${notas.length ? `<div class="section"><h2>📩 Notas de pagamento ${notas.some((n) => !n.lida_em) ? `<span class="selo aberto">${notas.filter((n) => !n.lida_em).length} nova(s)</span>` : ""}</h2>
      ${notas.slice(0, 4).map((n) => `<div class="nota-item ${n.lida_em ? "" : "nao-lida"}">
        <span><strong>Fechamento — ${esc(n.inicio ? rotuloPeriodo(n.tipo, n.inicio) : nomeMes(n.mes))}</strong><br><span class="small muted">Enviada em ${dataBR(n.enviada_em)} · ${inteiro(n.quantidade)} peças</span></span>
        <span style="display:flex;gap:.6rem;align-items:center"><strong class="num">${moeda(n.valor_total)}</strong><button class="btn ${n.lida_em ? "sec" : ""} peq" data-nota="${n.id}">Ver nota</button></span>
      </div>`).join("")}</div>` : ""}
    <div class="totais">
      <div class="total amarelo"><div class="r">Em aberto</div><div class="v">${moeda(valorAberto)}</div></div>
      <div class="total"><div class="r">Finalizado no mês</div><div class="v">${moeda(valorFinal)}</div></div>
      <div class="total escuro"><div class="r">Saldo a receber</div><div class="v">${moeda(valorAberto + valorFinal)}</div></div>
    </div>
    <div class="section"><h2>Lotes comigo</h2>
      ${abertos.length ? abertos.map((l) => `
        <div class="mini-lote">
          <div class="linha1"><span>${diaMes(l.enviado_em)} – ${esc(l.produto_nome.toUpperCase())}: ${esc(l.servico_nome.toUpperCase())} – ${inteiro(l.quantidade)} PEÇAS</span>
            <span class="valor">${moeda(l.valor_total)}</span></div>
          <div class="linha2">${moeda(l.valor_unitario)} por peça · Entregue: ${inteiro(l.qtd_entregue)} · Falta: <strong>${inteiro(l.qtd_falta)}</strong>
            ${l.observacoes ? `<br>Obs.: ${esc(l.observacoes)}` : ""}</div>
        </div>`).join("") : `<div class="card vazio">Nenhum lote com você no momento.</div>`}
    </div>
    <div class="section"><h2>Finalizado em ${nomeMes(mes).toLowerCase()}</h2>
      ${entregasMes.length ? `<div class="card"><ul class="lista-final">${entregasMes.map((e) => `
        <li><span>${diaMes(e.entregue_em)} – ${esc(e.produto_nome)}: ${esc(e.servico_nome)} – ${inteiro(e.quantidade)} pç ${selo(e.tipo === "pronto" ? "pronto" : "parcial", e.tipo === "pronto" ? "Lote pronto" : "Parcial")}${e.pago ? " " + selo("pago", "Pago") : ""}</span>
          <strong class="num">${moeda(e.valor)}</strong></li>`).join("")}</ul>
        <div class="soma-final"><span>TOTAL FINALIZADO NO MÊS</span><span>${moeda(valorFinal)}</span></div></div>`
        : `<div class="card vazio">Nada finalizado neste mês ainda.</div>`}
    </div>`;
  $("#btnResumo").onclick = abrirLateral;
  $$("[data-nota]", main).forEach((b) => (b.onclick = () => verNota(notas.find((n) => n.id == b.dataset.nota))));
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
      ${n.mensagem ? `<p style="margin:.8rem 0 0"><strong>Mensagem:</strong> ${esc(n.mensagem)}</p>` : ""}
      <button type="submit" class="btn bloco" style="margin-top:1rem">Fechar</button>`,
  });
  if (!n.lida_em) rpc("marcar_nota_lida", { p_nota: n.id }).then(() => { n.lida_em = new Date().toISOString(); render(); }).catch(() => {});
}

render();
setInterval(() => { if (!document.querySelector(".modal-fundo")) render(); }, 120000);
