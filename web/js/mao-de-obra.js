// Painel da mão de obra — feito para o celular (visual novo)
import {
  sb, exigirPapel, sair, modalTrocarSenha, q, rpc, abrirModal, confirmar, aviso,
  moeda, inteiro, dataBR, isoLocal, inicioSemana, inicioMes, nomeMes,
  selo, esc, $, $$, periodo, rotuloPeriodo, FREQUENCIAS, botaoInstalar,
} from "./comum.js";
import { NOME_FABRICA } from "../config.js";

const perfil = await exigirPapel("mao_de_obra");
const primeiroNome = perfil.nome.split(" ")[0];
const porHora = perfil.forma_pagamento === "hora";
$("#nomeFabrica").textContent = NOME_FABRICA;
$("#quem").textContent = `Olá, ${primeiroNome}! 👋`;
$("#hojeTxt").textContent = dataBR(new Date()).slice(0, 5);
if (porHora) $("#rotLotes").textContent = "Horas";

const main = $("#conteudo");
const soma = (l, c) => l.reduce((s, x) => s + Number(x[c] || 0), 0);
const diaMes = (d) => dataBR(d).slice(0, 5);
const ehHora = (i) => i.origem === "hora" || i.produto === "Horas" || i.produto_nome === "Horas";
const resumoQtd = (l) => {
  const h = l.filter(ehHora).reduce((a, i) => a + Number(i.quantidade), 0);
  const pc = l.filter((i) => !ehHora(i)).reduce((a, i) => a + Number(i.quantidade), 0);
  return [pc ? `${inteiro(pc)} peças` : "", h ? `${inteiro(h)} h` : ""].filter(Boolean).join(" · ") || "—";
};
let abaAtual = "lotes";

$("#moNav").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-aba]");
  if (!b) return;
  abaAtual = b.dataset.aba; window.scrollTo(0, 0); render();
});

// ---------- Dados ----------
async function carregar() {
  const desde = new Date(); desde.setDate(desde.getDate() - 70);
  const [abertos, ganhos, pagamentos, notas] = await Promise.all([
    q(sb.from("v_lotes").select("*").eq("status", "aberto").order("enviado_em")),
    q(sb.from("v_ganhos").select("*").gte("dia", isoLocal(desde)).order("dia", { ascending: false })),
    q(sb.from("pagamentos").select("*").order("pago_em", { ascending: false }).limit(12)),
    q(sb.from("notas").select("*").order("enviada_em", { ascending: false }).limit(12)),
  ]);
  const lancs = porHora ? await q(sb.from("folha_lancamentos").select("*").gte("data", inicioMes()).order("data", { ascending: false })).catch(() => []) : [];
  return { abertos, ganhos, pagamentos, notas, lancs };
}

async function render() {
  let d;
  try { d = await carregar(); }
  catch (e) { main.innerHTML = `<div class="card vazio">Erro ao carregar: ${esc(e.message)}</div>`; return; }

  const freq = perfil.frequencia_pagamento || "mensal";
  const per = periodo(freq, isoLocal());
  const noPeriodo = d.ganhos.filter((e) => e.dia >= per.inicio && e.dia <= per.fim);
  const valorAberto = soma(d.abertos, "valor_aberto");
  const naoPago = d.ganhos.filter((e) => !e.pago).reduce((t, e) => t + Number(e.valor), 0);
  const notasNovas = d.notas.filter((n) => !n.lida_em);
  const horasPer = noPeriodo.filter(ehHora).reduce((a, h) => a + Number(h.quantidade), 0);

  $$("#moNav button").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === abaAtual));
  $("#pontoNota").classList.toggle("hidden", !notasNovas.length);

  $("#hero").innerHTML = `
    <div class="mo2-hero">
      <span class="r">A RECEBER</span>
      <strong class="v">${moeda(valorAberto + naoPago)}</strong>
      <div class="mo2-hero-linha">
        ${porHora
          ? `<div><span>Horas ${freq === "mensal" ? "no mês" : freq === "semanal" ? "na semana" : "na quinzena"}</span><strong>${inteiro(horasPer)} h</strong></div>`
          : `<div><span>Em aberto</span><strong>${moeda(valorAberto)}</strong></div>`}
        <div><span>Finalizado no período</span><strong>${moeda(soma(noPeriodo, "valor"))}</strong></div>
        <div><span>Fechamento</span><strong>${dataBR(per.fim).slice(0, 5)}</strong></div>
      </div>
    </div>
    ${notasNovas.length ? `<button class="mo-alerta" id="verNotaNova">📩 Você recebeu ${notasNovas.length > 1 ? `${notasNovas.length} notas` : "uma nota"} de pagamento <span>Ver ›</span></button>` : ""}`;
  $("#verNotaNova")?.addEventListener("click", () => verNota(notasNovas[0]));

  if (abaAtual === "lotes") (porHora ? abaHoras : abaLotes)(d, per);
  if (abaAtual === "finalizados") abaFinalizados(d, per, freq);
  if (abaAtual === "pagamentos") abaPagamentos(d);
  if (abaAtual === "perfil") abaPerfil(d, per, freq);
}

const titulo = (t, extra = "") => `<div class="mo2-titulo"><h2>${t}</h2>${extra}</div>`;

// ---------- Aba: minhas horas (quem recebe por hora) ----------
function abaHoras(d, per) {
  const horas = d.ganhos.filter(ehHora);
  const doPer = horas.filter((h) => h.dia >= per.inicio && h.dia <= per.fim);
  main.innerHTML = titulo("Minhas horas", `<span class="selo parcial">${esc(per.rotulo)}</span>`) +
    (horas.length ? `<div class="card">
      <ul class="lista-final">${horas.slice(0, 40).map((h) => `<li>
        <span>${diaMes(h.dia)} – <strong>${inteiro(h.quantidade)} h</strong> × ${moeda(h.valor_unitario)}</span>
        <span class="right"><strong class="num">${moeda(h.valor)}</strong><br>${h.pago ? selo("pago", "Pago") : selo("aberto", "A receber")}</span></li>`).join("")}</ul>
      <div class="soma-final"><span>NO PERÍODO · ${inteiro(soma(doPer, "quantidade"))} h</span><span>${moeda(soma(doPer, "valor"))}</span></div>
    </div>
    ${d.lancs.length ? `<div class="card" style="margin-top:.8rem"><h3>Outros lançamentos do mês</h3><ul class="lista-final">${d.lancs.map((l) => {
      const neg = l.tipo === "vale" || l.tipo === "desconto";
      const nome = { hora_extra: "Hora extra", bonus: "Bonificação", vale: "Vale", desconto: "Desconto" }[l.tipo];
      return `<li><span>${diaMes(l.data)} – <strong>${nome}</strong>${l.tipo === "hora_extra" ? ` · ${inteiro(l.horas)} h` : ""}${l.descricao ? `<br><span class="small muted">${esc(l.descricao)}</span>` : ""}</span>
        <strong class="num" style="${neg ? "color:#b3261e" : ""}">${neg ? "− " : ""}${moeda(l.valor)}</strong></li>`;
    }).join("")}</ul></div>` : ""}
    <p class="muted small" style="text-align:center">As horas são lançadas pelo Bruno. Se faltar algum dia, fale com ele.</p>`
    : `<div class="card vazio">Nenhuma hora lançada ainda. As horas são lançadas pelo Bruno.</div>`);
}

// ---------- Aba: meus lotes ----------
function abaLotes(d) {
  if (!d.abertos.length) { main.innerHTML = titulo("Meus lotes") + `<div class="card vazio">Nenhum lote com você no momento. 🙂</div>`; return; }
  main.innerHTML = titulo("Meus lotes", `<span class="selo parcial">${d.abertos.length} em aberto</span>`) + d.abertos.map((l) => {
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

  $$("[data-terminei]", main).forEach((b) => (b.onclick = () => {
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
  $$("[data-cancelar]", main).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Cancelar o aviso de que terminou este lote?", "Cancelar aviso"))) return;
    try { await rpc("cancelar_aviso", { p_lote: Number(b.dataset.cancelar) }); aviso("Aviso cancelado."); render(); }
    catch (e) { aviso(e.message, true); }
  }));
}

// ---------- Aba: finalizados (peças e horas) ----------
function abaFinalizados(d, per, freq) {
  const noPer = d.ganhos.filter((e) => e.dia >= per.inicio && e.dia <= per.fim);
  const anteriores = d.ganhos.filter((e) => e.dia < per.inicio);
  const lista = (l) => `<ul class="lista-final">${l.map((e) => `
    <li><span>${diaMes(e.dia)} – ${ehHora(e) ? "Horas trabalhadas" : `${esc(e.produto_nome)}: ${esc(e.servico_nome)}`}<br>
      <span class="small muted">${ehHora(e) ? `${inteiro(e.quantidade)} h × ${moeda(e.valor_unitario)}` : `${inteiro(e.quantidade)} peças`}</span></span>
      <span class="right"><strong class="num">${moeda(e.valor)}</strong><br>${e.pago ? selo("pago", "Pago") : selo("aberto", "A receber")}</span></li>`).join("")}</ul>`;
  main.innerHTML = titulo("Finalizados", `<span class="selo parcial">${FREQUENCIAS[freq]}</span>`) + `
    <div class="card">
      <h3 style="margin:0 0 .3rem">${esc(per.rotulo)}</h3>
      ${noPer.length ? lista(noPer) + `<div class="soma-final"><span>TOTAL · ${resumoQtd(noPer)}</span><span>${moeda(soma(noPer, "valor"))}</span></div>`
        : `<p class="muted">Nada finalizado neste período ainda.</p>`}
    </div>
    ${anteriores.length ? `<div class="card" style="margin-top:.8rem"><h3>Antes disso</h3>${lista(anteriores.slice(0, 30))}</div>` : ""}`;
}

// ---------- Aba: pagamentos ----------
function abaPagamentos(d) {
  main.innerHTML = titulo("Pagamentos") + `
    <div class="card">
      <h3>📩 Notas de pagamento</h3>
      ${d.notas.length ? d.notas.map((n) => `<div class="nota-item ${n.lida_em ? "" : "nao-lida"}">
        <span><strong>${esc(n.inicio ? rotuloPeriodo(n.tipo, n.inicio) : nomeMes(n.mes))}</strong><br><span class="small muted">Enviada em ${dataBR(n.enviada_em)}</span></span>
        <span style="display:flex;gap:.6rem;align-items:center"><strong class="num">${moeda(n.valor_total)}</strong><button class="btn ${n.lida_em ? "sec" : ""} peq" data-nota="${n.id}">Ver</button></span>
      </div>`).join("") : `<p class="muted">Nenhuma nota recebida ainda.</p>`}
    </div>
    <div class="card" style="margin-top:.8rem">
      <h3>💰 Pagamentos recebidos</h3>
      ${d.pagamentos.length ? `<ul class="lista-final">${d.pagamentos.map((p) => `<li>
        <span>${esc(rotuloPeriodo(p.tipo, p.inicio))}<br><span class="small muted">pago em ${dataBR(p.pago_em)}</span></span>
        <strong class="num">${moeda(p.valor_total)}</strong></li>`).join("")}</ul>` : `<p class="muted">Nenhum pagamento registrado ainda.</p>`}
    </div>`;
  $$("[data-nota]", main).forEach((b) => (b.onclick = () => verNota(d.notas.find((n) => n.id == b.dataset.nota))));
}

function verNota(n) {
  const itens = Array.isArray(n.itens) ? n.itens : [];
  abrirModal({
    titulo: `Fechamento — ${n.inicio ? rotuloPeriodo(n.tipo, n.inicio) : nomeMes(n.mes)}`,
    conteudo: `
      <div class="nota-previa">
        <div class="nota-topo"><strong>${esc(NOME_FABRICA)}</strong><span>Enviada em ${dataBR(n.enviada_em)}</span></div>
        <table><thead><tr><th>Produto · serviço</th><th class="right">Qtd</th><th class="right">Valor unit.</th><th class="right">Valor</th></tr></thead>
          <tbody>${itens.map((i) => `<tr><td>${ehHora(i) ? "Horas trabalhadas" : `${esc(i.produto)} · ${esc(i.servico)}`}</td>
            <td class="right num">${inteiro(i.quantidade)} ${ehHora(i) ? "h" : "pç"}</td><td class="right num">${moeda(i.valor_unitario)}</td><td class="right num">${moeda(i.valor)}</td></tr>`).join("")}</tbody>
          <tfoot><tr><td>Total</td><td></td><td></td><td class="right num">${moeda(n.valor_total)}</td></tr></tfoot></table>
      </div>
      ${n.mensagem ? `<p style="margin:.8rem 0 0"><strong>Recado:</strong> ${esc(n.mensagem)}</p>` : ""}
      <button type="submit" class="btn bloco" style="margin-top:1rem">Fechar</button>`,
  });
  if (!n.lida_em) rpc("marcar_nota_lida", { p_nota: n.id }).then(() => { n.lida_em = new Date().toISOString(); render(); }).catch(() => {});
}

// ---------- Aba: perfil (resumo do dia, semana e mês) ----------
function abaPerfil(d, per, freq) {
  const hoje = isoLocal(), semana = inicioSemana(), mes = inicioMes();
  const bloco = (t, l) => `<div class="mo2-resumo"><span>${t}</span><small>${resumoQtd(l)}</small><strong>${moeda(soma(l, "valor"))}</strong></div>`;
  main.innerHTML = `
    <div class="card mo2-perfil">
      <div class="mo2-avatar">${esc(primeiroNome[0] || "?").toUpperCase()}</div>
      <div><strong>${esc(perfil.nome)}</strong><span>Usuário: ${esc(perfil.usuario)}</span>
        <span>${porHora ? "Recebe por hora" : "Recebe por produção"} · fechamento ${FREQUENCIAS[freq].toLowerCase()}</span></div>
    </div>
    ${titulo("Meu resumo")}
    <div class="mo2-resumos">
      ${bloco("Hoje", d.ganhos.filter((e) => e.dia === hoje))}
      ${bloco("Semana", d.ganhos.filter((e) => e.dia >= semana))}
      ${bloco("Mês", d.ganhos.filter((e) => e.dia >= mes))}
    </div>
    <div class="card" style="margin-top:.8rem">
      <div class="par-linha"><span>Próximo fechamento</span><strong>${dataBR(per.fim)}</strong></div>
      <div class="small muted">${esc(per.rotulo)}</div>
    </div>
    <div id="areaInstalar" style="margin:.8rem 0"></div>
    <div class="menu-mais">
      <button type="button" id="btnSenha"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><span>Trocar minha senha</span><svg class="seta" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
      <button type="button" id="btnSair" class="sair"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg><span>Sair</span></button>
    </div>`;
  botaoInstalar($("#areaInstalar"));
  $("#btnSenha").onclick = () => modalTrocarSenha(perfil.usuario);
  $("#btnSair").onclick = sair;
}

render();
setInterval(() => { if (!document.querySelector(".modal-fundo")) render(); }, 120000);
