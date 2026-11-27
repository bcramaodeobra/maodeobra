import {
  sb, exigirPapel, sair, modalTrocarSenha, trocarSenha, adminUsuarios, rpc, q,
  moeda, inteiro, dataBR, dataHoraBR, inicioMes, fimMes, nomeMes,
  selo, esc, $, $$, aviso, abrirModal, confirmar,
  isoLocal, periodo, periodoAnterior, periodoSeguinte, rotuloPeriodo, FREQUENCIAS,
} from "./comum.js";
import { NOME_FABRICA } from "../config.js";

const perfil = await exigirPapel("dono");
document.title = `${NOME_FABRICA} — Painel do Dono`;
$("#quem").textContent = perfil.nome;
$("#sbAvatar").textContent = (perfil.nome || "B").trim()[0].toUpperCase();
$("#sbNome").textContent = NOME_FABRICA.split(" ")[0];
$("#tcOla").textContent = `Olá, ${perfil.nome.split(" ")[0]}`;
$("#tcData").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
$("#btnSair").onclick = sair;
$("#btnSenha").onclick = modalMinhaConta;
$("#tcSino").onclick = () => { if (abaAtual !== "inicio") irPara("inicio"); setTimeout(() => $("#avisosInicio")?.scrollIntoView({ behavior: "smooth" }), 300); };

function modalMinhaConta() {
  const m = abrirModal({
    titulo: "Minha conta",
    conteudo: `<p class="muted small" style="margin-top:0">Você entra com o usuário <strong>${esc(perfil.usuario)}</strong>.</p>
      <div class="menu-mais">
        <button type="button" id="contaUsuario">${icone("usuario")}<span>Alterar meu usuário</span>${seta}</button>
        <button type="button" id="contaSenha">${icone("senha")}<span>Trocar minha senha</span>${seta}</button>
      </div>`,
  });
  $("#contaSenha", m.form).onclick = () => { m.fechar(); modalTrocarSenha(perfil.usuario); };
  $("#contaUsuario", m.form).onclick = () => {
    m.fechar();
    abrirModal({
      titulo: "Alterar meu usuário",
      conteudo: `<div class="linha"><div><label>Novo usuário</label><input name="usuario" value="${esc(perfil.usuario)}" required autocapitalize="none"></div></div>
        <p class="muted small">Só letras minúsculas, números, ponto, - ou _ (sem espaço e sem acento). A senha continua a mesma.</p>
        <button type="submit" class="btn bloco">Salvar novo usuário</button>`,
      onSubmit: async (fd) => { await alterarMeuUsuario(fd.get("usuario")); },
    });
  };
}

const main = $("#conteudo");
let abaAtual = "inicio";

const diaMes = (d) => dataBR(d).slice(0, 5);
const maiusc = (t) => String(t ?? "").toUpperCase();
const soma = (lista, campo) => lista.reduce((s, x) => s + Number(x[campo] || 0), 0);
// Tipos de mão de obra (externa, interna, fixos) e forma de pagamento (produção ou hora)
let CONF = {};
async function carregarConf() {
  CONF = Object.fromEntries((await q(sb.from("configuracoes").select("*"))).map((c) => [c.chave, c.valor]));
  return CONF;
}
const moduloAtivo = (k) => CONF[`modulo_${k === "interna" || k === "fixos" ? "funcionarios" : k}`] !== "nao";
const tipoDe = (m) => (m.tipo === "interna" ? "interna" : "externa");
const porHora = (m) => m.forma_pagamento === "hora";
const numConf = (k) => { const v = String(CONF[k] ?? "").replace(",", "."); return v === "" || isNaN(Number(v)) ? null : Number(v); };
const valorHoraDe = (m) => (m.valor_hora != null ? Number(m.valor_hora) : numConf("valor_hora_padrao"));
const ehHora = (i) => i.origem === "hora" || i.produto_nome === "Horas";
const qtdTxt = (i) => `${inteiro(i.quantidade)} ${ehHora(i) ? "h" : "pç"}`;
const resumoQtd = (lista) => {
  const h = lista.filter(ehHora).reduce((a, i) => a + Number(i.quantidade), 0);
  const pc = lista.filter((i) => !ehHora(i)).reduce((a, i) => a + Number(i.quantidade), 0);
  return [pc ? `${inteiro(pc)} peças` : "", h ? `${inteiro(h)} h` : ""].filter(Boolean).join(" · ") || "0";
};
const TIPOS = { externa: "Mão de obra externa", interna: "Funcionário", fixos: "Funcionários", funcionarios: "Funcionários" };
// Funcionário por hora = perfil interno pago por hora (tem login). Os demais perfis são mão de obra externa.
const ehFuncHora = (m) => m.tipo === "interna" && m.forma_pagamento === "hora";
const FORMAS = { producao: "Por produção", hora: "Por hora" };
const formaTxt = (m) => (porHora(m) ? `Por hora${valorHoraDe(m) != null ? ` · ${moeda(valorHoraDe(m))}` : ""}` : "Por produção");

const ICONES = {
  maos: '<path d="M16 19c0-3-2.5-5-6-5s-6 2-6 5"/><circle cx="10" cy="8" r="3.5"/><path d="M20 19c0-2.4-1.5-4.2-4-4.8M15.5 4.6a3.5 3.5 0 0 1 0 6.8"/>',
  servicos: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  admin: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  conta: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  externa: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  interna: '<path d="M2 21V9l6 4V9l6 4V5h8v16z"/><path d="M6 17h2M11 17h2M16 17h2"/>',
  fixos: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16c.6-1.5 1.8-2.2 3.2-2.2s2.6.7 3.2 2.2M15 10h3M15 13h3"/>',
  usuario: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  senha: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  lixo: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/>',
  folha: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  rel: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  equip: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  gastos: '<path d="M4 3h16v18l-3-2-3 2-2-2-2 2-3-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
};
const icone = (k) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONES[k]}</svg>`;
const seta = '<svg class="seta" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

const linkWhats = (n) => (n ? `https://wa.me/55${String(n).replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")}` : "");

// ---------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------
// No celular as tabelas viram listas: cada célula recebe o nome da sua coluna
function rotularTabelas(raiz = document) {
  $$("table", raiz).forEach((t) => {
    const cab = $$("thead th", t).map((th) => th.textContent.trim());
    if (!cab.length) return;
    $$("tbody tr, tfoot tr", t).forEach((tr) => {
      let col = 0;
      [...tr.children].forEach((td) => {
        if (!td.dataset.label && cab[col]) td.dataset.label = cab[col];
        col += Number(td.getAttribute("colspan") || 1);
      });
    });
  });
}
new MutationObserver(() => rotularTabelas()).observe(document.body, { childList: true, subtree: true });

// Marca a aba ativa nas duas navegações (topo no computador, barra de baixo no celular)
function marcarAba(aba) {
  abaAtual = aba;
  $$("#abas button").forEach((x) => x.classList.toggle("ativo", x.dataset.aba === aba));
  const naBarra = ["inicio", "minha", "fechamentos"].includes(aba);
  $$("#navBaixo button").forEach((x) => x.classList.toggle("ativo", naBarra ? x.dataset.aba === aba : x.hasAttribute("data-mais")));
  $("#fabLote").classList.toggle("hidden", aba !== "inicio");
  window.scrollTo(0, 0);
}
function irPara(aba) { marcarAba(aba); render(); }

$("#abas").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-aba]");
  if (b) irPara(b.dataset.aba);
});
$("#navBaixo").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.hasAttribute("data-mais")) return menuMais();
  irPara(b.dataset.aba);
});
$("#fabLote").onclick = () => modalNovoLote();

function menuMais() {
  const itens = [
    ["folha", "folha", "Folha de pagamento"],
    ["relatorios", "rel", "Relatórios"],
    ["maos", "maos", "Pessoas"],
    ["servicos", "servicos", "Produtos e serviços"],
    ["equipamentos", "equip", "Equipamentos"],
    ["gastos", "gastos", "Gastos do mês"],
    ["admin", "admin", "Administrativo"],
  ];
  const m = abrirModal({
    titulo: "Mais opções",
    conteudo: `<div class="menu-mais">
      ${itens.map(([k, ic, t]) => `<button type="button" data-ir="${k}">${icone(ic)}<span>${t}</span>${seta}</button>`).join("")}
      <button type="button" id="maisConta">${icone("conta")}<span>Minha conta</span>${seta}</button>
      <button type="button" id="maisSair" class="sair">${icone("sair")}<span>Sair</span></button>
    </div>`,
  });
  $$("[data-ir]", m.form).forEach((b) => (b.onclick = () => { m.fechar(); irPara(b.dataset.ir); }));
  $("#maisConta", m.form).onclick = () => { m.fechar(); modalMinhaConta(); };
  $("#maisSair", m.form).onclick = sair;
}

async function render() {
  try {
    await Promise.all([carregarConf(), carregarNomes()]);
    if (abaAtual === "inicio") await renderInicio();
    if (abaAtual === "minha") await renderMinha();
    if (abaAtual === "maos") await renderMaos();
    if (abaAtual === "servicos") await renderServicos();
    if (abaAtual === "fechamentos") await renderFechamentos();
    if (abaAtual === "admin") await renderAdmin();
    if (abaAtual === "folha") await renderFolha();
    if (abaAtual === "relatorios") await renderRelatorios();
    if (abaAtual === "equipamentos") await renderEquipamentos();
    if (abaAtual === "gastos") await renderGastos();
  } catch (e) {
    main.innerHTML = `<div class="card vazio">Erro ao carregar: ${esc(e.message)}</div>`;
  }
}

async function carregarMaos(soAtivas = true) {
  let c = sb.from("perfis").select("*").eq("papel", "mao_de_obra").order("nome");
  if (soAtivas) c = c.eq("ativo", true);
  const lista = await q(c);
  return soAtivas ? lista.filter((m) => !m.excluido_em) : lista;
}
async function carregarCatalogo() {
  const [produtos, servicos] = await Promise.all([
    q(sb.from("produtos").select("*").order("nome")),
    q(sb.from("servicos").select("*").order("nome")),
  ]);
  return { produtos: produtos.filter((x) => !x.excluido_em), servicos: servicos.filter((x) => !x.excluido_em) };
}

// ===============================================================
// INÍCIO — botões com os nomes das mãos de obra
// ===============================================================
async function renderInicio() {
  const mes = inicioMes();
  const [maos, abertos, ganhosMes, funcs, folhaRes] = await Promise.all([
    carregarMaos(),
    q(sb.from("v_lotes").select("id, mao_de_obra_id, mao_de_obra_nome, produto_nome, servico_nome, quantidade, valor_aberto, qtd_falta, aviso_em, aviso_mensagem").eq("status", "aberto")),
    q(sb.from("v_ganhos").select("mao_de_obra_id, origem, quantidade, valor, pago").eq("mes_ref", mes)),
    moduloAtivo("funcionarios") ? carregarFuncionarios() : Promise.resolve([]),
    moduloAtivo("funcionarios") ? rpc("resumo_folha", { p_mes: mes }).catch(() => []) : Promise.resolve([]),
  ]);
  const externas = maos.filter((m) => !ehFuncHora(m));
  const extIds = new Set(externas.map((m) => m.id));
  const porMao = {};
  const pm = (id) => (porMao[id] ??= { lotes: 0, valor: 0, avisos: 0, horas: 0, valorHoras: 0 });
  abertos.forEach((l) => {
    const x = pm(l.mao_de_obra_id);
    x.lotes += 1; x.valor += Number(l.valor_aberto);
    if (l.aviso_em) x.avisos += 1;
  });
  ganhosMes.filter((g) => g.origem === "hora").forEach((g) => { const x = pm(g.mao_de_obra_id); x.horas += Number(g.quantidade); x.valorHoras += Number(g.valor); });
  const avisos = abertos.filter((l) => l.aviso_em).sort((a, b) => (a.aviso_em < b.aviso_em ? 1 : -1));
  const emAberto = soma(abertos, "valor_aberto");
  const aPagar = ganhosMes.filter((g) => !g.pago && extIds.has(g.mao_de_obra_id)).reduce((a, g) => a + Number(g.valor), 0);
  const folhaL = Array.isArray(folhaRes) ? folhaRes : [];
  const folhaTotal = folhaL.reduce((a, r) => a + Number(r.liquido || 0), 0);
  $("#tcPonto").classList.toggle("hidden", !avisos.length);

  const tileExt = (m) => {
    const a = porMao[m.id];
    let info, ativo;
    if (porHora(m)) { ativo = !!a?.horas; info = ativo ? `${inteiro(a.horas)} h no mês · ${moeda(a.valorHoras)}` : "sem horas no mês"; }
    else { ativo = !!a?.lotes; info = ativo ? `${a.lotes} lote${a.lotes > 1 ? "s" : ""} · ${moeda(a.valor)}` : "sem lote em aberto"; }
    return `<button class="btn-nome externa ${ativo ? "" : "inativo"}" data-ficha="${m.id}" data-nome="${esc(m.nome.toLowerCase())}">
      ${porHora(m) ? `<span class="tag-hora" title="Paga por hora">⏱</span>` : ""}${esc(maiusc(m.nome))}
      <small>${info}</small>
      ${a?.avisos ? `<span class="bandeira">✋ terminou ${a.avisos > 1 ? a.avisos + " lotes" : "1 lote"}</span>` : ""}</button>`;
  };
  const tileFunc = (p) => {
    const r = linhaDaFolha(folhaL, p);
    const info = p.tipo === "mensal"
      ? `Mensal · ${p.salario != null ? moeda(p.salario) : "sem salário"}${r && Number(r.horas_extras) ? ` · ${inteiro(r.horas_extras)} h extras` : ""}`
      : `Por hora · ${inteiro(r?.horas || 0)} h no mês`;
    return `<button class="btn-nome ${p.tipo === "mensal" ? "func-mensal" : "func-hora"}" data-func="${p.chave}" data-nome="${esc(p.nome.toLowerCase())}">
      ${esc(maiusc(p.nome))}<small>${info}</small>${r?.folha_pagamento_id ? `<span class="bandeira ok">✓ pago no mês</span>` : ""}</button>`;
  };
  const secao = (k, pessoas, sub, acoes, conteudo) => `
    <section class="secao-inicio" data-secao="${k}">
      <div class="secao-cab">
        <div><h2><i class="ponto ${k}"></i>${TIPOS[k]}</h2><span>${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"} · ${sub}</span></div>
        <div class="secao-acoes">${acoes}</div>
      </div>
      ${conteudo}
    </section>`;
  const vazioSecao = (k) => `<div class="secao-vazia">Ninguém cadastrado aqui ainda. <button class="link" data-cadastrar="${k}">Cadastrar agora</button></div>`;

  main.innerHTML = `
    <div class="topo-pagina pg-inicio">
      <div class="so-pc"><h1>Início</h1><p>${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div>
      <div class="topo-acoes">
        <label class="busca"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="buscaNome" type="search" placeholder="Buscar pessoa…" autocomplete="off"></label>
        <button class="sino" id="sinoInicio" title="Avisos" aria-label="Avisos"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>${avisos.length ? `<b>${avisos.length}</b>` : ""}</button>
        ${externas.some((m) => !porHora(m)) ? `<button class="btn acento" id="btnNovoLote">＋ Enviar lote</button>` : ""}
      </div>
    </div>

    <div class="kpis-v2">
      <div class="kpi-v2 escuro"><span>Em aberto com a mão de obra</span><strong>${moeda(emAberto)}</strong><small>${abertos.length} lote${abertos.length === 1 ? "" : "s"} em aberto</small></div>
      <div class="kpi-v2"><span>A pagar no mês (externa)</span><strong>${moeda(aPagar)}</strong><small>finalizado e ainda não pago</small></div>
      <div class="kpi-v2"><span>Folha do mês</span><strong>${moeda(folhaTotal)}</strong><small>${funcs.length} funcionário${funcs.length === 1 ? "" : "s"}</small></div>
      <div class="kpi-v2 ${avisos.length ? "amarelo" : ""}"><span>Avisos</span><strong>${avisos.length}</strong><small>${avisos.length ? "terminaram lote" : "nenhum aviso novo"}</small></div>
    </div>

    ${avisos.length ? `<div class="lista-avisos" id="avisosInicio"><div class="card">
      <h3 style="margin:0 0 .4rem">✋ Avisaram que terminaram</h3>
      <ul class="lista-final">${avisos.map((l) => `<li><span><strong>${esc(l.mao_de_obra_nome)}</strong> – ${esc(l.produto_nome)}: ${esc(l.servico_nome)} – ${inteiro(l.qtd_falta)} pç
        <br><span class="small muted">${dataHoraBR(l.aviso_em)}${l.aviso_mensagem ? ` · “${esc(l.aviso_mensagem)}”` : ""}</span></span>
        <button class="btn peq" data-ficha="${l.mao_de_obra_id}">Abrir</button></li>`).join("")}</ul></div></div>` : ""}

    ${moduloAtivo("externa") ? secao("externa", externas.length, "recebem por produção (lotes)",
      externas.some((m) => !porHora(m)) ? `<button class="btn acento peq" data-novolote>＋ Enviar lote</button>` : "",
      externas.length ? `<div class="grade-nomes">${externas.map(tileExt).join("")}</div>` : vazioSecao("externa")) : ""}
    ${moduloAtivo("funcionarios") ? secao("funcionarios", funcs.length, "salário mensal ou por hora",
      `${funcs.some((p) => p.tipo === "hora") ? `<button class="btn sec peq" data-horas>⏱ Lançar horas</button>` : ""}
       <button class="btn sec peq" data-cadastrar="funcionarios">＋ Cadastrar funcionário</button>`,
      funcs.length ? `<div class="grade-nomes">${funcs.map(tileFunc).join("")}</div>
        <div class="legenda-func"><span><i class="lg-mensal"></i>Salário mensal</span><span><i class="lg-hora"></i>Por hora (tem login)</span></div>` : vazioSecao("funcionarios")) : ""}
    ${!moduloAtivo("externa") && !moduloAtivo("funcionarios") ? `<div class="card vazio">Nenhum tipo de mão de obra está ativado. Ative em <strong>Administrativo → Tipos de mão de obra</strong>.</div>` : ""}
    ${!maos.length && !funcs.length ? `<p class="muted small" style="text-align:center">Comece por <strong>Produtos e serviços</strong> e depois <strong>Pessoas</strong>.</p>` : ""}`;

  $$("[data-ficha]", main).forEach((b) => (b.onclick = () => abrirFicha(b.dataset.ficha)));
  $$("[data-func]", main).forEach((b) => (b.onclick = () => fichaFuncionario(funcs.find((p) => p.chave === b.dataset.func))));
  $$("[data-novolote]", main).forEach((b) => (b.onclick = () => modalNovoLote()));
  $$("[data-horas]", main).forEach((b) => (b.onclick = () => modalLancarHoras()));
  $$("[data-cadastrar]", main).forEach((b) => (b.onclick = () => modalNovaMo(b.dataset.cadastrar, renderInicio)));
  $("#btnNovoLote")?.addEventListener("click", () => modalNovoLote());
  $("#sinoInicio").onclick = () => (avisos.length ? $("#avisosInicio").scrollIntoView({ behavior: "smooth" }) : aviso("Nenhum aviso novo."));
  $("#buscaNome").oninput = (e) => {
    const t = e.target.value.trim().toLowerCase();
    $$("[data-nome]", main).forEach((b) => b.classList.toggle("hidden", !!t && !b.dataset.nome.includes(t)));
  };
}

// ---------------------------------------------------------------
// Ficha de quem recebe por hora
// ---------------------------------------------------------------
async function fichaHoras(mo) {
  const mes = inicioMes();
  const horas = await q(sb.from("v_horas").select("*").eq("mao_de_obra_id", mo.id).eq("mes_ref", mes).order("data", { ascending: false }));
  const totH = soma(horas, "horas"), totV = soma(horas, "valor");
  const aPagar = horas.filter((h) => !h.pago).reduce((a, h) => a + Number(h.valor), 0);
  const vh = valorHoraDe(mo);
  const m = abrirModal({
    titulo: maiusc(mo.nome),
    largo: true,
    conteudo: `
      <div class="ficha-topo">
        <div class="ficha-contato">
          <span class="selo parcial">${TIPOS[tipoDe(mo)]} · ${formaTxt(mo)}</span><br>
          ${mo.whatsapp ? `📱 <a href="${linkWhats(mo.whatsapp)}" target="_blank" rel="noopener">${esc(mo.whatsapp)}</a><br>` : ""}
          ${mo.pix ? `PIX: <strong>${esc(mo.pix)}</strong>` : ""}
        </div>
        <button type="button" class="btn acento" id="fichaHoras">⏱ Lançar horas</button>
      </div>
      <div class="totais">
        <div class="total"><div class="r">Horas em ${nomeMes(mes).split(" ")[0].toLowerCase()}</div><div class="v">${inteiro(totH)} h</div></div>
        <div class="total"><div class="r">Valor no mês</div><div class="v">${moeda(totV)}</div></div>
        <div class="total escuro"><div class="r">A pagar</div><div class="v">${moeda(aPagar)}</div></div>
      </div>
      ${vh == null ? `<div class="alerta">Defina o valor da hora no cadastro de ${esc(mo.nome.split(" ")[0])} ou em Administrativo.</div>` : ""}
      <h3>Horas lançadas em ${nomeMes(mes).toLowerCase()}</h3>
      ${horas.length ? `<ul class="lista-final">${horas.map((h) => `<li>
        <span>${diaMes(h.data)} – <strong>${inteiro(h.horas)} h</strong> × ${moeda(h.valor_hora)}${h.observacao ? `<br><span class="small muted">${esc(h.observacao)}</span>` : ""} ${autorTag(h)}</span>
        <span style="white-space:nowrap"><strong class="num">${moeda(h.valor)}</strong>
        ${h.pago ? selo("pago", "Pago") : `<button type="button" class="icon-btn" style="color:var(--bad);font-size:1rem" data-exh="${h.id}" title="Excluir">✕</button>`}</span></li>`).join("")}</ul>`
        : `<p class="muted">Nenhuma hora lançada neste mês.</p>`}
      <div class="soma-final"><span>TOTAL DO MÊS · ${inteiro(totH)} h</span><span>${moeda(totV)}</span></div>`,
  });
  $("#fichaHoras", m.form).onclick = () => { m.fechar(); modalLancarHoras(mo.id); };
  $$("[data-exh]", m.form).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Excluir este lançamento de horas?", "Excluir"))) return;
    try { await rpc("excluir_horas", { p_id: Number(b.dataset.exh) }); aviso("Lançamento excluído."); } catch (e) { aviso(e.message, true); }
    m.fechar(); fichaHoras(mo); if (abaAtual === "inicio") renderInicio();
  }));
}

async function modalLancarHoras(moId = "") {
  const maos = (await carregarMaos()).filter(porHora);
  if (!maos.length) return aviso("Ninguém está cadastrado para receber por hora. Mude a forma de pagamento no cadastro.", true);
  abrirModal({
    titulo: "Lançar horas",
    conteudo: `
      <div class="linha"><div><label>Quem trabalhou *</label><select name="mo" required><option value="">Selecione…</option>
        ${maos.map((x) => `<option value="${x.id}" ${x.id === moId ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></div></div>
      <div class="linha">
        <div><label>Dia *</label><input name="data" type="date" value="${isoLocal()}" required></div>
        <div><label>Horas trabalhadas *</label><input name="horas" type="number" min="0.25" max="24" step="0.25" inputmode="decimal" placeholder="Ex.: 8 ou 7,5" required></div>
        <div><label>Valor da hora (R$)</label><input name="valor" type="number" min="0" step="0.01" inputmode="decimal"></div>
      </div>
      <p class="muted small" style="margin-top:-.3rem">Meia hora = ,5 (ex.: 7,5 = sete horas e meia).</p>
      <div class="linha"><div><label>Observação (opcional)</label><input name="obs" placeholder="Ex.: hora extra, sábado…"></div></div>
      <div class="lote-total" style="margin:0 0 .8rem"><span>Total do dia</span><span id="prevHoras">R$ 0,00</span></div>
      <button type="submit" class="btn bloco acento">Lançar</button>`,
    aoAbrir: (f) => {
      const atual = () => { const mo = maos.find((x) => x.id === f.mo.value); if (mo) f.valor.value = valorHoraDe(mo) ?? ""; prev(); };
      const prev = () => ($("#prevHoras", f).textContent = moeda(Number(f.horas.value || 0) * Number(f.valor.value || 0)));
      f.mo.onchange = atual; f.horas.oninput = f.valor.oninput = prev;
      atual();
    },
    onSubmit: async (fd) => {
      const mo = fd.get("mo"), h = Number(fd.get("horas"));
      if (!mo) throw new Error("Escolha quem trabalhou.");
      if (!(h > 0 && h <= 24)) throw new Error("Informe as horas (entre 0 e 24).");
      if (fd.get("valor") === "") throw new Error("Informe o valor da hora.");
      await rpc("lancar_horas", { p_mao_de_obra: mo, p_data: fd.get("data"), p_horas: h, p_valor_hora: Number(fd.get("valor")), p_observacao: fd.get("obs") || null });
      aviso("Horas lançadas!");
      if (abaAtual === "inicio") renderInicio();
      if (moId) abrirFicha(mo);
      if (abaAtual === "folha") renderFolha();
    },
  });
}

// ---------------------------------------------------------------
// Ficha da mão de obra (abre ao clicar no nome)
// ---------------------------------------------------------------
async function abrirFicha(moId) {
  const mes = inicioMes();
  const [[mo], abertos, entregasMes] = await Promise.all([
    q(sb.from("perfis").select("*").eq("id", moId)),
    q(sb.from("v_lotes").select("*").eq("mao_de_obra_id", moId).eq("status", "aberto").order("enviado_em")),
    q(sb.from("v_entregas").select("*").eq("mao_de_obra_id", moId).eq("mes_ref", mes).order("entregue_em", { ascending: false })),
  ]);
  if (ehFuncHora(mo)) return fichaFuncionario((await carregarFuncionarios(true)).find((x) => x.chave === `p${mo.id}`));
  if (porHora(mo)) return fichaHoras(mo);

  const valorAberto = soma(abertos, "valor_aberto");
  const valorFinal = soma(entregasMes, "valor");

  // Agrupa o que está em aberto por produto + serviço
  const grupos = {};
  abertos.forEach((l) => {
    const k = `${l.produto_nome} · ${l.servico_nome}`;
    grupos[k] ??= { qtd: 0, valor: 0 };
    grupos[k].qtd += l.qtd_falta; grupos[k].valor += Number(l.valor_aberto);
  });

  const m = abrirModal({
    titulo: maiusc(mo.nome),
    largo: true,
    conteudo: `
      <div class="ficha-topo">
        <div class="ficha-contato">
          <span class="selo parcial">${TIPOS[tipoDe(mo)]} · Por produção</span><br>
          ${mo.whatsapp ? `📱 <a href="${linkWhats(mo.whatsapp)}" target="_blank" rel="noopener">${esc(mo.whatsapp)}</a><br>` : ""}
          ${mo.endereco ? `📍 ${esc(mo.endereco)}<br>` : ""}
          ${mo.pix ? `PIX: <strong>${esc(mo.pix)}</strong> <button type="button" class="btn sec peq" id="copiarPix">Copiar</button>` : ""}
        </div>
        <button type="button" class="btn acento" id="fichaNovoLote">＋ Enviar lote</button>
      </div>

      <div class="totais">
        <div class="total amarelo"><div class="r">Em aberto</div><div class="v">${moeda(valorAberto)}</div></div>
        <div class="total"><div class="r">Finalizado em ${nomeMes(mes).split(" ")[0].toLowerCase()}</div><div class="v">${moeda(valorFinal)}</div></div>
        <div class="total escuro"><div class="r">Saldo a receber</div><div class="v">${moeda(valorAberto + valorFinal)}</div></div>
      </div>

      <h3>Em aberto com ${esc(mo.nome.split(" ")[0])}</h3>
      ${Object.keys(grupos).length ? `<div class="tabela-wrap" style="margin-bottom:.8rem"><table>
        <thead><tr><th>Produto · serviço</th><th class="right">Peças</th><th class="right">Valor</th></tr></thead>
        <tbody>${Object.entries(grupos).map(([k, g]) => `<tr><td>${esc(k)}</td><td class="right num">${inteiro(g.qtd)}</td><td class="right num">${moeda(g.valor)}</td></tr>`).join("")}</tbody>
      </table></div>` : ""}
      ${abertos.length ? abertos.map((l) => `
        <div class="mini-lote">
          <div class="linha1"><span>${diaMes(l.enviado_em)} – ${esc(maiusc(l.produto_nome))}: ${esc(maiusc(l.servico_nome))} – ${inteiro(l.quantidade)} PEÇAS</span>
            <span class="valor">${moeda(l.valor_total)}</span></div>
          <div class="linha2">${moeda(l.valor_unitario)} por peça · Entregue: ${inteiro(l.qtd_entregue)} · Falta: <strong>${inteiro(l.qtd_falta)}</strong> (${moeda(l.valor_aberto)})
            ${l.observacoes ? `<br>Obs.: ${esc(l.observacoes)}` : ""} ${autorTag(l)}</div>
          ${l.aviso_em ? `<div class="aviso-terminou"><span>✋ Avisou que terminou em ${dataHoraBR(l.aviso_em)}${l.aviso_mensagem ? ` — “${esc(l.aviso_mensagem)}”` : ""}</span>
            <button type="button" class="btn sec peq" data-dispensar="${l.id}">Dispensar aviso</button></div>` : ""}
          <div class="acoes">
            <button type="button" class="btn sec peq" data-parcial="${l.id}">Entrega parcial</button>
            <button type="button" class="btn pronto peq" data-pronto="${l.id}">✓ Lote pronto</button>
            ${l.qtd_entregue === 0 ? `<button type="button" class="btn perigo peq" data-cancelar="${l.id}">Cancelar</button>` : ""}
          </div>
        </div>`).join("") : `<p class="muted">Nenhum lote em aberto.</p>`}

      <h3 style="margin-top:1.2rem">Finalizado em ${nomeMes(mes).toLowerCase()} ${entregasMes.length && entregasMes.every((e) => e.pago) ? selo("pago", "Tudo pago") : ""}</h3>
      ${entregasMes.length ? `<ul class="lista-final">${entregasMes.map((e) => `
        <li><span>${diaMes(e.entregue_em)} – ${esc(e.produto_nome)}: ${esc(e.servico_nome)} – ${inteiro(e.quantidade)} pç ${selo(e.tipo === "pronto" ? "pronto" : "parcial", e.tipo === "pronto" ? "Lote pronto" : "Parcial")} ${autorTag(e)}</span>
          <span style="white-space:nowrap"><strong class="num">${moeda(e.valor)}</strong>
          ${e.pago ? selo("pago", "Pago") : `<button type="button" class="icon-btn" style="color:var(--muted);font-size:1rem" data-desfazer="${e.id}" title="Desfazer">↺</button>`}</span></li>`).join("")}</ul>`
        : `<p class="muted">Nada finalizado neste mês ainda.</p>`}
      <div class="soma-final"><span>TOTAL FINALIZADO NO MÊS</span><span>${moeda(valorFinal)}</span></div>`,
  });
  const f = m.form;
  const recarregar = () => { m.fechar(); abrirFicha(moId); if (abaAtual === "inicio") renderInicio(); };

  $("#copiarPix", f)?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(mo.pix); aviso("Chave PIX copiada!"); } catch { aviso("Não foi possível copiar.", true); }
  });
  $("#fichaNovoLote", f).onclick = () => { m.fechar(); modalNovoLote(moId); };

  $$("[data-pronto]", f).forEach((b) => (b.onclick = async () => {
    const l = abertos.find((x) => x.id == b.dataset.pronto);
    if (!(await confirmar(`Finalizar o lote ${l.produto_nome}: ${l.servico_nome}? As ${inteiro(l.qtd_falta)} peças que faltam (${moeda(l.valor_aberto)}) vão para o finalizado.`, "Lote pronto"))) return;
    try { await rpc("lote_pronto", { p_lote: l.id }); aviso("Lote pronto!"); } catch (e) { aviso(e.message, true); }
    recarregar();
  }));

  $$("[data-parcial]", f).forEach((b) => (b.onclick = () => {
    const l = abertos.find((x) => x.id == b.dataset.parcial);
    m.fechar();
    abrirModal({
      titulo: "Entrega parcial",
      conteudo: `<p><strong>${esc(l.produto_nome)}: ${esc(l.servico_nome)}</strong><br><span class="muted small">Faltam ${inteiro(l.qtd_falta)} peças · ${moeda(l.valor_unitario)} por peça</span></p>
        <div class="linha"><div><label>Quantas peças ela entregou?</label><input name="qtd" type="number" min="1" max="${l.qtd_falta}" required inputmode="numeric"></div></div>
        <p class="small" id="prevParcial"></p>
        <button type="submit" class="btn bloco">Registrar entrega</button>`,
      aoAbrir: (fm) => { fm.qtd.oninput = () => ($("#prevParcial", fm).innerHTML = `Valor: <strong>${moeda(Number(fm.qtd.value || 0) * l.valor_unitario)}</strong>`); },
      onSubmit: async (fd) => {
        const qtd = parseInt(fd.get("qtd"), 10);
        if (!(qtd > 0)) throw new Error("Informe a quantidade.");
        await rpc("registrar_entrega", { p_lote: l.id, p_quantidade: qtd });
        aviso(qtd === l.qtd_falta ? "Entrega registrada — lote pronto!" : "Entrega parcial registrada!");
        abrirFicha(moId); if (abaAtual === "inicio") renderInicio();
      },
    });
  }));

  $$("[data-dispensar]", f).forEach((b) => (b.onclick = async () => {
    try { await rpc("dispensar_aviso", { p_lote: Number(b.dataset.dispensar) }); aviso("Aviso dispensado."); } catch (e) { aviso(e.message, true); }
    recarregar();
  }));

  $$("[data-cancelar]", f).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Cancelar este lote? Ele some do saldo em aberto.", "Cancelar lote"))) return;
    try { await rpc("cancelar_lote", { p_lote: Number(b.dataset.cancelar) }); aviso("Lote cancelado."); } catch (e) { aviso(e.message, true); }
    recarregar();
  }));

  $$("[data-desfazer]", f).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Desfazer esta entrega? As peças voltam para 'em aberto'.", "Desfazer"))) return;
    try { await rpc("desfazer_entrega", { p_entrega: Number(b.dataset.desfazer) }); aviso("Entrega desfeita."); } catch (e) { aviso(e.message, true); }
    recarregar();
  }));
}

// ---------------------------------------------------------------
// Enviar lote (um produto + um serviço)
// ---------------------------------------------------------------
async function modalNovoLote(moId = "") {
  const [todas, { produtos, servicos }] = await Promise.all([carregarMaos(), carregarCatalogo()]);
  const maos = todas.filter((m) => !porHora(m));
  const prodAtivos = produtos.filter((p) => p.ativo && servicos.some((s) => s.produto_id === p.id && s.ativo));
  if (!maos.length) return aviso("Cadastre uma mão de obra que recebe por produção primeiro.", true);
  if (!prodAtivos.length) return aviso("Cadastre um produto com pelo menos um serviço primeiro.", true);

  const linhaItem = () => `<div class="item-lote">
      <div class="linha">
        <div><label>Produto *</label><select name="produto"><option value="">Selecione…</option>${prodAtivos.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select></div>
        <div><label>Serviço *</label><select name="servico" disabled><option value="">Escolha o produto</option></select></div>
      </div>
      <div class="linha" style="grid-template-columns:1fr 1fr auto;align-items:end">
        <div><label>Quantidade de peças *</label><input name="quantidade" type="number" min="1" step="1" inputmode="numeric"></div>
        <div><label>Valor por peça (R$)</label><input name="valor" type="number" min="0" step="0.01"></div>
        <button type="button" class="btn perigo peq" data-remover title="Remover este serviço">✕</button>
      </div>
      <div class="item-sub"><span class="item-num"></span><span class="item-total">R$ 0,00</span></div>
    </div>`;

  abrirModal({
    titulo: "Enviar lote",
    conteudo: `
      <div class="linha"><div><label>Mão de obra *</label><select name="mo" required>
        <option value="">Selecione…</option>${maos.map((x) => `<option value="${x.id}" ${x.id === moId ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></div></div>
      <div id="itens">${linhaItem()}</div>
      <button type="button" class="btn sec bloco" id="addItem" style="margin-bottom:.8rem">＋ Adicionar outro serviço</button>
      <div class="lote-total" style="margin:0 0 .8rem"><span id="qtdItens">Total</span><span id="prevTotal">R$ 0,00</span></div>
      <div class="linha"><div><label>Observação (opcional)</label><input name="obs" placeholder="Cor, tamanho, detalhe…"></div></div>
      <button type="submit" class="btn bloco acento">Enviar</button>`,
    aoAbrir: (f) => {
      const itens = $("#itens", f);
      const atualizar = () => {
        const linhas = $$(".item-lote", itens);
        let total = 0;
        linhas.forEach((r, i) => {
          const t = Number($("[name=quantidade]", r).value || 0) * Number($("[name=valor]", r).value || 0);
          total += t;
          $(".item-num", r).textContent = linhas.length > 1 ? `Serviço ${i + 1}` : "Total deste serviço";
          $(".item-total", r).textContent = moeda(t);
          $("[data-remover]", r).style.visibility = linhas.length > 1 ? "visible" : "hidden";
        });
        $("#qtdItens", f).textContent = linhas.length > 1 ? `Total dos ${linhas.length} serviços` : "Total do lote";
        $("#prevTotal", f).textContent = moeda(total);
      };
      itens.addEventListener("change", (e) => {
        const r = e.target.closest(".item-lote");
        if (e.target.name === "produto") {
          const lista = servicos.filter((s) => s.produto_id == e.target.value && s.ativo);
          const sel = $("[name=servico]", r);
          sel.innerHTML = `<option value="">Selecione…</option>` + lista.map((s) => `<option value="${s.id}" data-valor="${s.valor_unitario}">${esc(s.nome)} — ${moeda(s.valor_unitario)}</option>`).join("");
          sel.disabled = !lista.length; $("[name=valor]", r).value = "";
        }
        if (e.target.name === "servico") $("[name=valor]", r).value = e.target.selectedOptions[0]?.dataset.valor ?? "";
        atualizar();
      });
      itens.addEventListener("input", atualizar);
      itens.addEventListener("click", (e) => { if (e.target.closest("[data-remover]")) { e.target.closest(".item-lote").remove(); atualizar(); } });
      $("#addItem", f).onclick = () => { itens.insertAdjacentHTML("beforeend", linhaItem()); atualizar(); };
      atualizar();
    },
    onSubmit: async (fd, f) => {
      const mo = fd.get("mo");
      if (!mo) throw new Error("Escolha a mão de obra.");
      const lista = $$(".item-lote", f).map((r, i) => ({
        n: i + 1,
        servico: Number($("[name=servico]", r).value),
        qtd: parseInt($("[name=quantidade]", r).value, 10),
        valor: $("[name=valor]", r).value,
      }));
      for (const it of lista) {
        if (!it.servico) throw new Error(`Escolha o produto e o serviço${lista.length > 1 ? ` (serviço ${it.n})` : ""}.`);
        if (!(it.qtd > 0)) throw new Error(`Informe a quantidade de peças${lista.length > 1 ? ` (serviço ${it.n})` : ""}.`);
      }
      let enviados = 0;
      try {
        for (const it of lista) {
          await rpc("enviar_lote", {
            p_mao_de_obra: mo, p_servico: it.servico, p_quantidade: it.qtd,
            p_observacoes: fd.get("obs") || null, p_valor_unitario: it.valor === "" ? null : Number(it.valor),
          });
          enviados++;
        }
      } catch (e) {
        if (enviados) { renderInicio(); throw new Error(`${enviados} de ${lista.length} enviados. Erro no serviço ${enviados + 1}: ${e.message}`); }
        throw e;
      }
      aviso(lista.length > 1 ? `${lista.length} lotes enviados!` : "Lote enviado!");
      if (abaAtual === "inicio") renderInicio();
      if (moId) abrirFicha(mo);
    },
  });
}

// ===============================================================
// MINHA MÃO DE OBRA — serviço que o dono pega das empresas
// ===============================================================
let mesMinha = inicioMes().slice(0, 7);

async function renderMinha() {
  const mes = `${mesMinha}-01`;
  const [entradas, distrib, entregasMes, empresas] = await Promise.all([
    q(sb.from("v_entradas").select("*").eq("mes_ref", mes).order("data", { ascending: false }).order("id", { ascending: false })),
    q(sb.from("v_distribuicao").select("*").order("produto_nome").order("servico_nome")),
    q(sb.from("v_ganhos").select("valor").eq("mes_ref", mes)),
    q(sb.from("empresas").select("*").order("nome")),
  ]);
  const receber = soma(entradas, "valor_total");
  const pagar = soma(entregasMes, "valor");
  const porEmpresa = {};
  entradas.forEach((e) => {
    porEmpresa[e.empresa_nome] ??= { qtd: 0, valor: 0 };
    porEmpresa[e.empresa_nome].qtd += e.quantidade; porEmpresa[e.empresa_nome].valor += Number(e.valor_total);
  });

  main.innerHTML = `
    <div class="topo-pagina"><div><h1>Minha mão de obra</h1><p>Tudo o que o Bruno recebe das empresas para distribuir às mãos de obra.</p></div></div>
    <div class="section-head"><span></span>
      <span style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
        <input type="month" id="mesMinha" value="${mesMinha}" style="width:auto">
        <button class="btn sec" id="btnEmpresas">🏢 Empresas</button>
        <button class="btn acento" id="btnEntrada">＋ Nova entrada</button>
      </span></div>
    <div class="totais">
      <div class="total escuro"><div class="r">A receber das empresas</div><div class="v">${moeda(receber)}</div></div>
      <div class="total"><div class="r">Pagar às mãos de obra (finalizado)</div><div class="v">${moeda(pagar)}</div></div>
      <div class="total ${receber - pagar >= 0 ? "verde" : "amarelo"}"><div class="r">Lucro estimado do mês</div><div class="v">${moeda(receber - pagar)}</div></div>
    </div>

    <div class="grid-admin">
      <div class="card">
        <h2>Falta distribuir</h2>
        <p class="muted small" style="margin-top:0">Total que entrou das empresas menos o que já foi enviado em lotes (todos os meses).</p>
        ${distrib.length ? `<div class="tabela-wrap"><table>
          <thead><tr><th>Produto · serviço</th><th class="right">Entrou</th><th class="right">Distribuído</th><th class="right">Falta</th></tr></thead>
          <tbody>${distrib.map((d) => `<tr><td>${esc(d.produto_nome)} · ${esc(d.servico_nome)}</td>
            <td class="right num">${inteiro(d.entrou)}</td><td class="right num">${inteiro(d.distribuido)}</td>
            <td class="right num">${d.falta > 0 ? `<strong>${inteiro(d.falta)}</strong>` : d.falta < 0 ? `<span class="small" style="color:var(--warn)" title="Foi distribuído mais do que entrou">${inteiro(d.falta)} ⚠</span>` : "0 ✓"}</td></tr>`).join("")}</tbody>
        </table></div>` : `<p class="muted">Nenhuma entrada ainda.</p>`}
      </div>
      <div class="card">
        <h2>Por empresa em ${nomeMes(mes).split(" ")[0].toLowerCase()}</h2>
        ${Object.keys(porEmpresa).length ? `<ul class="lista-final">${Object.entries(porEmpresa).sort((a, b) => b[1].valor - a[1].valor).map(([n, v]) =>
          `<li><span><strong>${esc(n)}</strong><br><span class="small muted">${inteiro(v.qtd)} peças</span></span><strong class="num">${moeda(v.valor)}</strong></li>`).join("")}</ul>`
          : `<p class="muted">Nenhuma entrada neste mês.</p>`}
      </div>
    </div>

    <div class="section" style="margin-top:1rem">
      <h2>Entradas de ${nomeMes(mes).toLowerCase()}</h2>
      ${entradas.length ? entradas.map((e) => `
        <div class="mini-lote entrada">
          <div class="linha1"><span>${diaMes(e.data)} – ${esc(maiusc(e.empresa_nome))} – ${esc(maiusc(e.produto_nome))}: ${esc(maiusc(e.servico_nome))} – ${inteiro(e.quantidade)} PEÇAS</span>
            <span class="valor">${moeda(e.valor_total)}</span></div>
          <div class="linha2">Empresa paga ${moeda(e.valor_unitario)}/peça · mão de obra ${moeda(e.valor_mao_de_obra)}/peça ·
            lucro <strong>${moeda((e.valor_unitario - e.valor_mao_de_obra) * e.quantidade)}</strong>${e.observacoes ? `<br>Obs.: ${esc(e.observacoes)}` : ""} ${autorTag(e)}</div>
          <div class="acoes"><button class="btn sec peq" data-edent="${e.id}">Editar</button><button class="btn perigo peq" data-rment="${e.id}">Excluir</button></div>
        </div>`).join("") : `<div class="card vazio">Nenhuma entrada em ${nomeMes(mes).toLowerCase()}. Clique em <strong>＋ Nova entrada</strong>.</div>`}
    </div>`;

  $("#mesMinha").onchange = (e) => { mesMinha = e.target.value || mesMinha; renderMinha(); };
  $("#btnEntrada").onclick = () => modalEntrada(empresas);
  $("#btnEmpresas").onclick = () => modalEmpresas(empresas);
  $$("[data-rment]", main).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Excluir esta entrada?", "Excluir"))) return;
    try { await q(sb.from("entradas").delete().eq("id", b.dataset.rment)); aviso("Entrada excluída."); renderMinha(); } catch (e) { aviso(e.message, true); }
  }));
  $$("[data-edent]", main).forEach((b) => (b.onclick = () => {
    const e = entradas.find((x) => x.id == b.dataset.edent);
    abrirModal({
      titulo: `Editar entrada — ${e.empresa_nome}`,
      conteudo: `<p class="muted small">${esc(e.produto_nome)}: ${esc(e.servico_nome)}</p>
        <div class="linha">
          <div><label>Data</label><input name="data" type="date" value="${e.data}" required></div>
          <div><label>Quantidade de peças</label><input name="qtd" type="number" min="1" value="${e.quantidade}" required></div>
          <div><label>Empresa paga (R$/peça)</label><input name="valor" type="number" step="0.01" min="0" value="${e.valor_unitario}" required></div>
        </div>
        <div class="linha"><div><label>Observação</label><input name="obs" value="${esc(e.observacoes)}"></div></div>
        <button type="submit" class="btn bloco">Salvar</button>`,
      onSubmit: async (fd) => {
        const qtd = parseInt(fd.get("qtd"), 10);
        if (!(qtd > 0) || fd.get("valor") === "" || !fd.get("data")) throw new Error("Preencha data, quantidade e valor.");
        await q(sb.from("entradas").update({ data: fd.get("data"), quantidade: qtd, valor_unitario: Number(fd.get("valor")), observacoes: fd.get("obs") || null }).eq("id", e.id));
        aviso("Entrada atualizada!"); renderMinha();
      },
    });
  }));
}

async function modalEntrada(empresas) {
  const { produtos, servicos } = await carregarCatalogo();
  const prodAtivos = produtos.filter((p) => p.ativo && servicos.some((s) => s.produto_id === p.id && s.ativo));
  if (!prodAtivos.length) return aviso("Cadastre os produtos e serviços primeiro (aba Cadastros serviços).", true);
  const ativas = empresas.filter((e) => e.ativo);
  const hoje = new Date(); const z = (n) => String(n).padStart(2, "0");
  const hojeIso = `${hoje.getFullYear()}-${z(hoje.getMonth() + 1)}-${z(hoje.getDate())}`;

  const linhaItem = () => `<div class="item-lote">
      <div class="linha">
        <div><label>Produto *</label><select name="produto"><option value="">Selecione…</option>${prodAtivos.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select></div>
        <div><label>Serviço *</label><select name="servico" disabled><option value="">Escolha o produto</option></select></div>
      </div>
      <div class="linha" style="grid-template-columns:1fr 1fr auto;align-items:end">
        <div><label>Quantidade de peças *</label><input name="quantidade" type="number" min="1" step="1" inputmode="numeric"></div>
        <div><label>Empresa paga (R$/peça) *</label><input name="valor" type="number" min="0" step="0.01"></div>
        <button type="button" class="btn perigo peq" data-remover title="Remover">✕</button>
      </div>
      <div class="item-sub"><span class="item-num"></span><span class="item-total">R$ 0,00</span></div>
    </div>`;

  abrirModal({
    titulo: "Nova entrada de serviço",
    conteudo: `
      <div class="linha" style="grid-template-columns:2fr 1fr">
        <div><label>Empresa *</label><select name="empresa">
          <option value="">Selecione…</option>${ativas.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join("")}
          <option value="nova">＋ Cadastrar nova empresa…</option></select></div>
        <div><label>Data *</label><input name="data" type="date" value="${hojeIso}" required></div>
      </div>
      <div class="linha hidden" id="novaEmpresa"><div><label>Nome da nova empresa *</label><input name="empresa_nome" placeholder="Ex.: Lar Decor"></div></div>
      <div id="itens">${linhaItem()}</div>
      <button type="button" class="btn sec bloco" id="addItem" style="margin-bottom:.8rem">＋ Adicionar outro serviço</button>
      <div class="lote-total" style="margin:0 0 .4rem"><span id="qtdItens">Total a receber</span><span id="prevTotal">R$ 0,00</span></div>
      <p class="small muted" id="prevLucro" style="margin:0 0 .8rem"></p>
      <div class="linha"><div><label>Observação (opcional)</label><input name="obs" placeholder="Nota fiscal, pedido, prazo…"></div></div>
      <button type="submit" class="btn bloco acento">Registrar entrada</button>`,
    aoAbrir: (f) => {
      const itens = $("#itens", f);
      f.empresa.onchange = () => $("#novaEmpresa", f).classList.toggle("hidden", f.empresa.value !== "nova");
      const atualizar = () => {
        const linhas = $$(".item-lote", itens);
        let total = 0, lucro = 0;
        linhas.forEach((r, i) => {
          const qtd = Number($("[name=quantidade]", r).value || 0), v = Number($("[name=valor]", r).value || 0);
          const mo = Number($("[name=servico]", r).selectedOptions[0]?.dataset.mo || 0);
          total += qtd * v; lucro += qtd * (v - mo);
          $(".item-num", r).textContent = mo ? `Mão de obra recebe ${moeda(mo)}/peça · lucro ${moeda(v - mo)}/peça` : (linhas.length > 1 ? `Serviço ${i + 1}` : "");
          $(".item-total", r).textContent = moeda(qtd * v);
          $("[data-remover]", r).style.visibility = linhas.length > 1 ? "visible" : "hidden";
        });
        $("#qtdItens", f).textContent = linhas.length > 1 ? `Total a receber (${linhas.length} serviços)` : "Total a receber";
        $("#prevTotal", f).textContent = moeda(total);
        $("#prevLucro", f).innerHTML = total ? `Lucro estimado: <strong>${moeda(lucro)}</strong>` : "";
      };
      itens.addEventListener("change", (e) => {
        const r = e.target.closest(".item-lote");
        if (e.target.name === "produto") {
          const lista = servicos.filter((s) => s.produto_id == e.target.value && s.ativo);
          const sel = $("[name=servico]", r);
          sel.innerHTML = `<option value="">Selecione…</option>` + lista.map((s) => `<option value="${s.id}" data-cliente="${s.valor_cliente ?? ""}" data-mo="${s.valor_unitario}">${esc(s.nome)}</option>`).join("");
          sel.disabled = !lista.length; $("[name=valor]", r).value = "";
        }
        if (e.target.name === "servico") $("[name=valor]", r).value = e.target.selectedOptions[0]?.dataset.cliente ?? "";
        atualizar();
      });
      itens.addEventListener("input", atualizar);
      itens.addEventListener("click", (e) => { if (e.target.closest("[data-remover]")) { e.target.closest(".item-lote").remove(); atualizar(); } });
      $("#addItem", f).onclick = () => { itens.insertAdjacentHTML("beforeend", linhaItem()); atualizar(); };
      atualizar();
    },
    onSubmit: async (fd, f) => {
      let empresa = fd.get("empresa");
      if (!empresa) throw new Error("Escolha a empresa.");
      if (!fd.get("data")) throw new Error("Informe a data.");
      const lista = $$(".item-lote", f).map((r, i) => ({
        n: i + 1, servico: Number($("[name=servico]", r).value), produto: Number($("[name=produto]", r).value),
        qtd: parseInt($("[name=quantidade]", r).value, 10), valor: $("[name=valor]", r).value,
      }));
      for (const it of lista) {
        const sfx = lista.length > 1 ? ` (serviço ${it.n})` : "";
        if (!it.servico) throw new Error(`Escolha o produto e o serviço${sfx}.`);
        if (!(it.qtd > 0)) throw new Error(`Informe a quantidade de peças${sfx}.`);
        if (it.valor === "" || Number(it.valor) < 0) throw new Error(`Informe quanto a empresa paga por peça${sfx}.`);
      }
      if (empresa === "nova") {
        const nome = String(fd.get("empresa_nome") || "").trim();
        if (!nome) throw new Error("Informe o nome da nova empresa.");
        const [nova] = await q(sb.from("empresas").insert({ nome }).select());
        empresa = nova.id;
      }
      await q(sb.from("entradas").insert(lista.map((it) => ({
        empresa_id: Number(empresa), produto_id: it.produto, servico_id: it.servico, quantidade: it.qtd,
        valor_unitario: Number(it.valor), data: fd.get("data"), observacoes: fd.get("obs") || null,
      }))));
      aviso(lista.length > 1 ? `${lista.length} entradas registradas!` : "Entrada registrada!");
      renderMinha();
    },
  });
}

function modalEmpresas(empresas) {
  abrirModal({
    titulo: "Empresas",
    conteudo: `
      ${empresas.length ? `<ul class="lista-final">${empresas.filter((e) => !e.excluido_em).map((e) => `<li class="${e.ativo ? "" : "muted"}">
        <span><strong>${esc(e.nome)}</strong>${e.whatsapp ? `<br><span class="small">${esc(e.whatsapp)}</span>` : ""}${e.ativo ? "" : " <span class='small'>(inativa)</span>"}</span>
        <button type="button" class="btn sec peq" data-edemp="${e.id}">Editar</button></li>`).join("")}</ul>` : `<p class="muted">Nenhuma empresa cadastrada.</p>`}
      <h3 style="margin-top:1rem">Nova empresa</h3>
      <div class="linha"><div><label>Nome *</label><input name="nome"></div><div><label>WhatsApp</label><input name="whatsapp" inputmode="tel"></div></div>
      <button type="submit" class="btn bloco">Adicionar empresa</button>`,
    aoAbrir: (f, fechar) => {
      $$("[data-edemp]", f).forEach((b) => (b.onclick = () => {
        const e = empresas.find((x) => x.id == b.dataset.edemp);
        fechar();
        abrirModal({
          titulo: "Editar empresa",
          conteudo: `<div class="linha"><div><label>Nome *</label><input name="nome" value="${esc(e.nome)}" required></div><div><label>WhatsApp</label><input name="whatsapp" value="${esc(e.whatsapp)}"></div></div>
            <label style="display:flex;gap:.5rem;align-items:center;margin-bottom:.8rem"><input type="checkbox" name="ativo" style="width:auto" ${e.ativo ? "checked" : ""}> Ativa</label>
            <button type="submit" class="btn bloco">Salvar</button>
            <button type="button" class="btn perigo bloco" id="exEmp" style="margin-top:.5rem">Excluir empresa</button>`,
          aoAbrir: (f2, fechar2) => {
            $("#exEmp", f2).onclick = async () => {
              if (!(await confirmar(`Excluir a empresa ${e.nome}? As entradas antigas continuam nos relatórios.`, "Excluir"))) return;
              try { await q(sb.from("empresas").update({ excluido_em: agoraIso(), ativo: false }).eq("id", e.id)); fechar2(); aviso("Empresa excluída."); renderMinha(); }
              catch (err) { aviso(err.message, true); }
            };
          },
          onSubmit: async (fd) => {
            if (!fd.get("nome")) throw new Error("Informe o nome.");
            await q(sb.from("empresas").update({ nome: fd.get("nome"), whatsapp: fd.get("whatsapp") || null, ativo: fd.get("ativo") === "on" }).eq("id", e.id));
            aviso("Empresa salva!"); renderMinha();
          },
        });
      }));
    },
    onSubmit: async (fd) => {
      const nome = String(fd.get("nome") || "").trim();
      if (!nome) throw new Error("Informe o nome da empresa.");
      await q(sb.from("empresas").insert({ nome, whatsapp: fd.get("whatsapp") || null }));
      aviso("Empresa adicionada!"); renderMinha();
    },
  });
}

// ===============================================================
// CADASTROS MÃO DE OBRA
// ===============================================================
let filtroCad = "todos";

// Campos do cadastro da mão de obra externa
function camposMo(m = {}) {
  const forma = m.forma_pagamento || CONF.pag_padrao_externa || "producao";
  return `
    <div class="linha"><div><label>Nome *</label><input name="nome" value="${esc(m.nome)}" required></div></div>
    <div class="linha">
      <div><label>Recebe *</label><select name="forma_pagamento">${Object.entries(FORMAS).map(([k, t]) => `<option value="${k}" ${forma === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="campo-hora ${forma === "hora" ? "" : "hidden"}"><label>Valor da hora (R$)</label><input name="valor_hora" type="number" min="0" step="0.01" value="${m.valor_hora ?? ""}" placeholder="${numConf("valor_hora_padrao") != null ? `padrão ${moeda(numConf("valor_hora_padrao"))}` : ""}"></div>
      <div><label>Fechamento</label><select name="frequencia_pagamento">${Object.entries(FREQUENCIAS).map(([k, t]) =>
        `<option value="${k}" ${(m.frequencia_pagamento || "mensal") === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
    </div>
    <div class="linha">
      <div><label>WhatsApp</label><input name="whatsapp" value="${esc(m.whatsapp)}" inputmode="tel" placeholder="(11) 99999-9999"></div>
      <div><label>Chave PIX</label><input name="pix" value="${esc(m.pix)}" placeholder="CPF, telefone, e-mail ou aleatória"></div>
    </div>
    <div class="linha"><div><label>Endereço</label><input name="endereco" value="${esc(m.endereco)}"></div></div>`;
}
function ligarCamposMo(f) {
  const mostrar = () => $(".campo-hora", f).classList.toggle("hidden", f.forma_pagamento.value !== "hora");
  f.forma_pagamento.onchange = mostrar;
}
const dadosMo = (fd) => ({
  tipo: "externa",
  forma_pagamento: fd.get("forma_pagamento") || "producao",
  valor_hora: fd.get("forma_pagamento") === "hora" && fd.get("valor_hora") !== "" ? Number(fd.get("valor_hora")) : null,
  frequencia_pagamento: fd.get("frequencia_pagamento") || "mensal",
});

function modalNovaMo(tipo = "externa", depois = renderMaos) {
  if (tipo !== "externa") return modalFuncionario(null, depois);
  abrirModal({
    titulo: "Nova mão de obra externa",
    conteudo: `${camposMo({})}
      <div class="linha">
        <div><label>Usuário (login) *</label><input name="usuario" required autocapitalize="none" placeholder="ex.: adriana"></div>
        <div><label>Senha inicial *</label><input name="senha" required minlength="6" placeholder="mín. 6 caracteres"></div>
      </div>
      <button type="submit" class="btn bloco">Criar acesso</button>`,
    aoAbrir: ligarCamposMo,
    onSubmit: async (fd) => {
      if (!String(fd.get("nome") || "").trim()) throw new Error("Informe o nome.");
      const novo = await adminUsuarios({ acao: "criar", nome: fd.get("nome"), usuario: fd.get("usuario"), senha: fd.get("senha"),
        whatsapp: fd.get("whatsapp"), pix: fd.get("pix"), endereco: fd.get("endereco") });
      if (novo?.id) await q(sb.from("perfis").update(dadosMo(fd)).eq("id", novo.id));
      aviso(`Acesso criado! Usuário: ${String(fd.get("usuario")).trim().toLowerCase()}`);
      depois();
    },
  });
}

async function renderMaos() {
  const [todas, funcs] = await Promise.all([carregarMaos(false), carregarFuncionarios()]);
  const externas = todas.filter((m) => !ehFuncHora(m) && !m.excluido_em);
  const filtros = [["todos", "Todos", externas.length + funcs.length], ["externa", "Mão de obra externa", externas.length], ["funcionarios", "Funcionários", funcs.length]];
  const verExt = filtroCad !== "funcionarios", verFunc = filtroCad !== "externa";

  main.innerHTML = `
    <div class="topo-pagina">
      <div><h1>Pessoas</h1><p>Mão de obra externa (lotes, com login) e funcionários da fábrica (salário mensal ou por hora).</p></div>
      <div class="topo-acoes"><button class="btn acento" id="novoMo">＋ Novo cadastro</button></div>
    </div>
    <div class="seg filtros-cad">${filtros.map(([k, t, n]) => `<button class="${k === filtroCad ? "ativo" : ""}" data-filtro="${k}">${t} <b>${n}</b></button>`).join("")}</div>
    ${verExt ? `<h2 class="sub-cad">Mão de obra externa</h2>
      ${externas.length ? `<div class="card tabela-wrap"><table>
      <thead><tr><th>Nome</th><th>Recebe</th><th>Usuário</th><th>WhatsApp</th><th>Chave PIX</th><th>Fechamento</th><th>Situação</th><th></th></tr></thead>
      <tbody>${externas.map((m) => `<tr>
        <td><strong>${esc(m.nome)}</strong><br>${autorTag(m)}</td>
        <td class="small">${formaTxt(m)}</td>
        <td>${esc(m.usuario)}</td>
        <td>${m.whatsapp ? `<a href="${linkWhats(m.whatsapp)}" target="_blank" rel="noopener">${esc(m.whatsapp)}</a>` : "—"}</td>
        <td class="small">${esc(m.pix || "—")}</td>
        <td class="small">${FREQUENCIAS[m.frequencia_pagamento] || "Mensal"}</td>
        <td>${m.ativo ? selo("pronto", "Ativo") : selo("cancelado", "Inativo")}</td>
        <td class="right" style="white-space:nowrap">
          <button class="btn sec peq" data-ed="${m.id}">Editar</button>
          <button class="btn sec peq" data-senha="${m.id}">Login</button>
          <button class="btn ${m.ativo ? "sec" : "ok"} peq" data-at="${m.id}">${m.ativo ? "Desativar" : "Ativar"}</button>
          ${lixeira(`data-exmo="${m.id}"`, `Excluir ${esc(m.nome)}`)}
        </td></tr>`).join("")}</tbody></table></div>` : `<div class="card vazio">Nenhuma mão de obra externa cadastrada.</div>`}` : ""}
    ${verFunc ? `<h2 class="sub-cad">Funcionários</h2>
      ${funcs.length ? `<div class="card tabela-wrap"><table>
      <thead><tr><th>Nome</th><th>Recebe</th><th>Cargo</th><th class="right">Hora extra</th><th>WhatsApp</th><th>Chave PIX</th><th>Login</th><th></th></tr></thead>
      <tbody>${funcs.map((p) => `<tr>
        <td><button class="link" data-fichaf="${p.chave}"><strong>${esc(p.nome)}</strong></button><br>${autorTag(p.reg)}</td>
        <td class="small">${recebeTxt(p)}</td>
        <td class="small">${esc(p.cargo || "—")}</td>
        <td class="right num">${p.valor_hora_extra != null ? moeda(p.valor_hora_extra) : "—"}</td>
        <td>${p.whatsapp ? `<a href="${linkWhats(p.whatsapp)}" target="_blank" rel="noopener">${esc(p.whatsapp)}</a>` : "—"}</td>
        <td class="small">${esc(p.pix || "—")}</td>
        <td class="small">${p.tipo === "hora" ? esc(p.usuario) : `<span class="muted">sem login</span>`}</td>
        <td class="right" style="white-space:nowrap">
          <button class="btn sec peq" data-edf="${p.chave}">Editar</button>
          ${p.tipo === "hora" ? `<button class="btn sec peq" data-senha="${p.id}">Login</button>` : ""}
          ${lixeira(`data-exf="${p.chave}"`, `Excluir ${esc(p.nome)}`)}
        </td></tr>`).join("")}</tbody></table></div>` : `<div class="card vazio">Nenhum funcionário cadastrado.</div>`}` : ""}`;

  $$("[data-filtro]", main).forEach((b) => (b.onclick = () => { filtroCad = b.dataset.filtro; renderMaos(); }));
  $("#novoMo").onclick = () => {
    if (filtroCad !== "todos") return modalNovaMo(filtroCad);
    const ops = ["externa", "funcionarios"].filter((k) => moduloAtivo(k));
    if (ops.length === 1) return modalNovaMo(ops[0]);
    const m = abrirModal({
      titulo: "Novo cadastro",
      conteudo: `<p class="muted small" style="margin-top:0">Quem você vai cadastrar?</p>
        <div class="menu-mais">
          <button type="button" data-novo="externa">${icone("externa")}<span>Mão de obra externa<br><small class="muted">leva lotes para fazer · tem login</small></span>${seta}</button>
          <button type="button" data-novo="funcionarios">${icone("fixos")}<span>Funcionário<br><small class="muted">salário mensal ou por hora</small></span>${seta}</button>
        </div>`,
    });
    $$("[data-novo]", m.form).forEach((b) => (b.onclick = () => { m.fechar(); modalNovaMo(b.dataset.novo); }));
  };
  const func = (ch) => funcs.find((p) => p.chave === ch);
  $$("[data-fichaf]", main).forEach((b) => (b.onclick = () => fichaFuncionario(func(b.dataset.fichaf))));
  $$("[data-edf]", main).forEach((b) => (b.onclick = () => modalFuncionario(func(b.dataset.edf), renderMaos)));
  $$("[data-exf]", main).forEach((b) => (b.onclick = async () => { if (await excluirFuncionario(func(b.dataset.exf))) renderMaos(); }));
  $$("[data-exmo]", main).forEach((b) => (b.onclick = async () => {
    const m = externas.find((x) => x.id === b.dataset.exmo);
    try { if (await excluirPerfil(m)) { aviso(`${m.nome} foi excluída.`); renderMaos(); } } catch (e) { aviso(e.message, true); }
  }));

  $$("[data-ed]", main).forEach((b) => (b.onclick = () => {
    const m = externas.find((x) => x.id === b.dataset.ed);
    abrirModal({
      titulo: `Editar ${m.nome}`,
      conteudo: `${camposMo(m)}<p class="muted small">Usuário: <strong>${esc(m.usuario)}</strong> (para mudar, use o botão Login)</p>
        <button type="submit" class="btn bloco">Salvar</button>`,
      aoAbrir: ligarCamposMo,
      onSubmit: async (fd) => {
        if (!fd.get("nome")) throw new Error("Informe o nome.");
        await q(sb.from("perfis").update({
          nome: fd.get("nome"), whatsapp: fd.get("whatsapp") || null, pix: fd.get("pix") || null, endereco: fd.get("endereco") || null,
          ...dadosMo(fd),
        }).eq("id", m.id));
        aviso("Salvo!"); renderMaos();
      },
    });
  }));

  $$("[data-senha]", main).forEach((b) => (b.onclick = () => modalLogin(todas.find((x) => x.id === b.dataset.senha), renderMaos)));

  $$("[data-at]", main).forEach((b) => (b.onclick = async () => {
    const m = externas.find((x) => x.id === b.dataset.at);
    if (!(await confirmar(`${m.ativo ? "Desativar" : "Ativar"} o acesso de ${m.nome}?`))) return;
    try { await adminUsuarios({ acao: m.ativo ? "desativar" : "ativar", id: m.id }); aviso("Pronto!"); renderMaos(); }
    catch (e) { aviso(e.message, true); }
  }));
}


// ===============================================================
// CADASTROS SERVIÇOS — produto com seus serviços e preços
// ===============================================================
async function renderServicos() {
  const { produtos, servicos } = await carregarCatalogo();
  const lucroTxt = (s) => s.valor_cliente == null ? `<span class="muted small">—</span>`
    : `<span class="${s.valor_cliente - s.valor_unitario >= 0 ? "lucro-pos" : "lucro-neg"}">${moeda(s.valor_cliente - s.valor_unitario)}</span>`;
  main.innerHTML = `
    <div class="topo-pagina"><div><h1>Produtos e serviços</h1><p>Cada serviço tem dois valores por peça: o que a <strong>empresa paga</strong> ao Bruno e o que ele <strong>paga à mão de obra</strong>.</p></div>
      <div class="topo-acoes"><button class="btn acento" id="novoProduto">＋ Novo produto</button></div></div>
    ${produtos.length ? `<div class="grid cards-largos">${produtos.map((p) => {
      const lista = servicos.filter((s) => s.produto_id === p.id);
      return `<div class="card produto-card ${p.ativo ? "" : "inativo"}">
        <div class="section-head" style="margin-bottom:.3rem">
          <h2 style="margin:0">${esc(maiusc(p.nome))}</h2>
          <span><button class="btn sec peq" data-edprod="${p.id}">Editar</button></span>
        </div>
        ${!p.ativo ? `<p class="small muted">Produto inativo (não aparece nas listas)</p>` : ""}
        ${lista.length ? `<div class="servico-linha cab"><span>Serviço</span><span class="right">Empresa paga</span><span class="right">Mão de obra</span><span class="right">Lucro/peça</span><span></span></div>
          ${lista.map((s) => `<div class="servico-linha ${s.ativo ? "" : "inativo"}">
            <span>${esc(s.nome)}${s.ativo ? "" : " <span class='small'>(inativo)</span>"}</span>
            <span class="right num">${s.valor_cliente == null ? "—" : moeda(s.valor_cliente)}</span>
            <strong class="right num">${moeda(s.valor_unitario)}</strong>
            <span class="right num">${lucroTxt(s)}</span>
            <button class="btn sec peq" data-edserv="${s.id}">Editar</button></div>`).join("")}`
          : `<p class="muted small">Nenhum serviço ainda.</p>`}
        <form class="novo-servico" data-addserv="${p.id}">
          <input name="nome" placeholder="Novo serviço (ex.: Bainha)" required>
          <input name="cliente" type="number" step="0.01" min="0" placeholder="Empresa paga R$">
          <input name="valor" type="number" step="0.01" min="0" placeholder="Mão de obra R$" required>
          <button class="btn peq" type="submit">＋</button>
        </form>
      </div>`;
    }).join("")}</div>` : `<div class="card vazio">Nenhum produto cadastrado. Clique em <strong>＋ Novo produto</strong> (ex.: Cortina).</div>`}`;

  const formProduto = (p = {}) => abrirModal({
    titulo: p.id ? "Editar produto" : "Novo produto",
    conteudo: `<div class="linha"><div><label>Nome do produto *</label><input name="nome" value="${esc(p.nome)}" required placeholder="Ex.: Cortina"></div></div>
      ${p.id ? `<label style="display:flex;gap:.5rem;align-items:center;margin-bottom:.8rem"><input type="checkbox" name="ativo" style="width:auto" ${p.ativo ? "checked" : ""}> Ativo</label>` : ""}
      <button type="submit" class="btn bloco">Salvar</button>
      ${p.id ? `<button type="button" class="btn perigo bloco" id="exProd" style="margin-top:.5rem">Excluir produto</button>` : ""}`,
    aoAbrir: (f, fechar) => {
      $("#exProd", f)?.addEventListener("click", async () => {
        if (!(await confirmar(`Excluir o produto ${p.nome} e os serviços dele? Lotes e entradas antigos continuam nos relatórios.`, "Excluir"))) return;
        try {
          await q(sb.from("servicos").update({ excluido_em: agoraIso(), ativo: false }).eq("produto_id", p.id));
          await q(sb.from("produtos").update({ excluido_em: agoraIso(), ativo: false }).eq("id", p.id));
          fechar(); aviso("Produto excluído."); renderServicos();
        } catch (e) { aviso(e.message, true); }
      });
    },
    onSubmit: async (fd) => {
      if (!fd.get("nome")) throw new Error("Informe o nome.");
      if (p.id) await q(sb.from("produtos").update({ nome: fd.get("nome"), ativo: fd.get("ativo") === "on" }).eq("id", p.id));
      else await q(sb.from("produtos").insert({ nome: fd.get("nome") }));
      aviso("Salvo!"); renderServicos();
    },
  });
  $("#novoProduto").onclick = () => formProduto();
  $$("[data-edprod]", main).forEach((b) => (b.onclick = () => formProduto(produtos.find((x) => x.id == b.dataset.edprod))));

  $$("[data-addserv]", main).forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = f.nome.value.trim(), valor = Number(f.valor.value);
    if (!nome || f.valor.value === "" || valor < 0) return aviso("Informe o nome e o valor pago à mão de obra.", true);
    try {
      await q(sb.from("servicos").insert({ produto_id: Number(f.dataset.addserv), nome, valor_unitario: valor,
        valor_cliente: f.cliente.value === "" ? null : Number(f.cliente.value) }));
      aviso("Serviço adicionado!"); renderServicos();
    } catch (err) { aviso(err.message, true); }
  }));

  $$("[data-edserv]", main).forEach((b) => (b.onclick = () => {
    const s = servicos.find((x) => x.id == b.dataset.edserv);
    abrirModal({
      titulo: `Editar serviço — ${nomeDe(produtos, s.produto_id)}`,
      conteudo: `<div class="linha"><div><label>Serviço *</label><input name="nome" value="${esc(s.nome)}" required></div></div>
        <div class="linha">
          <div><label>Empresa paga (R$ por peça)</label><input name="cliente" type="number" step="0.01" min="0" value="${s.valor_cliente ?? ""}"></div>
          <div><label>Mão de obra recebe (R$ por peça) *</label><input name="valor" type="number" step="0.01" min="0" value="${s.valor_unitario}" required></div>
        </div>
        <p class="small" id="lucroPrev"></p>
        <label style="display:flex;gap:.5rem;align-items:center;margin-bottom:.4rem"><input type="checkbox" name="ativo" style="width:auto" ${s.ativo ? "checked" : ""}> Ativo</label>
        <p class="muted small">Mudar os valores não altera lotes nem entradas já lançados.</p>
        <button type="submit" class="btn bloco">Salvar</button>
        <button type="button" class="btn perigo bloco" id="exServ" style="margin-top:.5rem">Excluir serviço</button>`,
      aoAbrir: (f, fechar) => {
        $("#exServ", f).onclick = async () => {
          if (!(await confirmar(`Excluir o serviço ${s.nome}? Lotes e entradas antigos continuam nos relatórios.`, "Excluir"))) return;
          try { await q(sb.from("servicos").update({ excluido_em: agoraIso(), ativo: false }).eq("id", s.id)); fechar(); aviso("Serviço excluído."); renderServicos(); }
          catch (e) { aviso(e.message, true); }
        };
        const at = () => ($("#lucroPrev", f).innerHTML = f.cliente.value === "" ? "" : `Lucro por peça: <strong>${moeda(Number(f.cliente.value) - Number(f.valor.value || 0))}</strong>`);
        f.cliente.oninput = f.valor.oninput = at; at();
      },
      onSubmit: async (fd) => {
        if (!fd.get("nome") || fd.get("valor") === "") throw new Error("Informe o nome e o valor da mão de obra.");
        await q(sb.from("servicos").update({ nome: fd.get("nome"), valor_unitario: Number(fd.get("valor")),
          valor_cliente: fd.get("cliente") === "" ? null : Number(fd.get("cliente")), ativo: fd.get("ativo") === "on" }).eq("id", s.id));
        aviso("Salvo!"); renderServicos();
      },
    });
  }));
}
const nomeDe = (lista, id) => lista.find((x) => x.id == id)?.nome ?? "";

// ===============================================================
// FECHAMENTOS — por mão de obra, produto e serviço, no mês
// ===============================================================
let tipoFech = "mensal";
let refFech = isoLocal();

async function renderFechamentos() {
  const p = periodo(tipoFech, refFech);
  const [ganhos, abertos, maos, pags] = await Promise.all([
    q(sb.from("v_ganhos").select("*").gte("dia", p.inicio).lte("dia", p.fim).order("produto_nome").order("servico_nome")),
    q(sb.from("v_lotes").select("mao_de_obra_id, valor_aberto").eq("status", "aberto")),
    carregarMaos(false),
    q(sb.from("pagamentos").select("*").lte("inicio", p.fim).gte("fim", p.inicio).order("pago_em")),
  ]);
  const por = {};
  const funcIds = new Set(maos.filter(ehFuncHora).map((m) => m.id));
  const g = (id) => (por[id] ??= { total: 0, pago: 0, aberto: 0, entregas: [] });
  ganhos.filter((e) => !funcIds.has(e.mao_de_obra_id)).forEach((e) => { const x = g(e.mao_de_obra_id); x.total += Number(e.valor); if (e.pago) x.pago += Number(e.valor); x.entregas.push(e); });
  abertos.forEach((l) => { g(l.mao_de_obra_id).aberto += Number(l.valor_aberto); });
  const tot = Object.values(por).reduce((a, x) => ({ total: a.total + x.total, pago: a.pago + x.pago, aberto: a.aberto + x.aberto }), { total: 0, pago: 0, aberto: 0 });

  const cartao = (m) => {
    const x = por[m.id] || { total: 0, pago: 0, aberto: 0, entregas: [] };
    const falta = x.total - x.pago;
    const receber = x.aberto + falta;
    const horas = x.entregas.filter(ehHora).reduce((a, e) => a + Number(e.quantidade), 0);
    return `<button class="cartao-fech ${receber ? "" : "zerado"} ${tipoDe(m)}" data-det="${m.id}">
      <span class="nome">${esc(maiusc(m.nome))}<small>${FREQUENCIAS[m.frequencia_pagamento] || "Mensal"}${porHora(m) ? " · por hora" : ""}</small></span>
      <span class="valor">R$ <b>${moeda(receber).replace("R$", "").trim()}</b></span>
      <span class="extra">${porHora(m) && horas ? `${inteiro(horas)} h × ${moeda(valorHoraDe(m) ?? 0)}` : ""}</span>
      ${x.total && !falta && !x.aberto ? `<span class="tag-pago">PAGO</span>` : ""}
    </button>`;
  };
  const secao = (k) => {
    const lista = maos.filter((m) => !ehFuncHora(m) && (m.ativo || por[m.id]?.total));
    if (!moduloAtivo(k) && !lista.some((m) => por[m.id]?.total)) return "";
    const s = lista.reduce((a, m) => { const x = por[m.id]; return x ? a + x.aberto + x.total - x.pago : a; }, 0);
    return `<section class="secao-inicio" data-secao="${k}">
      <div class="secao-cab"><div><h2><i class="ponto ${k}"></i>${TIPOS[k]}</h2><span>${lista.length} ${lista.length === 1 ? "pessoa" : "pessoas"}</span></div>
        <div class="secao-total">A receber <strong>${moeda(s)}</strong></div></div>
      ${lista.length ? `<div class="grade-fech">${lista.map(cartao).join("")}</div>` : `<div class="secao-vazia">Ninguém aqui neste período.</div>`}
    </section>`;
  };

  main.innerHTML = `
    <div class="topo-pagina">
      <div><h1>Fechamentos</h1><p>Mão de obra externa · valor em verde = lotes em aberto + o que já foi finalizado e ainda não foi pago.</p></div>
    </div>
    <div class="barra-periodo">
      <div class="seg">${Object.entries(FREQUENCIAS).map(([k, t]) => `<button class="${k === tipoFech ? "ativo" : ""}" data-tipo="${k}">${t}</button>`).join("")}</div>
      <div class="nav-periodo">
        <button class="btn sec peq" id="perAnt" title="Período anterior">◀</button>
        <strong>${esc(p.rotulo)}</strong>
        <button class="btn sec peq" id="perSeg" title="Próximo período">▶</button>
        <button class="btn sec peq" id="perHoje">Hoje</button>
      </div>
    </div>
    <div class="kpis-v2">
      <div class="kpi-v2 escuro"><span>Total a receber</span><strong>${moeda(tot.aberto + tot.total - tot.pago)}</strong></div>
      <div class="kpi-v2 amarelo"><span>Em aberto (lotes)</span><strong>${moeda(tot.aberto)}</strong></div>
      <div class="kpi-v2"><span>Finalizado no período</span><strong>${moeda(tot.total)}</strong></div>
      <div class="kpi-v2"><span>Já pago</span><strong>${moeda(tot.pago)}</strong></div>
    </div>
    ${maos.length ? secao("externa") : `<div class="card vazio">Nenhuma mão de obra cadastrada.</div>`}
    <p class="muted small">Os funcionários são pagos pela <button class="link" id="irFolha">Folha de pagamento</button>.</p>`;
  $("#irFolha").onclick = () => irPara("folha");

  $$("[data-tipo]", main).forEach((b) => (b.onclick = () => { tipoFech = b.dataset.tipo; renderFechamentos(); }));
  $("#perAnt").onclick = () => { refFech = periodoAnterior(p).inicio; renderFechamentos(); };
  $("#perSeg").onclick = () => { refFech = periodoSeguinte(p).inicio; renderFechamentos(); };
  $("#perHoje").onclick = () => { refFech = isoLocal(); renderFechamentos(); };
  $$("[data-det]", main).forEach((b) => (b.onclick = () => {
    const mo = maos.find((x) => x.id === b.dataset.det);
    detalheFechamento(mo, por[mo.id] || { total: 0, pago: 0, aberto: 0, entregas: [] }, pags.filter((x) => x.mao_de_obra_id === mo.id), p);
  }));
}

// Agrupa peças/horas por produto + serviço + preço
function agruparEntregas(entregas) {
  const m = {};
  entregas.forEach((e) => {
    const k = `${e.produto_nome}|${e.servico_nome}|${e.valor_unitario}`;
    m[k] ??= { origem: e.origem || "producao", produto_nome: e.produto_nome, servico_nome: e.servico_nome, valor_unitario: e.valor_unitario, quantidade: 0, valor: 0, pago: 0 };
    m[k].quantidade += Number(e.quantidade); m[k].valor += Number(e.valor); if (e.pago) m[k].pago += Number(e.valor);
  });
  return Object.values(m).sort((a, b) => (ehHora(a) - ehHora(b)) || (a.produto_nome + a.servico_nome).localeCompare(b.produto_nome + b.servico_nome));
}
const nomeItem = (i) => (ehHora(i) ? "Horas trabalhadas" : `${i.produto_nome} · ${i.servico_nome}`);
const unidade = (i) => (ehHora(i) ? "/hora" : "/peça");

function detalheFechamento(mo, x, pags, p) {
  const linhas = agruparEntregas(x.entregas);
  const falta = x.total - x.pago;
  const r = { mao_de_obra_nome: mo.nome, qtd: resumoQtd(linhas), valor_total: x.total };
  const m = abrirModal({
    titulo: `${maiusc(mo.nome)} — ${p.rotulo}`,
    largo: true,
    conteudo: `
      <div class="ficha-topo"><div class="ficha-contato"><span class="selo parcial">${TIPOS[tipoDe(mo)]} · ${formaTxt(mo)}</span><br>${mo.pix ? `PIX: <strong>${esc(mo.pix)}</strong> · ` : ""}Fechamento ${(FREQUENCIAS[mo.frequencia_pagamento] || "Mensal").toLowerCase()}</div>
        <span>${x.total ? (falta ? selo("aberto", `Falta pagar ${moeda(falta)}`) : selo("pago", "Tudo pago")) : ""}</span></div>
      ${x.aberto ? `<p class="small" style="margin:.4rem 0 0">Em aberto com ela agora (ainda não finalizado): <strong>${moeda(x.aberto)}</strong></p>` : ""}
      ${linhas.length ? `<div class="tabela-wrap" style="margin-top:.6rem"><table>
        <thead><tr><th>Produto · serviço</th><th class="right">Quantidade</th><th class="right">Valor unit.</th><th class="right">Valor</th><th>Situação</th></tr></thead>
        <tbody>${linhas.map((i) => `<tr><td>${esc(nomeItem(i))}</td><td class="right num">${qtdTxt(i)}</td>
          <td class="right num">${moeda(i.valor_unitario)}${unidade(i)}</td><td class="right num">${moeda(i.valor)}</td>
          <td>${i.pago >= i.valor ? selo("pago", "Pago") : i.pago ? selo("aberto", "Parte paga") : selo("aberto", "A pagar")}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td>Total</td><td class="right num">${r.qtd}</td><td></td><td class="right num">${moeda(x.total)}</td><td></td></tr></tfoot>
      </table></div>` : `<p class="muted">Nada finalizado neste período.</p>`}
      ${pags.length ? `<h3 style="margin-top:1rem">Pagamentos registrados</h3><ul class="lista-final">${pags.map((pg) => `<li>
        <span>${dataBR(pg.pago_em)} – ${esc(rotuloPeriodo(pg.tipo, pg.inicio))} ${autorTag(pg)}</span>
        <span style="display:flex;gap:.5rem;align-items:center"><strong class="num">${moeda(pg.valor_total)}</strong>
        <button type="button" class="btn perigo peq" data-desfpag="${pg.id}">Desfazer</button></span></li>`).join("")}</ul>` : ""}
      ${linhas.length ? `<div class="acoes">
        ${falta > 0 ? `<button type="button" class="btn ok" id="fPagar">✓ Marcar ${moeda(falta)} como pago</button>` : ""}
        <button type="button" class="btn acento peq" id="fNota">📩 Enviar nota</button>
        <button type="button" class="btn sec peq" id="fRecibo">🖨️ Recibo</button>
      </div>` : ""}`,
  });
  const f = m.form;
  $("#fPagar", f)?.addEventListener("click", async () => {
    if (!(await confirmar(`Marcar ${moeda(falta)} de ${mo.nome} (${p.rotulo}) como pago? Essas peças e horas ficam travadas.`, "Marcar como pago"))) return;
    try { await rpc("pagar_periodo", { p_mao_de_obra: mo.id, p_inicio: p.inicio, p_fim: p.fim, p_tipo: p.tipo }); aviso("Pagamento registrado!"); m.fechar(); renderFechamentos(); }
    catch (e) { aviso(e.message, true); }
  });
  $$("[data-desfpag]", f).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Desfazer este pagamento? As peças e horas voltam para 'a pagar'.", "Desfazer"))) return;
    try { await rpc("desfazer_pagamento", { p_pagamento: Number(b.dataset.desfpag) }); aviso("Pagamento desfeito."); m.fechar(); renderFechamentos(); }
    catch (e) { aviso(e.message, true); }
  }));
  $("#fRecibo", f)?.addEventListener("click", () => imprimirRecibo(r, linhas, mo, p.rotulo));
  $("#fNota", f)?.addEventListener("click", () => {
    m.fechar(); marcarAba("admin");
    renderAdmin({ moId: mo.id, tipo: p.tipo, ref: p.inicio });
  });
}

function imprimirRecibo(r, linhas, mo, rotulo) {
  const w = window.open("", "_blank");
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo ${esc(r.mao_de_obra_nome)} ${esc(rotulo)}</title>
    <link rel="stylesheet" href="${new URL("css/style.css", location.href)}"></head><body style="background:#fff;padding:1.5rem">
    <h1>${esc(NOME_FABRICA)} — Recibo de serviços</h1>
    <p><strong>Mão de obra:</strong> ${esc(r.mao_de_obra_nome)}${mo.pix ? `<br><strong>PIX:</strong> ${esc(mo.pix)}` : ""}<br><strong>Período:</strong> ${esc(rotulo)}</p>
    <table><thead><tr><th>Produto · serviço</th><th class="right">Quantidade</th><th class="right">Valor unit.</th><th class="right">Valor</th></tr></thead>
    <tbody>${linhas.map((i) => `<tr><td>${esc(nomeItem(i))}</td><td class="right">${qtdTxt(i)}</td><td class="right">${moeda(i.valor_unitario)}${unidade(i)}</td><td class="right">${moeda(i.valor)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td>Total</td><td class="right">${r.qtd}</td><td></td><td class="right">${moeda(r.valor_total)}</td></tr></tfoot></table>
    <p style="margin-top:2.5rem">Recebi a importância de <strong>${moeda(r.valor_total)}</strong> referente aos serviços acima.</p>
    <p style="margin-top:3rem">_______________________________________<br>${esc(r.mao_de_obra_nome)}</p>
    <script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}

// ===============================================================
// ADMINISTRATIVO — calculadora e backup
// ===============================================================
async function renderAdmin(pre = {}) {
  const [conf, maos, notas] = await Promise.all([
    q(sb.from("configuracoes").select("*")).then((l) => Object.fromEntries(l.map((c) => [c.chave, c.valor]))),
    carregarMaos(false),
    q(sb.from("notas").select("*").order("enviada_em", { ascending: false }).limit(15)),
  ]);
  const nomeMo = (id) => maos.find((m) => m.id === id)?.nome ?? "—";

  const seg = (k) => { const v = conf[`pag_padrao_${k}`] || "producao"; return `<div class="seg seg-radio">${Object.entries(FORMAS).map(([f, t]) =>
    `<label><input type="radio" name="padrao_${k}" value="${f}" ${v === f ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>`; };
  const tipoCard = (k, desc) => `<div class="tipo-card ${moduloAtivo(k) ? "on" : ""}" data-tipo-card="${k}">
      <div class="tipo-topo"><strong>${TIPOS[k]}</strong>
        <label class="switch" title="Ativar / desativar"><input type="checkbox" data-mod="${k}" ${moduloAtivo(k) ? "checked" : ""}><span></span></label></div>
      <p>${desc}</p>
      ${k === "funcionarios" ? `<div class="tipo-nota">Mensal: salário + horas extras, sem login · Por hora: com login · pagos pela Folha</div>` : `<label class="mini">Forma de pagamento padrão</label>${seg(k)}`}
    </div>`;

  main.innerHTML = `
    <div class="topo-pagina"><div><h1>Administrativo</h1><p>Configurações, pagamentos, relatórios, backup e acessos.</p></div></div>
    <div class="card section" id="cardTipos">
      <h2>Tipos de mão de obra</h2>
      <p class="muted small" style="margin-top:0">Ative só o que a fábrica usa. O que estiver desligado some do Início, do cadastro e dos fechamentos.
        A forma de pagamento padrão vale para cadastros novos — dá para mudar pessoa por pessoa.</p>
      <div class="tipos-grade">
        ${tipoCard("externa", "Quem leva o serviço para fazer em casa e devolve em lotes.")}
        ${tipoCard("funcionarios", "Quem trabalha na fábrica. Cada um recebe por salário mensal ou por hora (escolha no cadastro).")}
      </div>
      <div class="linha" style="grid-template-columns:minmax(180px,260px) auto;align-items:end;margin:.9rem 0 0">
        <div><label>Valor da hora padrão (R$)</label><input id="valorHoraPadrao" type="number" min="0" step="0.01" value="${numConf("valor_hora_padrao") ?? ""}" placeholder="Ex.: 12,00"></div>
        <button class="btn" id="salvarTipos" type="button">Salvar configuração</button>
      </div>
    </div>

    <div class="card section" id="cardPagamentos">
      <h2>📩 Pagamentos</h2>
      <p class="muted small" style="margin-top:0">Escolha a mão de obra e o período e envie a notinha de fechamento. Ela aparece no painel da mão de obra.</p>
      <div class="linha" style="grid-template-columns:2fr 1fr">
        <div><label>Mão de obra</label><select id="pagMo"><option value="">Selecione…</option>
          ${maos.filter((m) => m.ativo || m.id === pre.moId).map((m) => `<option value="${m.id}" ${m.id === pre.moId ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}</select></div>
        <div><label>Período</label><select id="pagTipo">${Object.entries(FREQUENCIAS).map(([k, t]) => `<option value="${k}" ${k === (pre.tipo || "mensal") ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      </div>
      <div class="nav-periodo" style="margin-bottom:.7rem">
        <button class="btn sec peq" id="pagAnt" type="button">◀</button><strong id="pagRotulo"></strong><button class="btn sec peq" id="pagSeg" type="button">▶</button>
      </div>
      <div id="pagPrevia"></div>
    </div>

    <div class="card section" id="cardRelatorio">
      <div class="section-head"><h2 style="margin:0">📊 Relatório mensal</h2>
        <span style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
          <input type="month" id="relMes" value="${inicioMes().slice(0, 7)}" style="width:auto">
          <button class="btn sec peq" id="relImprimir" type="button">🖨️ Imprimir / salvar PDF</button>
        </span></div>
      <p class="muted small" style="margin-top:.3rem">Tudo o que o Bruno pegou das empresas e tudo o que repassou às mãos de obra no mês.</p>
      <div id="relConteudo"><p class="muted small">Carregando…</p></div>
    </div>

    <div class="grid-admin">
      <div class="card">
        <h2>Calculadora</h2>
        <div class="calc">
          <div class="visor"><div class="conta" id="calcConta"></div><div class="numero" id="calcNum">0</div></div>
          <div class="teclas" id="calcTeclas">
            ${["C", "⌫", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "±", "0", ",", "="].map((t) =>
              `<button type="button" data-t="${t}" class="${"÷×−+".includes(t) ? "op" : t === "=" ? "igual" : t === "C" ? "limpar" : ""}">${t}</button>`).join("")}
          </div>
        </div>
      </div>

      <div>
        <div class="card section">
          <h2>Backup</h2>
          <p class="muted small">Todo dia o Google Planilhas faz uma cópia automática de tudo. Aqui você abre a planilha ou faz um backup na hora.</p>
          <div class="acoes" style="margin:.2rem 0 1rem">
            <button class="btn" id="btnAbrirPlanilha" ${conf.link_planilha ? "" : "disabled"}>📊 Abrir planilha de backup</button>
            <button class="btn acento" id="btnBackupAgora" ${conf.link_app_backup ? "" : "disabled"}>⟳ Fazer backup agora</button>
            <button class="btn sec" id="btnBaixar">⬇ Baixar cópia (Excel)</button>
          </div>
          <details ${conf.link_planilha ? "" : "open"}>
            <summary class="small" style="cursor:pointer;margin-bottom:.6rem">Configurar links do backup</summary>
            <form id="formBackup">
              <div class="linha"><div><label>Link da planilha de backup (Google Planilhas)</label><input name="link_planilha" value="${esc(conf.link_planilha)}" placeholder="https://docs.google.com/spreadsheets/…"></div></div>
              <div class="linha"><div><label>Link do App da Web do backup</label><input name="link_app_backup" value="${esc(conf.link_app_backup)}" placeholder="https://script.google.com/macros/s/…/exec"></div></div>
              <div class="linha"><div><label>Código secreto do backup</label><input name="codigo_backup" type="password" value="${esc(conf.codigo_backup)}" autocomplete="off"></div></div>
              <button class="btn" type="submit">Salvar links</button>
            </form>
          </details>
        </div>
        <div class="card">
          <h2>Notas enviadas</h2>
          ${notas.length ? `<ul class="lista-final">${notas.map((n) => `<li>
            <span>${dataBR(n.enviada_em)} – <strong>${esc(nomeMo(n.mao_de_obra_id))}</strong> – ${esc(n.inicio ? rotuloPeriodo(n.tipo, n.inicio) : nomeMes(n.mes))}<br>
              <span class="small muted">${moeda(n.valor_total)}</span> ${autorTag(n)}</span>
            ${n.lida_em ? selo("pronto", "Lida") : selo("aberto", "Não lida")}</li>`).join("")}</ul>`
            : `<p class="muted small">Nenhuma nota enviada ainda.</p>`}
        </div>
      </div>
    </div>

    ${cardAdmins()}
    ${cardMotoristas()}
    <div class="card section" id="cardAcessos" style="margin-top:1rem">
      <h2>🔑 Acessos</h2>
      <div class="grid-admin">
        <div>
          <h3>Minha conta</h3>
          <p class="muted small" style="margin-top:0">Você entra com o usuário <strong id="meuUsuario">${esc(perfil.usuario)}</strong>.</p>
          <form id="formMeuUsuario" novalidate>
            <div class="linha" style="grid-template-columns:1fr auto;align-items:end">
              <div><label>Novo usuário</label><input name="usuario" value="${esc(perfil.usuario)}" autocapitalize="none"></div>
              <button class="btn" type="submit">Salvar usuário</button>
            </div>
          </form>
          <form id="formMinhaSenha" novalidate>
            <div class="linha">
              <div><label>Senha atual</label><input type="password" name="atual" autocomplete="current-password"></div>
            </div>
            <div class="linha">
              <div><label>Nova senha (mín. 6)</label><input type="password" name="nova" autocomplete="new-password"></div>
              <div><label>Repita a nova senha</label><input type="password" name="nova2" autocomplete="new-password"></div>
            </div>
            <button class="btn" type="submit">Trocar minha senha</button>
          </form>
        </div>
        <div>
          <h3>Acesso das mãos de obra</h3>
          <form id="formAcessoMo" novalidate>
            <div class="linha"><div><label>Mão de obra</label><select name="mo"><option value="">Selecione…</option>
              ${maos.map((m) => `<option value="${m.id}">${esc(m.nome)}${m.ativo ? "" : " (inativa)"}</option>`).join("")}</select></div></div>
            <div class="linha">
              <div><label>Usuário</label><input name="usuario" autocapitalize="none" disabled></div>
              <div><label>Nova senha (em branco = manter)</label><input name="senha" placeholder="mín. 6 caracteres" disabled></div>
            </div>
            <button class="btn" type="submit" disabled>Salvar acesso</button>
            <p class="muted small" style="margin-bottom:0">Depois de salvar, passe o novo usuário e/ou a nova senha para ela.</p>
          </form>
        </div>
      </div>
    </div>`;

  ligarTipos();
  ligarAdmins();
  ligarMotoristas();
  ligarCalculadora();
  ligarPagamentos(maos, pre);
  ligarRelatorio();
  ligarAcessos(maos);

  $("#btnAbrirPlanilha").onclick = () => window.open(conf.link_planilha, "_blank", "noopener");
  $("#btnBackupAgora").onclick = () => {
    const u = new URL(conf.link_app_backup);
    u.searchParams.set("codigo", conf.codigo_backup || "");
    window.open(u.toString(), "_blank", "noopener");
  };
  $("#btnBaixar").onclick = baixarCopia;
  $("#formBackup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const linhas = ["link_planilha", "link_app_backup", "codigo_backup"].map((k) => ({ chave: k, valor: String(fd.get(k) || "").trim() || null }));
    for (const l of linhas) {
      if (l.valor && l.chave !== "codigo_backup" && !/^https:\/\//.test(l.valor)) return aviso("Os links precisam começar com https://", true);
    }
    try { await q(sb.from("configuracoes").upsert(linhas)); aviso("Links salvos!"); renderAdmin(); }
    catch (err) { aviso(err.message, true); }
  });
  if (pre.moId) $("#cardPagamentos").scrollIntoView({ behavior: "smooth" });
}

// Tipos de mão de obra: liga/desliga e forma de pagamento padrão
function ligarTipos() {
  $$("[data-mod]", main).forEach((c) => (c.onchange = () => c.closest(".tipo-card").classList.toggle("on", c.checked)));
  $("#salvarTipos").onclick = async (ev) => {
    const btn = ev.currentTarget;
    const linhas = [];
    $$("[data-mod]", main).forEach((c) => linhas.push({ chave: `modulo_${c.dataset.mod}`, valor: c.checked ? "sim" : "nao" }));
    ["externa"].forEach((k) => linhas.push({ chave: `pag_padrao_${k}`, valor: $(`[name=padrao_${k}]:checked`, main)?.value || "producao" }));
    const vh = $("#valorHoraPadrao").value;
    if (vh !== "" && Number(vh) < 0) return aviso("O valor da hora não pode ser negativo.", true);
    linhas.push({ chave: "valor_hora_padrao", valor: vh === "" ? null : String(Number(vh)) });
    if (!linhas.some((l) => l.chave.startsWith("modulo_") && l.valor === "sim")) return aviso("Deixe pelo menos um tipo ativado.", true);
    btn.disabled = true;
    try { await q(sb.from("configuracoes").upsert(linhas)); await carregarConf(); aviso("Configuração salva!"); }
    catch (e) { aviso(e.message, true); }
    finally { btn.disabled = false; }
  };
}

// Acessos: minha conta + login das mãos de obra
async function alterarMeuUsuario(novo) {
  novo = String(novo || "").trim().toLowerCase();
  if (!novo) throw new Error("Informe o novo usuário.");
  if (novo === perfil.usuario) throw new Error("Esse já é o seu usuário.");
  const r = await adminUsuarios({ acao: "alterar_usuario", id: perfil.id, usuario: novo });
  perfil.usuario = r?.usuario || novo;
  aviso(`Pronto! Da próxima vez, entre com o usuário: ${perfil.usuario}`);
}

function ligarAcessos(maos) {
  const enviar = (form, fn) => form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = form.querySelector("button[type=submit]"); b.disabled = true;
    try { await fn(new FormData(form)); } catch (err) { aviso(err.message, true); } finally { b.disabled = false; }
  });
  enviar($("#formMeuUsuario"), async (fd) => { await alterarMeuUsuario(fd.get("usuario")); $("#meuUsuario").textContent = perfil.usuario; });
  enviar($("#formMinhaSenha"), async (fd) => {
    if (!fd.get("atual") || !fd.get("nova")) throw new Error("Preencha a senha atual e a nova.");
    if (fd.get("nova") !== fd.get("nova2")) throw new Error("As novas senhas não conferem.");
    await trocarSenha(perfil.usuario, fd.get("atual"), fd.get("nova"));
    $("#formMinhaSenha").reset(); aviso("Senha alterada!");
  });
  const f = $("#formAcessoMo");
  f.mo.onchange = () => {
    const m = maos.find((x) => x.id === f.mo.value);
    f.usuario.value = m ? m.usuario : ""; f.senha.value = "";
    [f.usuario, f.senha, f.querySelector("button")].forEach((el) => (el.disabled = !m));
  };
  enviar(f, async (fd) => {
    const m = maos.find((x) => x.id === fd.get("mo"));
    if (!m) throw new Error("Escolha a mão de obra.");
    const novo = String(fd.get("usuario") || "").trim().toLowerCase(), senha = String(fd.get("senha") || "");
    if (!novo) throw new Error("Informe o usuário.");
    if (senha && senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    const mudou = [];
    if (novo !== m.usuario) { await adminUsuarios({ acao: "alterar_usuario", id: m.id, usuario: novo }); m.usuario = novo; mudou.push(`usuário: ${novo}`); }
    if (senha) { await adminUsuarios({ acao: "redefinir_senha", id: m.id, senha }); mudou.push("senha nova"); }
    f.senha.value = "";
    aviso(mudou.length ? `Salvo! ${m.nome} — ${mudou.join(" e ")}` : "Nada foi alterado.");
  });
}

// Desenha a nota de fechamento como imagem (PNG) para mandar no WhatsApp
async function imagemNota(mo, per, linhas, total, qtd, msg) {
  try { await document.fonts?.ready; } catch { /* segue com a fonte do sistema */ }
  const W = 1080, P = 64, F = "Inter, 'Segoe UI', Roboto, Arial, sans-serif", FT = "Manrope, Inter, 'Segoe UI', Arial, sans-serif";
  const c = document.createElement("canvas"), x = c.getContext("2d");
  const quebrar = (texto, fonte, larg) => {
    x.font = fonte; const pal = String(texto).split(" "); const l = []; let at = "";
    pal.forEach((p) => { const t = at ? `${at} ${p}` : p; if (x.measureText(t).width > larg && at) { l.push(at); at = p; } else at = t; });
    if (at) l.push(at); return l;
  };
  // mede a altura antes de desenhar
  const fNome = `600 34px ${F}`, fSub = `400 28px ${F}`;
  const itens = linhas.map((i) => ({ i, l: quebrar(nomeItem(i), fNome, W - 2 * P - 300) }));
  const msgL = msg ? quebrar(msg, `400 30px ${F}`, W - 2 * P - 48) : [];
  let H = 300 + 120 + itens.reduce((a, it) => a + 40 * it.l.length + 66, 0) + 214 + (msgL.length ? 70 + msgL.length * 42 : 0) + 110;
  c.width = W; c.height = H;
  x.textBaseline = "alphabetic";
  // fundo
  x.fillStyle = "#f3f5f9"; x.fillRect(0, 0, W, H);
  // cabeçalho
  x.fillStyle = "#172238"; x.fillRect(0, 0, W, 260);
  x.fillStyle = "#f5c518"; x.fillRect(0, 254, W, 6);
  x.fillStyle = "#f5c518"; x.font = `700 26px ${F}`; x.fillText("FECHAMENTO", P, 92);
  x.fillStyle = "#ffffff"; x.font = `800 52px ${FT}`; x.fillText(NOME_FABRICA, P, 158);
  x.fillStyle = "#aeb8cb"; x.font = `500 30px ${F}`; x.fillText(per.rotulo, P, 210);
  // para
  let y = 320;
  x.fillStyle = "#5b6478"; x.font = `500 26px ${F}`; x.fillText("PARA", P, y);
  x.fillStyle = "#172238"; x.font = `700 40px ${FT}`; x.fillText(mo.nome, P, y + 50);
  if (mo.pix) { x.fillStyle = "#5b6478"; x.font = `400 28px ${F}`; x.textAlign = "right"; x.fillText(`PIX: ${mo.pix}`, W - P, y + 48); x.textAlign = "left"; }
  y += 100;
  // cartão dos itens
  const topoCard = y, altCard = itens.reduce((a, it) => a + 40 * it.l.length + 66, 0) + 16;
  x.fillStyle = "#ffffff"; x.strokeStyle = "#e3e7ee"; x.lineWidth = 2;
  x.beginPath(); x.roundRect(P - 16, topoCard, W - 2 * P + 32, altCard, 20); x.fill(); x.stroke();
  y += 52;
  itens.forEach(({ i, l }, n) => {
    x.fillStyle = "#172238"; x.font = fNome;
    l.forEach((t, k) => x.fillText(t, P + 12, y + k * 40));
    x.textAlign = "right"; x.font = `700 34px ${F}`; x.fillText(moeda(i.valor), W - P - 12, y); x.textAlign = "left";
    x.fillStyle = "#5b6478"; x.font = fSub;
    x.fillText(`${qtdTxt(i)} × ${moeda(i.valor_unitario)}${unidade(i)}`, P + 12, y + 40 * (l.length - 1) + 40);
    y += 40 * l.length + 66;
    if (n < itens.length - 1) { x.fillStyle = "#e3e7ee"; x.fillRect(P + 12, y - 44, W - 2 * P - 24, 2); }
  });
  y = topoCard + altCard + 30;
  // total
  x.fillStyle = "#23324d"; x.beginPath(); x.roundRect(P - 16, y, W - 2 * P + 32, 140, 20); x.fill();
  x.fillStyle = "#aeb8cb"; x.font = `600 26px ${F}`; x.fillText("TOTAL", P + 16, y + 56);
  x.fillStyle = "#ffffff"; x.font = `500 28px ${F}`; x.fillText(qtd, P + 16, y + 102);
  x.fillStyle = "#3ee05a"; x.font = `800 60px ${FT}`; x.textAlign = "right"; x.fillText(moeda(total), W - P - 16, y + 92); x.textAlign = "left";
  y += 214;
  // recado
  if (msgL.length) {
    x.fillStyle = "#fff8db"; x.strokeStyle = "#f2d978"; x.beginPath(); x.roundRect(P - 16, y - 40, W - 2 * P + 32, 40 + msgL.length * 42 + 30, 16); x.fill(); x.stroke();
    x.fillStyle = "#6b5200"; x.font = `400 30px ${F}`; msgL.forEach((t, k) => x.fillText(t, P + 8, y + 14 + k * 42));
    y += 70 + msgL.length * 42;
  }
  // rodapé
  x.fillStyle = "#8a93a6"; x.font = `400 24px ${F}`; x.textAlign = "center";
  x.fillText(`Gerado em ${dataHoraBR(new Date())} · também disponível no seu painel`, W / 2, H - 50);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const nome = `fechamento-${mo.nome.split(" ")[0].toLowerCase()}-${per.inicio}.png`;
  return new File([blob], nome, { type: "image/png" });
}

// Monta a prévia da nota e envia
function ligarPagamentos(maos, pre = {}) {
  const selMo = $("#pagMo"), selTipo = $("#pagTipo"), area = $("#pagPrevia");
  let per = periodo(selTipo.value, pre.ref || isoLocal());
  const textoWhats = (mo, linhas, total, qtd, msg) =>
    `Olá, ${mo.nome.split(" ")[0]}! Segue o fechamento — ${per.rotulo} — ${NOME_FABRICA}:\n\n` +
    linhas.map((i) => `• ${ehHora(i) ? "Horas trabalhadas" : `${i.produto_nome} – ${i.servico_nome}`}: ${qtdTxt(i)} × ${moeda(i.valor_unitario)} = ${moeda(i.valor)}`).join("\n") +
    `\n\nTotal: ${qtd} — *${moeda(total)}*` + (msg ? `\n\n${msg}` : "") +
    `\n\nVocê também pode ver esta nota no seu painel.`;

  const carregar = async () => {
    $("#pagRotulo").textContent = per.rotulo;
    const mo = maos.find((m) => m.id === selMo.value);
    if (!mo) { area.innerHTML = ""; return; }
    area.innerHTML = `<p class="muted small">Carregando…</p>`;
    let entregas;
    try { entregas = await q(sb.from("v_ganhos").select("*").eq("mao_de_obra_id", mo.id).gte("dia", per.inicio).lte("dia", per.fim)); }
    catch (e) { area.innerHTML = `<p class="small" style="color:var(--bad)">${esc(e.message)}</p>`; return; }
    const linhas = agruparEntregas(entregas);
    if (!linhas.length) { area.innerHTML = `<div class="alerta">${esc(mo.nome)} não tem nada finalizado em: ${esc(per.rotulo)}.</div>`; return; }
    const total = soma(linhas, "valor"), qtd = resumoQtd(linhas), pago = soma(linhas, "pago");
    area.innerHTML = `
      <div class="nota-previa">
        <div class="nota-topo"><strong>${esc(NOME_FABRICA)}</strong><span>Fechamento — ${esc(per.rotulo)}</span></div>
        <div class="small" style="margin-bottom:.4rem">Para: <strong>${esc(mo.nome)}</strong>${mo.pix ? ` · PIX: ${esc(mo.pix)}` : ""}</div>
        <table><thead><tr><th>Produto · serviço</th><th class="right">Qtd</th><th class="right">Valor unit.</th><th class="right">Valor</th></tr></thead>
          <tbody>${linhas.map((i) => `<tr><td>${esc(nomeItem(i))}</td><td class="right num">${qtdTxt(i)}</td><td class="right num">${moeda(i.valor_unitario)}${unidade(i)}</td><td class="right num">${moeda(i.valor)}</td></tr>`).join("")}</tbody>
          <tfoot><tr><td>Total</td><td class="right num">${qtd}</td><td></td><td class="right num">${moeda(total)}</td></tr></tfoot></table>
        ${pago ? `<p class="small muted" style="margin:.4rem 0 0">Já pago neste período: ${moeda(pago)} · falta: ${moeda(total - pago)}</p>` : ""}
      </div>
      <div class="linha" style="margin-top:.7rem"><div><label>Mensagem (opcional)</label><input id="pagMsg" placeholder="Ex.: O PIX cai até sexta-feira."></div></div>
      <label class="check-whats ${mo.whatsapp ? "" : "desab"}"><input type="checkbox" id="pagWhats" ${mo.whatsapp ? "" : "disabled"}>
        Também enviar pelo WhatsApp ${mo.whatsapp ? `(${esc(mo.whatsapp)})` : "— cadastre o WhatsApp dela para usar"} — vai como imagem</label>
      <div class="acoes" style="margin-top:0">
        <button class="btn acento" id="pagEnviar" style="flex:1">Enviar nota para ${esc(mo.nome.split(" ")[0])}</button>
        <button class="btn sec" id="pagImagem" type="button">Baixar imagem</button>
      </div>`;

    // a imagem fica pronta antes do clique (o celular só deixa compartilhar logo após o toque)
    let arquivo = null;
    const prepararImagem = async () => { arquivo = null; try { arquivo = await imagemNota(mo, per, linhas, total, qtd, $("#pagMsg").value.trim()); } catch (e) { console.error(e); } };
    let tempo; $("#pagMsg").oninput = () => { clearTimeout(tempo); tempo = setTimeout(prepararImagem, 400); };
    prepararImagem();
    const baixar = (f) => { const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); };
    $("#pagImagem").onclick = async () => { if (!arquivo) await prepararImagem(); if (arquivo) baixar(arquivo); };

    $("#pagEnviar").onclick = async (ev) => {
      const btn = ev.currentTarget, whats = $("#pagWhats").checked, msg = $("#pagMsg").value.trim();
      // Celular: abre "Compartilhar" com a imagem (escolha o WhatsApp e a pessoa)
      const podeCompartilhar = whats && arquivo && navigator.canShare?.({ files: [arquivo] });
      const compartilhar = podeCompartilhar ? navigator.share({ files: [arquivo], title: "Fechamento" }).then(() => true, () => false) : null;
      // Computador: copia a imagem e abre o WhatsApp da pessoa para colar (Ctrl+V)
      let copiou = null, janela = null;
      if (whats && !podeCompartilhar) {
        copiou = arquivo && window.ClipboardItem && navigator.clipboard?.write
          ? navigator.clipboard.write([new ClipboardItem({ "image/png": arquivo })]).then(() => true, () => false) : Promise.resolve(false);
        janela = window.open("about:blank", "_blank"); // abre já, para o navegador não bloquear
      }
      btn.disabled = true;
      try {
        await rpc("enviar_nota", { p_mao_de_obra: mo.id, p_inicio: per.inicio, p_fim: per.fim, p_tipo: per.tipo, p_mensagem: msg || null });
        if (compartilhar) {
          aviso((await compartilhar) ? "Nota enviada!" : "Nota enviada para o painel. O WhatsApp não foi aberto.");
        } else if (janela) {
          const ok = await copiou;
          if (!ok && arquivo) baixar(arquivo);
          janela.location.href = `${linkWhats(mo.whatsapp)}?text=${encodeURIComponent(ok
            ? `Olá, ${mo.nome.split(" ")[0]}! Segue o fechamento — ${per.rotulo}.` : textoWhats(mo, linhas, total, qtd, msg))}`;
          aviso(ok ? "Nota enviada! A imagem foi copiada: no WhatsApp, aperte Ctrl+V para colar." : "Nota enviada! A imagem foi baixada — anexe no WhatsApp.");
        } else {
          aviso("Nota enviada para o painel dela!");
        }
        renderAdmin({ moId: mo.id, tipo: per.tipo, ref: per.inicio });
      } catch (e) { janela?.close(); aviso(e.message, true); btn.disabled = false; }
    };
  };
  selMo.onchange = () => {
    const mo = maos.find((m) => m.id === selMo.value);
    if (mo && !pre.tipo) { selTipo.value = mo.frequencia_pagamento || "mensal"; per = periodo(selTipo.value, isoLocal()); }
    carregar();
  };
  selTipo.onchange = () => { per = periodo(selTipo.value, per.inicio); carregar(); };
  $("#pagAnt").onclick = () => { per = periodoAnterior(per); carregar(); };
  $("#pagSeg").onclick = () => { per = periodoSeguinte(per); carregar(); };
  carregar();
}

// Relatório mensal: o que entrou das empresas x o que foi repassado às mãos de obra
function ligarRelatorio() {
  const sel = $("#relMes"), area = $("#relConteudo");
  let html = "";
  const carregar = async () => {
    const mes = `${sel.value || inicioMes().slice(0, 7)}-01`;
    const [a, m] = mes.split("-").map(Number);
    const prox = `${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
    area.innerHTML = `<p class="muted small">Carregando…</p>`;
    let entradas, entregas, lotes;
    try {
      [entradas, entregas, lotes] = await Promise.all([
        q(sb.from("v_entradas").select("*").eq("mes_ref", mes).order("empresa_nome").order("produto_nome").order("servico_nome")),
        q(sb.from("v_ganhos").select("*").eq("mes_ref", mes).order("mao_de_obra_nome")),
        q(sb.from("v_lotes").select("servico_id, produto_nome, servico_nome, quantidade, status").gte("enviado_em", `${mes}T00:00:00-03:00`).lt("enviado_em", `${prox}T00:00:00-03:00`)),
      ]);
    } catch (e) { area.innerHTML = `<p class="small" style="color:var(--bad)">${esc(e.message)}</p>`; return; }
    const receita = soma(entradas, "valor_total"), custo = soma(entregas, "valor");
    const pago = entregas.filter((e) => e.pago).reduce((s2, e) => s2 + Number(e.valor), 0);
    const lotesValidos = lotes.filter((l) => l.status !== "cancelado");

    // Agrupamentos
    const porEmpresa = {};
    entradas.forEach((e) => {
      const k = `${e.produto_nome}|${e.servico_nome}|${e.valor_unitario}`;
      porEmpresa[e.empresa_nome] ??= {};
      porEmpresa[e.empresa_nome][k] ??= { ps: `${e.produto_nome} · ${e.servico_nome}`, qtd: 0, unit: e.valor_unitario, total: 0 };
      porEmpresa[e.empresa_nome][k].qtd += e.quantidade; porEmpresa[e.empresa_nome][k].total += Number(e.valor_total);
    });
    const porMao = {};
    entregas.forEach((e) => { (porMao[e.mao_de_obra_nome] ??= []).push(e); });
    const porServ = {};
    const sv = (prod, serv) => (porServ[`${prod} · ${serv}`] ??= { entrou: 0, enviado: 0, finalizado: 0, receita: 0, custo: 0 });
    entradas.forEach((e) => { const x = sv(e.produto_nome, e.servico_nome); x.entrou += e.quantidade; x.receita += Number(e.valor_total); });
    lotesValidos.forEach((l) => { sv(l.produto_nome, l.servico_nome).enviado += l.quantidade; });
    entregas.forEach((e) => { const x = sv(e.produto_nome, e.servico_nome); x.finalizado += e.quantidade; x.custo += Number(e.valor); });

    const tabela = (cab, linhas, rodape = "") => `<div class="tabela-wrap"><table><thead><tr>${cab}</tr></thead><tbody>${linhas}</tbody>${rodape}</table></div>`;
    html = `
      <div class="totais">
        <div class="total escuro"><div class="r">Recebe das empresas</div><div class="v">${moeda(receita)}</div></div>
        <div class="total"><div class="r">Custo mão de obra (finalizado)</div><div class="v">${moeda(custo)}</div></div>
        <div class="total ${receita - custo >= 0 ? "verde" : "amarelo"}"><div class="r">Lucro estimado</div><div class="v">${moeda(receita - custo)}</div></div>
      </div>
      <p class="small muted">Peças recebidas: <strong>${inteiro(soma(entradas, "quantidade"))}</strong> · enviadas em lotes: <strong>${inteiro(soma(lotesValidos, "quantidade"))}</strong> ·
        finalizadas: <strong>${resumoQtd(entregas)}</strong> · já pago às mãos de obra: <strong>${moeda(pago)}</strong> (falta ${moeda(custo - pago)})</p>

      <h3>1. Serviço que o Bruno pegou (por empresa)</h3>
      ${entradas.length ? tabela(`<th>Empresa</th><th>Produto · serviço</th><th class="right">Peças</th><th class="right">R$/peça</th><th class="right">Total</th>`,
        Object.entries(porEmpresa).map(([emp, itens]) => {
          const lst = Object.values(itens);
          return lst.map((i, n) => `<tr><td>${n ? "" : `<strong>${esc(emp)}</strong>`}</td><td>${esc(i.ps)}</td><td class="right num">${inteiro(i.qtd)}</td><td class="right num">${moeda(i.unit)}</td><td class="right num">${moeda(i.total)}</td></tr>`).join("") +
            `<tr class="subtotal"><td></td><td>Subtotal ${esc(emp)}</td><td class="right num">${inteiro(lst.reduce((s2, i) => s2 + i.qtd, 0))}</td><td></td><td class="right num">${moeda(lst.reduce((s2, i) => s2 + i.total, 0))}</td></tr>`;
        }).join(""),
        `<tfoot><tr><td colspan="2">Total recebido das empresas</td><td class="right num">${inteiro(soma(entradas, "quantidade"))}</td><td></td><td class="right num">${moeda(receita)}</td></tr></tfoot>`)
        : `<p class="muted small">Nenhuma entrada neste mês.</p>`}

      <h3 style="margin-top:1.2rem">2. Serviço repassado às mãos de obra (finalizado)</h3>
      ${entregas.length ? tabela(`<th>Mão de obra</th><th>Produto · serviço</th><th class="right">Qtd</th><th class="right">Valor unit.</th><th class="right">Valor</th><th>Situação</th>`,
        Object.entries(porMao).map(([nome, lst]) => {
          const g = agruparEntregas(lst);
          return g.map((i, n) => `<tr><td>${n ? "" : `<strong>${esc(nome)}</strong>`}</td><td>${esc(nomeItem(i))}</td><td class="right num">${qtdTxt(i)}</td><td class="right num">${moeda(i.valor_unitario)}${unidade(i)}</td><td class="right num">${moeda(i.valor)}</td>
              <td>${i.pago >= i.valor ? "Pago" : i.pago ? "Parte paga" : "A pagar"}</td></tr>`).join("") +
            `<tr class="subtotal"><td></td><td>Subtotal ${esc(nome)}</td><td class="right num">${resumoQtd(lst)}</td><td></td><td class="right num">${moeda(soma(lst, "valor"))}</td><td></td></tr>`;
        }).join(""),
        `<tfoot><tr><td colspan="2">Total repassado</td><td class="right num">${resumoQtd(entregas)}</td><td></td><td class="right num">${moeda(custo)}</td><td></td></tr></tfoot>`)
        : `<p class="muted small">Nada finalizado pelas mãos de obra neste mês.</p>`}

      <h3 style="margin-top:1.2rem">3. Resumo por produto e serviço</h3>
      ${Object.keys(porServ).length ? tabela(`<th>Produto · serviço</th><th class="right">Entrou</th><th class="right">Enviado em lotes</th><th class="right">Finalizado</th><th class="right">Recebe</th><th class="right">Paga</th><th class="right">Lucro</th>`,
        Object.entries(porServ).sort((x, y) => x[0].localeCompare(y[0])).map(([k, x]) => `<tr><td>${esc(k)}</td><td class="right num">${inteiro(x.entrou)}</td><td class="right num">${inteiro(x.enviado)}</td><td class="right num">${inteiro(x.finalizado)}</td>
          <td class="right num">${moeda(x.receita)}</td><td class="right num">${moeda(x.custo)}</td><td class="right num"><strong>${moeda(x.receita - x.custo)}</strong></td></tr>`).join(""))
        : `<p class="muted small">Sem movimento neste mês.</p>`}`;
    area.innerHTML = html;
  };
  sel.onchange = carregar;
  $("#relImprimir").onclick = () => {
    const w = window.open("", "_blank");
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${nomeMes(`${sel.value}-01`)}</title>
      <link rel="stylesheet" href="${new URL("css/style.css", location.href)}"></head><body style="background:#fff;padding:1.2rem">
      <h1>${esc(NOME_FABRICA)} — Relatório de ${nomeMes(`${sel.value}-01`)}</h1>${html}
      <p class="muted small" style="margin-top:1.5rem">Gerado em ${dataHoraBR(new Date())}</p>
      <script>setTimeout(()=>print(),400)<\/script></body></html>`);
    w.document.close();
  };
  carregar();
}

// Calculadora comum
function ligarCalculadora() {
  let atual = "0", anterior = null, op = null, novo = false;
  const visor = $("#calcNum"), conta = $("#calcConta");
  const fmt = (s) => { const [i, d] = String(s).split("."); return Number(i).toLocaleString("pt-BR") + (d !== undefined ? "," + d : ""); };
  const mostrar = () => { visor.textContent = atual === "Erro" ? "Erro" : (atual.endsWith(".") ? fmt(atual.slice(0, -1)) + "," : fmt(atual)); conta.textContent = anterior !== null && op ? `${fmt(anterior)} ${op}` : ""; };
  const calcular = (a, b, o) => {
    const x = Number(a), y = Number(b);
    const r = o === "+" ? x + y : o === "−" ? x - y : o === "×" ? x * y : y === 0 ? NaN : x / y;
    return Number.isFinite(r) ? String(Math.round(r * 1e10) / 1e10) : "Erro";
  };
  const tecla = (t) => {
    if (atual === "Erro" && t !== "C") atual = "0";
    if (/^\d$/.test(t)) { atual = novo || atual === "0" ? t : atual.length < 15 ? atual + t : atual; novo = false; }
    else if (t === ",") { if (novo) { atual = "0."; novo = false; } else if (!atual.includes(".")) atual += "."; }
    else if (t === "C") { atual = "0"; anterior = null; op = null; novo = false; }
    else if (t === "⌫") { atual = novo ? atual : atual.length > 1 ? atual.slice(0, -1) : "0"; }
    else if (t === "±") { atual = atual.startsWith("-") ? atual.slice(1) : atual === "0" ? "0" : "-" + atual; }
    else if (t === "%") { atual = String(anterior !== null && (op === "+" || op === "−") ? Number(anterior) * Number(atual) / 100 : Number(atual) / 100); novo = true; }
    else if ("÷×−+".includes(t)) {
      if (op && anterior !== null && !novo) atual = calcular(anterior, atual, op);
      anterior = atual; op = t; novo = true;
    } else if (t === "=") {
      if (op && anterior !== null) { const exp = `${fmt(anterior)} ${op} ${fmt(atual)} =`; atual = calcular(anterior, atual, op); anterior = null; op = null; novo = true; mostrar(); conta.textContent = exp; return; }
    }
    mostrar();
  };
  $("#calcTeclas").addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (b) tecla(b.dataset.t); });
  const mapa = { "/": "÷", "*": "×", "-": "−", "+": "+", Enter: "=", "=": "=", Backspace: "⌫", Escape: "C", ",": ",", ".": ",", "%": "%" };
  document.onkeydown = (e) => {
    if (abaAtual !== "admin" || e.target.closest("input, textarea, select") || document.querySelector(".modal-fundo")) return;
    const t = /^\d$/.test(e.key) ? e.key : mapa[e.key];
    if (t) { e.preventDefault(); tecla(t); }
  };
}

// Cópia local em planilha (CSV que abre no Excel)
async function baixarCopia() {
  try {
    const [lotes, entregas, entradas, horas] = await Promise.all([
      q(sb.from("v_lotes").select("*").order("id")),
      q(sb.from("v_entregas").select("*").order("id")),
      q(sb.from("v_entradas").select("*").order("id")),
      q(sb.from("v_horas").select("*").order("data")),
    ]);
    const n = (v) => String(Number(v || 0).toFixed(2)).replace(".", ",");
    const csv = (cab, linhas) => "﻿" + [cab, ...linhas].map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const baixar = (nome, conteudo) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
      a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    };
    const hoje = new Date().toISOString().slice(0, 10);
    baixar(`lotes-${hoje}.csv`, csv(
      ["Nº", "Enviado em", "Mão de obra", "Produto", "Serviço", "Quantidade", "R$ por peça", "Total", "Entregue", "Falta", "Situação", "Observações"],
      lotes.map((l) => [l.id, dataHoraBR(l.enviado_em), l.mao_de_obra_nome, l.produto_nome, l.servico_nome, l.quantidade, n(l.valor_unitario), n(l.valor_total), l.qtd_entregue, l.qtd_falta, l.status, l.observacoes])));
    setTimeout(() => baixar(`entregas-${hoje}.csv`, csv(
      ["Data", "Lote", "Mão de obra", "Produto", "Serviço", "Peças", "Tipo", "Valor", "Mês"],
      entregas.map((e) => [dataHoraBR(e.entregue_em), e.lote_id, e.mao_de_obra_nome, e.produto_nome, e.servico_nome, e.quantidade, e.tipo === "pronto" ? "Lote pronto" : "Parcial", n(e.valor), String(e.mes_ref).slice(0, 7)]))), 400);
    setTimeout(() => baixar(`entradas-empresas-${hoje}.csv`, csv(
      ["Data", "Empresa", "Produto", "Serviço", "Peças", "Empresa paga R$/peça", "Total", "Observações"],
      entradas.map((e) => [dataBR(e.data), e.empresa_nome, e.produto_nome, e.servico_nome, e.quantidade, n(e.valor_unitario), n(e.valor_total), e.observacoes]))), 800);
    if (horas.length) setTimeout(() => baixar(`horas-${hoje}.csv`, csv(
      ["Data", "Mão de obra", "Horas", "R$ por hora", "Valor", "Pago?", "Observação"],
      horas.map((h) => [dataBR(h.data), h.mao_de_obra_nome, String(h.horas).replace(".", ","), n(h.valor_hora), n(h.valor), h.pago ? "Sim" : "Não", h.observacao]))), 1200);
    aviso(`Cópia baixada (${horas.length ? 4 : 3} arquivos).`);
  } catch (e) { aviso(e.message, true); }
}

// ---------------------------------------------------------------

// ===============================================================
// VERSÃO 7 — funcionários, folha, gastos, equipamentos, relatórios
// ===============================================================
const dt = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`);
const fimDoMes = (iso) => fimMes(dt(iso));
const addMes = (iso, n) => { const d = dt(iso); return inicioMes(new Date(d.getFullYear(), d.getMonth() + n, 1)); };
const agoraIso = () => new Date().toISOString();
const lixeira = (attr, rotulo = "Excluir") => `<button type="button" class="btn-lixo" ${attr} title="${rotulo}" aria-label="${rotulo}">${icone("lixo")}</button>`;
const navMes = (id, mes) => `<div class="nav-periodo">
    <button class="btn sec peq" id="${id}Ant" title="Mês anterior" aria-label="Mês anterior">◀</button>
    <strong>${esc(nomeMes(mes))}</strong>
    <button class="btn sec peq" id="${id}Seg" title="Próximo mês" aria-label="Próximo mês">▶</button>
    <button class="btn sec peq" id="${id}Hoje">Hoje</button></div>`;
const ligarNavMes = (id, get, set, depois) => {
  $(`#${id}Ant`).onclick = () => { set(addMes(get(), -1)); depois(); };
  $(`#${id}Seg`).onclick = () => { set(addMes(get(), 1)); depois(); };
  $(`#${id}Hoje`).onclick = () => { set(inicioMes()); depois(); };
};
const baixarCsv = (nome, cab, linhas) => {
  const c = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const txt = "﻿" + [cab, ...linhas].map((l) => l.map(c).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
  a.download = nome; document.body.appendChild(a); a.click(); a.remove();
};

// Funcionários: mensais (sem login) + por hora (com login)
async function carregarFuncionarios(incluirExcluidos = false) {
  const [fixos, maos] = await Promise.all([q(sb.from("funcionarios_fixos").select("*").order("nome")), carregarMaos(false)]);
  const lista = [
    ...fixos.map((f) => ({ chave: `f${f.id}`, tipo: "mensal", id: f.id, nome: f.nome, cargo: f.cargo, salario: f.salario,
      valor_hora_extra: f.valor_hora_extra, whatsapp: f.whatsapp, pix: f.pix, endereco: f.endereco, ativo: f.ativo, excluido_em: f.excluido_em, reg: f })),
    ...maos.filter(ehFuncHora).map((m) => ({ chave: `p${m.id}`, tipo: "hora", id: m.id, nome: m.nome, cargo: m.cargo, valor_hora: m.valor_hora,
      valor_hora_extra: m.valor_hora_extra, whatsapp: m.whatsapp, pix: m.pix, endereco: m.endereco, ativo: m.ativo, usuario: m.usuario,
      excluido_em: m.excluido_em, reg: m })),
  ].sort((a, b) => a.nome.localeCompare(b.nome));
  return incluirExcluidos ? lista : lista.filter((x) => !x.excluido_em);
}
const recebeTxt = (p) => (p.tipo === "mensal" ? `Mensal · ${p.salario != null ? moeda(p.salario) : "salário não informado"}`
  : `Por hora · ${valorHoraDe(p) != null ? moeda(valorHoraDe(p)) : "valor não informado"}`);
const linhaDaFolha = (linhas, p) => (Array.isArray(linhas) ? linhas : [])
  .find((r) => (p.tipo === "mensal" ? r.fixo_id == p.id : r.perfil_id === p.id));
const LANC = {
  hora_extra: ["Hora extra", "he"], bonus: ["Bonificação", "bo"], vale: ["Vale", "va"], desconto: ["Desconto", "de"], horas: ["Horas", "hs"],
};

async function fichaFuncionario(p, mes = inicioMes()) {
  const fim = fimDoMes(mes);
  const col = p.tipo === "mensal" ? "fixo_id" : "perfil_id";
  const [lancs, horas, resumo] = await Promise.all([
    q(sb.from("folha_lancamentos").select("*").eq(col, p.id).gte("data", mes).lte("data", fim).order("data", { ascending: false })),
    p.tipo === "hora" ? q(sb.from("v_horas").select("*").eq("mao_de_obra_id", p.id).eq("mes_ref", mes).order("data", { ascending: false })) : Promise.resolve([]),
    rpc("resumo_folha", { p_mes: mes }).catch(() => []),
  ]);
  const r = linhaDaFolha(resumo, p) || {};
  const pago = !!r.folha_pagamento_id;
  const itens = [
    ...horas.map((h) => ({ k: "horas", id: h.id, data: h.data, desc: h.observacao, base: `${inteiro(h.horas)} h × ${moeda(h.valor_hora)}`, valor: h.valor, travado: h.pago, reg: h })),
    ...lancs.map((l) => ({ k: l.tipo, id: l.id, data: l.data, desc: l.descricao,
      base: l.tipo === "hora_extra" ? `${inteiro(l.horas)} h × ${moeda(l.valor_hora)}` : "", valor: l.valor, travado: !!l.folha_pagamento_id, reg: l })),
  ].sort((a, b) => (a.data < b.data ? 1 : -1));
  const neg = (k) => k === "vale" || k === "desconto";
  const m = abrirModal({
    titulo: maiusc(p.nome),
    largo: true,
    conteudo: `
      <div class="ficha-topo">
        <div class="ficha-contato">
          <span class="selo parcial">Funcionário · ${recebeTxt(p)}</span>${p.cargo ? ` <span class="small muted">${esc(p.cargo)}</span>` : ""}<br>
          ${p.valor_hora_extra != null ? `Hora extra: <strong>${moeda(p.valor_hora_extra)}</strong><br>` : ""}
          ${p.whatsapp ? `📱 <a href="${linkWhats(p.whatsapp)}" target="_blank" rel="noopener">${esc(p.whatsapp)}</a><br>` : ""}
          ${p.pix ? `PIX: <strong>${esc(p.pix)}</strong>` : ""}
        </div>
        <div class="acoes" style="margin:0">
          <button type="button" class="btn sec peq" id="ffEditar">Editar</button>
          <button type="button" class="btn perigo peq" id="ffExcluir">Excluir</button>
        </div>
      </div>
      <div class="ff-mes">
        <button type="button" class="btn sec peq" id="ffAnt" aria-label="Mês anterior">◀</button>
        <strong>${esc(nomeMes(mes))}</strong>
        <button type="button" class="btn sec peq" id="ffSeg" aria-label="Próximo mês">▶</button>
        ${pago ? selo("pago", `Pago em ${dataBR(r.pago_em)}`) : ""}
      </div>
      ${pago ? "" : `<div class="acoes" style="margin:.2rem 0 .6rem">
        ${p.tipo === "hora" ? `<button type="button" class="btn acento peq" data-novo="horas">⏱ Lançar horas</button>` : ""}
        <button type="button" class="btn ${p.tipo === "hora" ? "sec" : "acento"} peq" data-novo="hora_extra">＋ Hora extra</button>
        <button type="button" class="btn sec peq" data-novo="bonus">＋ Bonificação</button>
        <button type="button" class="btn sec peq" data-novo="vale">＋ Vale</button>
        <button type="button" class="btn sec peq" data-novo="desconto">＋ Desconto</button>
      </div>`}
      ${itens.length ? `<ul class="lista-final">${itens.map((i) => `<li>
        <span>${diaMes(i.data)} <span class="chip-lanc ${LANC[i.k][1]}">${LANC[i.k][0]}</span>
          ${i.base ? `<span class="small">${i.base}</span>` : ""}${i.desc ? `<br><span class="small muted">${esc(i.desc)}</span>` : ""} ${autorTag(i.reg)}</span>
        <span style="white-space:nowrap;display:flex;gap:.5rem;align-items:center"><strong class="num ${neg(i.k) ? "neg" : ""}">${neg(i.k) ? "− " : ""}${moeda(i.valor)}</strong>
          ${i.travado ? "" : lixeira(`data-exl="${i.k}:${i.id}"`, "Excluir lançamento")}</span></li>`).join("")}</ul>`
        : `<p class="muted">Nenhum lançamento neste mês.</p>`}
      <div class="ff-resumo">
        <div>${p.tipo === "mensal" ? "Salário" : `Horas (${inteiro(r.horas)} h)`}<strong>${moeda(p.tipo === "mensal" ? r.salario : r.valor_horas)}</strong></div>
        <div>Horas extras<strong>${moeda(r.valor_extras)}</strong></div>
        <div>Bonificações<strong>${moeda(r.bonus)}</strong></div>
        <div>Vales e descontos<strong class="neg">− ${moeda(Number(r.vales || 0) + Number(r.descontos || 0))}</strong></div>
        <div class="liq">A receber<strong>${moeda(r.liquido)}</strong></div>
      </div>
      <div class="acoes">
        ${pago ? `<button type="button" class="btn sec peq" id="ffDesfazer">Desfazer pagamento</button>`
          : `<button type="button" class="btn ok" id="ffPagar">✓ Marcar ${moeda(r.liquido)} como pago</button>`}
        <button type="button" class="btn sec peq" id="ffHolerite">🖨️ Holerite</button>
      </div>`,
  });
  const f = m.form;
  const reabrir = (novoMes = mes) => { m.fechar(); fichaFuncionario(p, novoMes); atualizarAba(); };
  $("#ffAnt", f).onclick = () => reabrir(addMes(mes, -1));
  $("#ffSeg", f).onclick = () => reabrir(addMes(mes, 1));
  $("#ffEditar", f).onclick = () => { m.fechar(); modalFuncionario(p, () => atualizarAba()); };
  $("#ffExcluir", f).onclick = async () => { if (await excluirFuncionario(p)) { m.fechar(); atualizarAba(); } };
  $$("[data-novo]", f).forEach((b) => (b.onclick = () => {
    m.fechar();
    if (b.dataset.novo === "horas") return modalLancarHoras(p.id);
    modalLancFolha(p, b.dataset.novo, mes);
  }));
  $$("[data-exl]", f).forEach((b) => (b.onclick = async () => {
    const [k, id] = b.dataset.exl.split(":");
    if (!(await confirmar("Excluir este lançamento?", "Excluir"))) return;
    try {
      if (k === "horas") await rpc("excluir_horas", { p_id: Number(id) });
      else await q(sb.from("folha_lancamentos").delete().eq("id", id));
      aviso("Lançamento excluído."); reabrir();
    } catch (e) { aviso(e.message, true); }
  }));
  $("#ffPagar", f)?.addEventListener("click", async () => {
    if (!(await confirmar(`Marcar ${moeda(r.liquido)} de ${p.nome} (${nomeMes(mes)}) como pago? Os lançamentos do mês ficam travados.`, "Marcar como pago"))) return;
    try { await rpc("pagar_folha", { p_mes: mes, p_fixo: p.tipo === "mensal" ? p.id : null, p_perfil: p.tipo === "hora" ? p.id : null }); aviso("Pagamento registrado!"); reabrir(); }
    catch (e) { aviso(e.message, true); }
  });
  $("#ffDesfazer", f)?.addEventListener("click", async () => {
    if (!(await confirmar("Desfazer este pagamento? Os lançamentos voltam a poder ser alterados.", "Desfazer"))) return;
    try { await rpc("desfazer_folha", { p_id: r.folha_pagamento_id }); aviso("Pagamento desfeito."); reabrir(); }
    catch (e) { aviso(e.message, true); }
  });
  $("#ffHolerite", f).onclick = () => imprimirHolerite({ ...r, nome: p.nome, cargo: p.cargo, forma: p.tipo, pix: p.pix }, mes);
}
// Recarrega a página que estiver aberta por trás da ficha
const atualizarAba = () => { if (["inicio", "folha", "maos"].includes(abaAtual)) render(); };

function modalLancFolha(p, tipo, mes = inicioMes()) {
  const ehExtra = tipo === "hora_extra";
  const hoje = isoLocal();
  const dataPadrao = hoje >= mes && hoje <= fimDoMes(mes) ? hoje : mes;
  abrirModal({
    titulo: `${LANC[tipo][0]} — ${p.nome}`,
    conteudo: `
      <div class="linha">
        <div><label>Dia *</label><input name="data" type="date" value="${dataPadrao}" required></div>
        ${ehExtra ? `<div><label>Horas extras *</label><input name="horas" type="number" min="0.25" max="24" step="0.25" inputmode="decimal" required placeholder="Ex.: 2 ou 1,5"></div>
          <div><label>Valor da hora extra (R$) *</label><input name="vh" type="number" min="0" step="0.01" inputmode="decimal" value="${p.valor_hora_extra ?? ""}" required></div>`
        : `<div><label>Valor (R$) *</label><input name="valor" type="number" min="0.01" step="0.01" inputmode="decimal" required></div>`}
      </div>
      <div class="linha"><div><label>Descrição (opcional)</label><input name="desc" placeholder="${{ hora_extra: "Ex.: sábado", bonus: "Ex.: meta de produção", vale: "Ex.: adiantamento", desconto: "Ex.: 1 falta" }[tipo]}"></div></div>
      ${ehExtra ? `<div class="lote-total" style="margin:0 0 .8rem"><span>Total</span><span id="prevLanc">R$ 0,00</span></div>` : ""}
      ${tipo === "vale" || tipo === "desconto" ? `<p class="muted small" style="margin-top:-.2rem">Este valor é <strong>descontado</strong> do que ${esc(p.nome.split(" ")[0])} tem a receber no mês.</p>` : ""}
      <button type="submit" class="btn bloco acento">Lançar</button>`,
    aoAbrir: (f) => {
      if (!ehExtra) return;
      const prev = () => ($("#prevLanc", f).textContent = moeda(Number(f.horas.value || 0) * Number(f.vh.value || 0)));
      f.horas.oninput = f.vh.oninput = prev;
    },
    onSubmit: async (fd) => {
      const d = { data: fd.get("data") || hoje, tipo, descricao: String(fd.get("desc") || "").trim() || null };
      d[p.tipo === "mensal" ? "fixo_id" : "perfil_id"] = p.id;
      if (ehExtra) {
        const h = Number(fd.get("horas")), vh = Number(fd.get("vh"));
        if (!(h > 0 && h <= 24)) throw new Error("Informe as horas extras.");
        if (fd.get("vh") === "" || vh < 0) throw new Error("Informe o valor da hora extra.");
        Object.assign(d, { horas: h, valor_hora: vh, valor: Math.round(h * vh * 100) / 100 });
      } else {
        const v = Number(fd.get("valor"));
        if (!(v > 0)) throw new Error("Informe o valor.");
        d.valor = v;
      }
      await q(sb.from("folha_lancamentos").insert(d));
      aviso("Lançado!");
      fichaFuncionario(p, addMes(d.data, 0));
      atualizarAba();
    },
  });
}

function modalFuncionario(p = null, depois = () => render()) {
  const novo = !p;
  const forma = p?.tipo || "mensal";
  abrirModal({
    titulo: novo ? "Cadastrar funcionário" : `Editar ${p.nome}`,
    conteudo: `
      <div class="linha"><div><label>Nome *</label><input name="nome" value="${esc(p?.nome)}" required></div></div>
      ${novo ? `<label>Como recebe *</label>
        <div class="seg seg-radio" style="margin-bottom:.9rem">
          <label><input type="radio" name="forma" value="mensal" checked><span>Salário mensal</span></label>
          <label><input type="radio" name="forma" value="hora"><span>Por hora</span></label>
        </div>` : `<input type="hidden" name="forma" value="${forma}"><p class="small"><strong>Recebe:</strong> ${forma === "mensal" ? "salário mensal" : "por hora"}
          <span class="muted">(para mudar, exclua e cadastre de novo)</span></p>`}
      <div class="linha">
        <div><label>Cargo / função</label><input name="cargo" value="${esc(p?.cargo)}" placeholder="Ex.: Cortador"></div>
        <div class="so-mensal"><label>Salário mensal (R$) *</label><input name="salario" type="number" min="0" step="0.01" value="${p?.salario ?? ""}"></div>
        <div class="so-hora"><label>Valor da hora (R$) *</label><input name="valor_hora" type="number" min="0" step="0.01" value="${p?.valor_hora ?? ""}"></div>
        <div><label>Valor da hora extra (R$)</label><input name="valor_hora_extra" type="number" min="0" step="0.01" value="${p?.valor_hora_extra ?? ""}"></div>
      </div>
      <div class="linha">
        <div><label>WhatsApp</label><input name="whatsapp" value="${esc(p?.whatsapp)}" inputmode="tel" placeholder="(11) 99999-9999"></div>
        <div><label>Chave PIX</label><input name="pix" value="${esc(p?.pix)}"></div>
      </div>
      <div class="linha"><div><label>Endereço</label><input name="endereco" value="${esc(p?.endereco)}"></div></div>
      ${novo ? `<div class="linha so-hora">
        <div><label>Usuário (login) *</label><input name="usuario" autocapitalize="none" placeholder="ex.: carla"></div>
        <div><label>Senha inicial *</label><input name="senha" minlength="6" placeholder="mín. 6 caracteres"></div>
      </div>` : ""}
      <p class="muted small so-mensal">Salário mensal: sem login. O Bruno lança horas extras, bonificações, vales e descontos.</p>
      <p class="muted small so-hora">Por hora: a pessoa entra no painel pelo celular e vê as horas dela.</p>
      <button type="submit" class="btn bloco">${novo ? "Cadastrar" : "Salvar"}</button>`,
    aoAbrir: (f) => {
      const mostrar = () => {
        const v = $("[name=forma]:checked", f)?.value || f.forma.value;
        $$(".so-mensal", f).forEach((x) => x.classList.toggle("hidden", v !== "mensal"));
        $$(".so-hora", f).forEach((x) => x.classList.toggle("hidden", v !== "hora"));
      };
      $$("[name=forma]", f).forEach((x) => (x.onchange = mostrar));
      mostrar();
    },
    onSubmit: async (fd) => {
      const nome = String(fd.get("nome") || "").trim();
      const fm = fd.get("forma");
      const num = (k) => (fd.get(k) === "" || fd.get(k) == null ? null : Number(fd.get(k)));
      if (!nome) throw new Error("Informe o nome.");
      const comum = { nome, cargo: fd.get("cargo") || null, valor_hora_extra: num("valor_hora_extra"),
        whatsapp: fd.get("whatsapp") || null, pix: fd.get("pix") || null, endereco: fd.get("endereco") || null };
      if (fm === "mensal") {
        if (num("salario") == null) throw new Error("Informe o salário mensal.");
        const d = { ...comum, salario: num("salario") };
        if (novo) await q(sb.from("funcionarios_fixos").insert(d));
        else await q(sb.from("funcionarios_fixos").update(d).eq("id", p.id));
      } else {
        if (num("valor_hora") == null) throw new Error("Informe o valor da hora.");
        const d = { ...comum, valor_hora: num("valor_hora"), tipo: "interna", forma_pagamento: "hora" };
        if (novo) {
          const usuario = String(fd.get("usuario") || "").trim();
          if (!usuario || String(fd.get("senha") || "").length < 6) throw new Error("Informe o usuário e uma senha com pelo menos 6 caracteres.");
          const criado = await adminUsuarios({ acao: "criar", nome, usuario, senha: fd.get("senha"), whatsapp: comum.whatsapp, pix: comum.pix, endereco: comum.endereco });
          if (criado?.id) await q(sb.from("perfis").update({ ...d, frequencia_pagamento: "mensal" }).eq("id", criado.id));
          aviso(`Funcionário cadastrado! Usuário: ${usuario.toLowerCase()}`);
          return depois();
        }
        await q(sb.from("perfis").update(d).eq("id", p.id));
      }
      aviso(novo ? "Funcionário cadastrado!" : "Salvo!");
      depois();
    },
  });
}

// Exclui sem apagar o histórico (lotes, horas e pagamentos continuam nos relatórios)
async function excluirFuncionario(p) {
  if (!(await confirmar(`Excluir ${p.nome}? A pessoa sai das listas${p.tipo === "hora" ? " e perde o acesso ao painel" : ""}. O histórico de pagamentos fica guardado.`, "Excluir"))) return false;
  try {
    if (p.tipo === "mensal") await q(sb.from("funcionarios_fixos").update({ excluido_em: agoraIso(), ativo: false }).eq("id", p.id));
    else await excluirPerfil(p.reg, false);
    aviso(`${p.nome} foi excluído(a).`);
    return true;
  } catch (e) { aviso(e.message, true); return false; }
}
async function excluirPerfil(m, perguntar = true) {
  if (perguntar && !(await confirmar(`Excluir ${m.nome}? Ela sai das listas e do Início e perde o acesso ao painel. O histórico (lotes, entregas e pagamentos) fica guardado nos fechamentos e relatórios.`, "Excluir"))) return false;
  if (m.ativo) { try { await adminUsuarios({ acao: "desativar", id: m.id }); } catch { /* segue mesmo assim */ } }
  await q(sb.from("perfis").update({ excluido_em: agoraIso(), ativo: false }).eq("id", m.id));
  return true;
}

// ---------------------------------------------------------------
// FOLHA DE PAGAMENTO
// ---------------------------------------------------------------
let mesFolha = inicioMes();
async function renderFolha() {
  const [res, funcs] = await Promise.all([rpc("resumo_folha", { p_mes: mesFolha }), carregarFuncionarios(true)]);
  const L = Array.isArray(res) ? res : [];
  const t = (k) => L.reduce((a, r) => a + Number(r[k] || 0), 0);
  const pendentes = L.filter((r) => !r.folha_pagamento_id);
  const pessoa = (r) => funcs.find((x) => (r.fixo_id != null ? x.chave === `f${r.fixo_id}` : x.chave === `p${r.perfil_id}`));
  main.innerHTML = `
    <div class="topo-pagina"><div><h1>Folha de pagamento</h1><p>Funcionários · salário ou horas, horas extras, bonificações, vales e descontos.</p></div>
      <div class="topo-acoes">${navMes("fo", mesFolha)}</div></div>
    <div class="kpis-v2">
      <div class="kpi-v2 escuro"><span>Total líquido da folha</span><strong>${moeda(t("liquido"))}</strong><small>${L.length} funcionário${L.length === 1 ? "" : "s"}</small></div>
      <div class="kpi-v2"><span>Salários e horas</span><strong>${moeda(t("salario") + t("valor_horas"))}</strong><small>base do mês</small></div>
      <div class="kpi-v2"><span>Horas extras + bônus</span><strong>${moeda(t("valor_extras") + t("bonus"))}</strong><small>${inteiro(t("horas_extras"))} h extras</small></div>
      <div class="kpi-v2"><span>Vales e descontos</span><strong>− ${moeda(t("vales") + t("descontos"))}</strong><small>descontados</small></div>
    </div>
    ${L.length ? `<div class="card tabela-wrap"><table>
      <thead><tr><th>Funcionário</th><th class="right">Salário / horas</th><th class="right">Horas extras</th><th class="right">Bonificações</th><th class="right">Vales e descontos</th><th class="right">Líquido</th><th>Situação</th><th></th></tr></thead>
      <tbody>${L.map((r, i) => `<tr>
        <td><button class="link" data-ficha-f="${i}"><strong>${esc(r.nome)}</strong></button><br><span class="small muted">${r.forma === "mensal" ? "Mensal" : "Por hora"}${r.cargo ? ` · ${esc(r.cargo)}` : ""}</span></td>
        <td class="right num">${r.forma === "mensal" ? moeda(r.salario) : `${inteiro(r.horas)} h · ${moeda(r.valor_horas)}`}</td>
        <td class="right num">${Number(r.valor_extras) ? `${moeda(r.valor_extras)}<br><span class="small muted">${inteiro(r.horas_extras)} h</span>` : "—"}</td>
        <td class="right num">${Number(r.bonus) ? moeda(r.bonus) : "—"}</td>
        <td class="right num neg">${Number(r.vales) + Number(r.descontos) ? `− ${moeda(Number(r.vales) + Number(r.descontos))}` : "—"}</td>
        <td class="right num"><strong>${moeda(r.liquido)}</strong></td>
        <td>${r.folha_pagamento_id ? selo("pago", "Pago") : selo("aberto", "A pagar")}</td>
        <td class="right" style="white-space:nowrap">
          <button class="btn sec peq" data-holerite="${i}">Holerite</button>
          ${r.folha_pagamento_id ? `<button class="btn sec peq" data-desf="${i}">Desfazer</button>` : `<button class="btn ok peq" data-pagar="${i}">Pagar</button>`}
        </td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Total</td><td class="right num">${moeda(t("salario") + t("valor_horas"))}</td><td class="right num">${moeda(t("valor_extras"))}</td>
        <td class="right num">${moeda(t("bonus"))}</td><td class="right num">− ${moeda(t("vales") + t("descontos"))}</td><td class="right num">${moeda(t("liquido"))}</td><td colspan="2"></td></tr></tfoot>
    </table></div>
    <div class="acoes">
      ${pendentes.length ? `<button class="btn ok" id="foTodos">✓ Marcar todos (${pendentes.length}) como pagos</button>` : ""}
      <button class="btn sec" id="foImprimir">🖨️ Imprimir folha</button>
      <button class="btn sec" id="foCsv">Baixar planilha (CSV)</button>
      <button class="btn sec" id="foNovo">＋ Cadastrar funcionário</button>
    </div>`
    : `<div class="card vazio">Nenhum funcionário neste mês. <button class="link" id="foNovo">Cadastrar funcionário</button></div>`}`;

  ligarNavMes("fo", () => mesFolha, (v) => (mesFolha = v), renderFolha);
  $("#foNovo")?.addEventListener("click", () => modalFuncionario(null, renderFolha));
  $$("[data-ficha-f]", main).forEach((b) => (b.onclick = () => { const p = pessoa(L[b.dataset.fichaF]); if (p) fichaFuncionario(p, mesFolha); }));
  $$("[data-holerite]", main).forEach((b) => (b.onclick = () => imprimirHolerite(L[b.dataset.holerite], mesFolha)));
  const pagar = async (r) => rpc("pagar_folha", { p_mes: mesFolha, p_fixo: r.fixo_id ?? null, p_perfil: r.perfil_id ?? null });
  $$("[data-pagar]", main).forEach((b) => (b.onclick = async () => {
    const r = L[b.dataset.pagar];
    if (!(await confirmar(`Marcar ${moeda(r.liquido)} de ${r.nome} como pago?`, "Marcar como pago"))) return;
    try { await pagar(r); aviso("Pagamento registrado!"); renderFolha(); } catch (e) { aviso(e.message, true); }
  }));
  $$("[data-desf]", main).forEach((b) => (b.onclick = async () => {
    const r = L[b.dataset.desf];
    if (!(await confirmar(`Desfazer o pagamento de ${r.nome}?`, "Desfazer"))) return;
    try { await rpc("desfazer_folha", { p_id: r.folha_pagamento_id }); aviso("Pagamento desfeito."); renderFolha(); } catch (e) { aviso(e.message, true); }
  }));
  $("#foTodos")?.addEventListener("click", async () => {
    if (!(await confirmar(`Marcar ${pendentes.length} funcionário(s) como pagos, somando ${moeda(pendentes.reduce((a, r) => a + Number(r.liquido), 0))}?`, "Marcar todos"))) return;
    try { for (const r of pendentes) await pagar(r); aviso("Folha paga!"); } catch (e) { aviso(e.message, true); }
    renderFolha();
  });
  $("#foImprimir")?.addEventListener("click", () => imprimirFolha(L, mesFolha));
  $("#foCsv")?.addEventListener("click", () => baixarCsv(`folha-${mesFolha.slice(0, 7)}.csv`,
    ["Funcionário", "Forma", "Cargo", "Salário", "Horas", "Valor horas", "Horas extras", "Valor extras", "Bonificações", "Vales", "Descontos", "Líquido", "Pago?"],
    L.map((r) => [r.nome, r.forma === "mensal" ? "Mensal" : "Por hora", r.cargo, r.salario, r.horas, r.valor_horas, r.horas_extras, r.valor_extras, r.bonus, r.vales, r.descontos, r.liquido, r.folha_pagamento_id ? "Sim" : "Não"]
      .map((v) => (typeof v === "number" ? String(v).replace(".", ",") : v)))));
}

function janelaImpressao(titulo, corpo) {
  const w = window.open("", "_blank");
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
    <link rel="stylesheet" href="${new URL("css/style.css", location.href)}"></head><body style="background:#fff;padding:1.5rem">${corpo}
    <script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}
function imprimirHolerite(r, mes) {
  const linha = (a, b, neg) => `<tr><td>${a}</td><td class="right">${neg ? "− " : ""}${moeda(b)}</td></tr>`;
  janelaImpressao(`Holerite ${r.nome} ${nomeMes(mes)}`, `
    <h1>${esc(NOME_FABRICA)} — Holerite</h1>
    <p><strong>Funcionário:</strong> ${esc(r.nome)}${r.cargo ? ` · ${esc(r.cargo)}` : ""}<br><strong>Mês:</strong> ${esc(nomeMes(mes))}
      ${r.pix ? `<br><strong>PIX:</strong> ${esc(r.pix)}` : ""}</p>
    <table><thead><tr><th>Descrição</th><th class="right">Valor</th></tr></thead><tbody>
      ${r.forma === "mensal" ? linha("Salário mensal", r.salario) : linha(`Horas trabalhadas (${inteiro(r.horas)} h)`, r.valor_horas)}
      ${Number(r.valor_extras) ? linha(`Horas extras (${inteiro(r.horas_extras)} h)`, r.valor_extras) : ""}
      ${Number(r.bonus) ? linha("Bonificações", r.bonus) : ""}
      ${Number(r.vales) ? linha("Vales / adiantamentos", r.vales, true) : ""}
      ${Number(r.descontos) ? linha("Descontos", r.descontos, true) : ""}
    </tbody><tfoot><tr><td>Líquido a receber</td><td class="right">${moeda(r.liquido)}</td></tr></tfoot></table>
    <p style="margin-top:2.5rem">Recebi a importância de <strong>${moeda(r.liquido)}</strong> referente a ${esc(nomeMes(mes).toLowerCase())}.</p>
    <p style="margin-top:3rem">_______________________________________<br>${esc(r.nome)}</p>`);
}
function imprimirFolha(L, mes) {
  janelaImpressao(`Folha ${nomeMes(mes)}`, `
    <h1>${esc(NOME_FABRICA)} — Folha de pagamento</h1><p><strong>Mês:</strong> ${esc(nomeMes(mes))}</p>
    <table><thead><tr><th>Funcionário</th><th class="right">Salário / horas</th><th class="right">Extras</th><th class="right">Bônus</th><th class="right">Vales e desc.</th><th class="right">Líquido</th><th>Situação</th></tr></thead>
    <tbody>${L.map((r) => `<tr><td>${esc(r.nome)}</td><td class="right">${moeda(Number(r.salario) + Number(r.valor_horas))}</td><td class="right">${moeda(r.valor_extras)}</td>
      <td class="right">${moeda(r.bonus)}</td><td class="right">− ${moeda(Number(r.vales) + Number(r.descontos))}</td><td class="right">${moeda(r.liquido)}</td><td>${r.folha_pagamento_id ? "Pago" : "A pagar"}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td>Total</td><td></td><td></td><td></td><td></td><td class="right">${moeda(L.reduce((a, r) => a + Number(r.liquido), 0))}</td><td></td></tr></tfoot></table>`);
}

// ---------------------------------------------------------------
// GASTOS DO MÊS
// ---------------------------------------------------------------
const CATEGORIAS = ["Aluguel", "Água", "Luz / energia", "Internet / telefone", "Manutenção", "Material", "Impostos", "Transporte", "Limpeza", "Outros"];
let mesGastos = inicioMes();
let filtroGasto = "todos";
async function renderGastos() {
  try { await rpc("gerar_gastos_fixos", { p_mes: mesGastos }); } catch { /* sem permissão ou sem fixos */ }
  const ant = addMes(mesGastos, -1);
  const [todos, anteriores] = await Promise.all([
    q(sb.from("gastos").select("*").gte("data", mesGastos).lte("data", fimDoMes(mesGastos)).order("data", { ascending: false })),
    q(sb.from("gastos").select("valor, cancelado, data").gte("data", ant).lte("data", fimDoMes(ant))),
  ]);
  const gastos = todos.filter((g) => !g.cancelado);
  const total = soma(gastos, "valor"), totalAnt = soma(anteriores.filter((g) => !g.cancelado), "valor");
  const fixos = gastos.filter((g) => g.gasto_fixo_id), manut = gastos.filter((g) => g.manutencao_id);
  const lista = filtroGasto === "fixos" ? fixos : filtroGasto === "variaveis" ? gastos.filter((g) => !g.gasto_fixo_id) : gastos;
  const porCat = {};
  gastos.forEach((g) => (porCat[g.categoria] = (porCat[g.categoria] || 0) + Number(g.valor)));
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const varTxt = totalAnt ? `${total >= totalAnt ? "+" : "−"} ${Math.abs(Math.round(((total - totalAnt) / totalAnt) * 100))}%` : "—";
  main.innerHTML = `
    <div class="topo-pagina"><div><h1>Gastos do mês</h1><p>Aluguel, água, luz, internet, manutenção e material.</p></div>
      <div class="topo-acoes">${navMes("ga", mesGastos)}<button class="btn sec" id="gaFixos">Gastos fixos</button><button class="btn acento" id="gaNovo">＋ Novo gasto</button></div></div>
    <div class="kpis-v2">
      <div class="kpi-v2 escuro"><span>Total de gastos</span><strong>${moeda(total)}</strong><small>${esc(nomeMes(mesGastos).toLowerCase())}</small></div>
      <div class="kpi-v2"><span>Fixos do mês</span><strong>${moeda(soma(fixos, "valor"))}</strong><small>repetem todo mês</small></div>
      <div class="kpi-v2"><span>Manutenção</span><strong>${moeda(soma(manut, "valor"))}</strong><small>${manut.length} serviço${manut.length === 1 ? "" : "s"}</small></div>
      <div class="kpi-v2"><span>Comparado ao mês anterior</span><strong>${varTxt}</strong><small>${moeda(totalAnt)} em ${esc(nomeMes(ant).split(" ")[0].toLowerCase())}</small></div>
    </div>
    <div class="grade-gastos">
      <div class="card">
        <div class="section-head"><h2 style="margin:0">Lançamentos</h2>
          <div class="seg">${[["todos", "Todos"], ["fixos", "Fixos"], ["variaveis", "Variáveis"]].map(([k, t]) => `<button class="${k === filtroGasto ? "ativo" : ""}" data-fg="${k}">${t}</button>`).join("")}</div></div>
        ${lista.length ? `<ul class="lista-final">${lista.map((g) => `<li>
          <span>${diaMes(g.data)} – <strong>${esc(g.descricao)}</strong> <span class="chip-tipo">${esc(g.categoria)}</span>
            ${g.gasto_fixo_id ? `<span class="small muted">fixo</span>` : ""}${g.observacao ? `<br><span class="small muted">${esc(g.observacao)}</span>` : ""} ${autorTag(g)}</span>
          <span style="white-space:nowrap;display:flex;gap:.4rem;align-items:center"><strong class="num">${moeda(g.valor)}</strong>
            ${g.manutencao_id ? "" : `<button class="btn sec peq" data-edg="${g.id}">Editar</button>`}${lixeira(`data-exg="${g.id}"`, "Excluir gasto")}</span></li>`).join("")}</ul>
          <div class="soma-final"><span>TOTAL</span><span>${moeda(soma(lista, "valor"))}</span></div>`
          : `<p class="muted">Nenhum gasto ${filtroGasto === "todos" ? "neste mês" : "neste filtro"}. Clique em <strong>＋ Novo gasto</strong>.</p>`}
      </div>
      <div class="card">
        <h2 style="margin-top:0">Por categoria</h2>
        ${cats.length ? cats.map(([c, v]) => `<div class="barra-cat"><span>${esc(c)}</span><strong>${moeda(v)}</strong>
          <i><b style="width:${Math.max(2, Math.round((v / total) * 100))}%"></b></i></div>`).join("") : `<p class="muted small">Sem gastos ainda.</p>`}
        <p class="muted small">Gastos <strong>fixos</strong> entram sozinhos todo mês. Mudou o valor da luz? Clique em <strong>Editar</strong> no lançamento do mês.</p>
      </div>
    </div>`;
  ligarNavMes("ga", () => mesGastos, (v) => (mesGastos = v), renderGastos);
  $$("[data-fg]", main).forEach((b) => (b.onclick = () => { filtroGasto = b.dataset.fg; renderGastos(); }));
  $("#gaNovo").onclick = () => modalGasto();
  $("#gaFixos").onclick = () => modalGastosFixos();
  $$("[data-edg]", main).forEach((b) => (b.onclick = () => modalGasto(gastos.find((g) => g.id == b.dataset.edg))));
  $$("[data-exg]", main).forEach((b) => (b.onclick = async () => {
    const g = gastos.find((x) => x.id == b.dataset.exg);
    if (g.manutencao_id) return aviso("Este gasto veio de uma manutenção. Exclua pela tela de Equipamentos.", true);
    const txt = g.gasto_fixo_id ? `Excluir "${g.descricao}" só deste mês? Para parar de lançar todo mês, use o botão Gastos fixos.` : `Excluir "${g.descricao}" (${moeda(g.valor)})?`;
    if (!(await confirmar(txt, "Excluir"))) return;
    try {
      if (g.gasto_fixo_id) await q(sb.from("gastos").update({ cancelado: true }).eq("id", g.id));
      else await q(sb.from("gastos").delete().eq("id", g.id));
      aviso("Gasto excluído."); renderGastos();
    } catch (e) { aviso(e.message, true); }
  }));
}
const listaCategorias = () => `<datalist id="listaCat">${CATEGORIAS.map((c) => `<option value="${c}">`).join("")}</datalist>`;

function modalGasto(g = {}) {
  const hoje = isoLocal();
  const dataPadrao = g.data || (hoje >= mesGastos && hoje <= fimDoMes(mesGastos) ? hoje : mesGastos);
  abrirModal({
    titulo: g.id ? "Editar gasto" : "Novo gasto",
    conteudo: `
      <div class="linha">
        <div><label>Descrição *</label><input name="descricao" value="${esc(g.descricao)}" required placeholder="Ex.: Conta de luz"></div>
        <div><label>Categoria *</label><input name="categoria" list="listaCat" value="${esc(g.categoria || "")}" required placeholder="Escolha ou escreva">${listaCategorias()}</div>
      </div>
      <div class="linha">
        <div><label>Dia *</label><input name="data" type="date" value="${dataPadrao}" required></div>
        <div><label>Valor (R$) *</label><input name="valor" type="number" min="0" step="0.01" inputmode="decimal" value="${g.valor ?? ""}" required></div>
      </div>
      <div class="linha"><div><label>Observação</label><input name="obs" value="${esc(g.observacao)}"></div></div>
      ${g.id ? (g.gasto_fixo_id ? `<p class="muted small">Gasto fixo: a mudança vale só para este mês.</p>` : "")
        : `<label style="display:flex;gap:.5rem;align-items:center;margin-bottom:.8rem"><input type="checkbox" name="fixo" style="width:auto"> Repetir todo mês (gasto fixo, como aluguel)</label>`}
      <button type="submit" class="btn bloco">Salvar</button>`,
    onSubmit: async (fd) => {
      const d = { descricao: String(fd.get("descricao") || "").trim(), categoria: String(fd.get("categoria") || "").trim() || "Outros",
        data: fd.get("data"), valor: Number(fd.get("valor")), observacao: fd.get("obs") || null };
      if (!d.descricao || fd.get("valor") === "" || d.valor < 0) throw new Error("Informe a descrição e o valor.");
      if (g.id) await q(sb.from("gastos").update(d).eq("id", g.id));
      else if (fd.get("fixo") === "on") {
        await q(sb.from("gastos_fixos").insert({ descricao: d.descricao, categoria: d.categoria, valor: d.valor, dia: Math.min(28, dt(d.data).getDate()) }));
        await rpc("gerar_gastos_fixos", { p_mes: addMes(d.data, 0) });
      } else await q(sb.from("gastos").insert(d));
      aviso("Gasto salvo!"); renderGastos();
    },
  });
}

async function modalGastosFixos() {
  const fixos = (await q(sb.from("gastos_fixos").select("*").order("descricao"))).filter((f) => f.ativo);
  const m = abrirModal({
    titulo: "Gastos fixos (todo mês)",
    conteudo: `
      <p class="muted small" style="margin-top:0">Estes gastos entram sozinhos no começo de cada mês. Mudar o valor aqui vale para os próximos meses.</p>
      ${fixos.length ? `<ul class="lista-final">${fixos.map((f) => `<li>
        <span><strong>${esc(f.descricao)}</strong> <span class="chip-tipo">${esc(f.categoria)}</span><br><span class="small muted">todo dia ${f.dia}</span> ${autorTag(f)}</span>
        <span style="display:flex;gap:.4rem;align-items:center"><strong class="num">${moeda(f.valor)}</strong>
          <button type="button" class="btn sec peq" data-edf="${f.id}">Editar</button>${lixeira(`data-exf="${f.id}"`, "Parar de lançar")}</span></li>`).join("")}</ul>`
        : `<p class="muted">Nenhum gasto fixo. Ao lançar um gasto, marque "Repetir todo mês".</p>`}
      <button type="submit" class="btn bloco sec">Fechar</button>`,
  });
  $$("[data-edf]", m.form).forEach((b) => (b.onclick = () => {
    const f = fixos.find((x) => x.id == b.dataset.edf);
    m.fechar();
    abrirModal({
      titulo: `Editar gasto fixo`,
      conteudo: `<div class="linha"><div><label>Descrição *</label><input name="descricao" value="${esc(f.descricao)}" required></div>
          <div><label>Categoria</label><input name="categoria" list="listaCat" value="${esc(f.categoria)}">${listaCategorias()}</div></div>
        <div class="linha"><div><label>Valor (R$) *</label><input name="valor" type="number" min="0" step="0.01" value="${f.valor}" required></div>
          <div><label>Dia do mês</label><input name="dia" type="number" min="1" max="28" value="${f.dia}"></div></div>
        <button type="submit" class="btn bloco">Salvar</button>`,
      onSubmit: async (fd) => {
        await q(sb.from("gastos_fixos").update({ descricao: fd.get("descricao"), categoria: fd.get("categoria") || "Outros",
          valor: Number(fd.get("valor")), dia: Math.min(28, Math.max(1, Number(fd.get("dia")) || 5)) }).eq("id", f.id));
        aviso("Salvo! Vale a partir do próximo mês."); modalGastosFixos();
      },
    });
  }));
  $$("[data-exf]", m.form).forEach((b) => (b.onclick = async () => {
    const f = fixos.find((x) => x.id == b.dataset.exf);
    if (!(await confirmar(`Parar de lançar "${f.descricao}" todo mês? Os meses já lançados continuam.`, "Parar"))) return;
    try { await q(sb.from("gastos_fixos").update({ ativo: false }).eq("id", f.id)); aviso("Pronto."); m.fechar(); modalGastosFixos(); }
    catch (e) { aviso(e.message, true); }
  }));
}

// ---------------------------------------------------------------
// EQUIPAMENTOS
// ---------------------------------------------------------------
const SITUACOES = { funcionando: ["Funcionando", "pronto"], manutencao: ["Em manutenção", "aberto"], parado: ["Parado", "cancelado"] };
let equipSel = null;
async function renderEquipamentos() {
  const [todos, manuts] = await Promise.all([
    q(sb.from("equipamentos").select("*").order("nome")),
    q(sb.from("manutencoes").select("*").order("data", { ascending: false })),
  ]);
  const equips = todos.filter((e) => !e.excluido_em);
  const ano = String(new Date().getFullYear());
  const totalDe = (id, soAno) => manuts.filter((m) => m.equipamento_id === id && (!soAno || m.data.startsWith(ano))).reduce((a, m) => a + Number(m.valor), 0);
  const noAno = manuts.filter((m) => m.data.startsWith(ano) && equips.some((e) => e.id === m.equipamento_id));
  const caro = equips.map((e) => [e, totalDe(e.id, true)]).sort((a, b) => b[1] - a[1])[0];
  if (!equips.some((e) => e.id === equipSel)) equipSel = equips[0]?.id ?? null;
  const sel = equips.find((e) => e.id === equipSel);
  const hist = sel ? manuts.filter((m) => m.equipamento_id === sel.id) : [];
  main.innerHTML = `
    <div class="topo-pagina"><div><h1>Equipamentos</h1><p>Valor de compra e histórico de manutenção de cada máquina.</p></div>
      <div class="topo-acoes"><button class="btn acento" id="eqNovo">＋ Novo equipamento</button></div></div>
    <div class="kpis-v2">
      <div class="kpi-v2 escuro"><span>Valor em equipamentos</span><strong>${moeda(soma(equips, "valor_compra"))}</strong><small>${equips.length} equipamento${equips.length === 1 ? "" : "s"}</small></div>
      <div class="kpi-v2"><span>Manutenção em ${ano}</span><strong>${moeda(soma(noAno, "valor"))}</strong><small>${noAno.length} serviço${noAno.length === 1 ? "" : "s"}</small></div>
      <div class="kpi-v2"><span>Mais caro de manter</span><strong class="kpi-txt">${caro && caro[1] ? esc(caro[0].nome) : "—"}</strong><small>${caro && caro[1] ? `${moeda(caro[1])} em ${ano}` : "sem manutenção no ano"}</small></div>
      <div class="kpi-v2 ${equips.some((e) => e.situacao !== "funcionando") ? "amarelo" : ""}"><span>Parados ou em manutenção</span><strong>${equips.filter((e) => e.situacao !== "funcionando").length}</strong><small>${esc(equips.filter((e) => e.situacao !== "funcionando").map((e) => e.nome).join(", ") || "todos funcionando")}</small></div>
    </div>
    ${equips.length ? `<div class="grade-equip">
      <div class="lista-equip">${equips.map((e) => `<button class="equip-card ${e.id === equipSel ? "sel" : ""}" data-eq="${e.id}">
        <span class="eq-topo"><strong>${esc(e.nome)}</strong>${selo(SITUACOES[e.situacao][1], SITUACOES[e.situacao][0])}</span>
        <span class="small muted">${e.data_compra ? `Comprado em ${dataBR(e.data_compra)}` : "Data de compra não informada"}${e.valor_compra != null ? ` · ${moeda(e.valor_compra)}` : ""}</span>
        <span class="small">Manutenção total: <strong>${moeda(totalDe(e.id))}</strong></span>${autorTag(e)}</button>`).join("")}</div>
      <div class="card">
        <div class="section-head" style="align-items:flex-start">
          <div><h2 style="margin:0">${esc(sel.nome)}</h2><p class="small muted" style="margin:.2rem 0 0">${[sel.modelo, sel.numero_serie ? `nº ${sel.numero_serie}` : ""].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</p></div>
          <span style="display:flex;gap:.4rem"><button class="btn sec peq" id="eqEditar">Editar</button>${lixeira('id="eqExcluir"', "Excluir equipamento")}</span>
        </div>
        <div class="ff-resumo tres">
          <div>Valor de compra<strong>${sel.valor_compra != null ? moeda(sel.valor_compra) : "—"}</strong></div>
          <div>Manutenção total<strong>${moeda(totalDe(sel.id))}</strong></div>
          <div>Última manutenção<strong>${hist[0] ? dataBR(hist[0].data) : "—"}</strong></div>
        </div>
        ${sel.observacao ? `<p class="small">${esc(sel.observacao)}</p>` : ""}
        <div class="section-head"><h3 style="margin:0">Histórico de manutenção</h3><button class="btn acento peq" id="eqManut">＋ Registrar manutenção</button></div>
        ${hist.length ? `<ul class="lista-final">${hist.map((h) => `<li><span>${dataBR(h.data)} – <strong>${esc(h.descricao)}</strong>${h.responsavel ? `<br><span class="small muted">${esc(h.responsavel)}</span>` : ""} ${autorTag(h)}</span>
          <span style="display:flex;gap:.4rem;align-items:center"><strong class="num">${moeda(h.valor)}</strong>
            <button class="btn sec peq" data-edm="${h.id}">Editar</button>${lixeira(`data-exm="${h.id}"`, "Excluir manutenção")}</span></li>`).join("")}</ul>`
          : `<p class="muted">Nenhuma manutenção registrada.</p>`}
        <p class="muted small">Cada manutenção registrada aqui entra também nos <strong>Gastos do mês</strong>.</p>
      </div>
    </div>` : `<div class="card vazio">Nenhum equipamento cadastrado. Clique em <strong>＋ Novo equipamento</strong>.</div>`}`;
  $("#eqNovo").onclick = () => modalEquip();
  $$("[data-eq]", main).forEach((b) => (b.onclick = () => { equipSel = Number(b.dataset.eq); renderEquipamentos(); }));
  if (!sel) return;
  $("#eqEditar").onclick = () => modalEquip(sel);
  $("#eqExcluir").onclick = async () => {
    if (!(await confirmar(`Excluir ${sel.nome}? O histórico de manutenção continua nos gastos.`, "Excluir"))) return;
    try { await q(sb.from("equipamentos").update({ excluido_em: agoraIso() }).eq("id", sel.id)); equipSel = null; aviso("Equipamento excluído."); renderEquipamentos(); }
    catch (e) { aviso(e.message, true); }
  };
  $("#eqManut").onclick = () => modalManut(sel);
  $$("[data-edm]", main).forEach((b) => (b.onclick = () => modalManut(sel, hist.find((h) => h.id == b.dataset.edm))));
  $$("[data-exm]", main).forEach((b) => (b.onclick = async () => {
    const h = hist.find((x) => x.id == b.dataset.exm);
    if (!(await confirmar(`Excluir a manutenção "${h.descricao}"? Ela sai também dos gastos do mês.`, "Excluir"))) return;
    try { await q(sb.from("manutencoes").delete().eq("id", h.id)); aviso("Manutenção excluída."); renderEquipamentos(); }
    catch (e) { aviso(e.message, true); }
  }));
}
function modalEquip(e = {}) {
  abrirModal({
    titulo: e.id ? `Editar ${e.nome}` : "Novo equipamento",
    conteudo: `
      <div class="linha"><div><label>Nome *</label><input name="nome" value="${esc(e.nome)}" required placeholder="Ex.: Bordadeira Tajima 6 cabeças"></div></div>
      <div class="linha">
        <div><label>Modelo / marca</label><input name="modelo" value="${esc(e.modelo)}"></div>
        <div><label>Nº de série</label><input name="numero_serie" value="${esc(e.numero_serie)}"></div>
      </div>
      <div class="linha">
        <div><label>Data da compra</label><input name="data_compra" type="date" value="${e.data_compra ?? ""}"></div>
        <div><label>Valor da compra (R$)</label><input name="valor_compra" type="number" min="0" step="0.01" value="${e.valor_compra ?? ""}"></div>
        <div><label>Situação</label><select name="situacao">${Object.entries(SITUACOES).map(([k, [t]]) => `<option value="${k}" ${(e.situacao || "funcionando") === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      </div>
      <div class="linha"><div><label>Observação</label><input name="observacao" value="${esc(e.observacao)}"></div></div>
      <button type="submit" class="btn bloco">Salvar</button>`,
    onSubmit: async (fd) => {
      const d = { nome: String(fd.get("nome") || "").trim(), modelo: fd.get("modelo") || null, numero_serie: fd.get("numero_serie") || null,
        data_compra: fd.get("data_compra") || null, valor_compra: fd.get("valor_compra") === "" ? null : Number(fd.get("valor_compra")),
        situacao: fd.get("situacao"), observacao: fd.get("observacao") || null };
      if (!d.nome) throw new Error("Informe o nome do equipamento.");
      if (e.id) await q(sb.from("equipamentos").update(d).eq("id", e.id));
      else await q(sb.from("equipamentos").insert(d));
      aviso("Equipamento salvo!"); renderEquipamentos();
    },
  });
}
function modalManut(e, h = {}) {
  abrirModal({
    titulo: h.id ? "Editar manutenção" : `Manutenção — ${e.nome}`,
    conteudo: `
      <div class="linha">
        <div><label>Dia *</label><input name="data" type="date" value="${h.data || isoLocal()}" required></div>
        <div><label>Valor (R$) *</label><input name="valor" type="number" min="0" step="0.01" inputmode="decimal" value="${h.valor ?? ""}" required></div>
      </div>
      <div class="linha"><div><label>O que foi feito *</label><input name="descricao" value="${esc(h.descricao)}" required placeholder="Ex.: Troca de correia"></div></div>
      <div class="linha"><div><label>Técnico / empresa</label><input name="responsavel" value="${esc(h.responsavel)}"></div></div>
      ${h.id ? "" : `<label style="display:flex;gap:.5rem;align-items:center;margin-bottom:.8rem"><input type="checkbox" name="voltou" style="width:auto" checked> Máquina voltou a funcionar</label>`}
      <p class="muted small">O valor entra também nos Gastos do mês.</p>
      <button type="submit" class="btn bloco">Salvar</button>`,
    onSubmit: async (fd) => {
      const d = { data: fd.get("data"), valor: Number(fd.get("valor")), descricao: String(fd.get("descricao") || "").trim(), responsavel: fd.get("responsavel") || null };
      if (!d.descricao || fd.get("valor") === "") throw new Error("Informe o que foi feito e o valor.");
      if (h.id) await q(sb.from("manutencoes").update(d).eq("id", h.id));
      else {
        await q(sb.from("manutencoes").insert({ ...d, equipamento_id: e.id }));
        if (fd.get("voltou") === "on" && e.situacao !== "funcionando") await q(sb.from("equipamentos").update({ situacao: "funcionando" }).eq("id", e.id));
      }
      aviso("Manutenção salva!"); renderEquipamentos();
    },
  });
}

// ---------------------------------------------------------------
// RELATÓRIOS — semanal, quinzenal, mensal e bimestral
// ---------------------------------------------------------------
let tipoRel = "mensal", refRel = isoLocal();
const TIPOS_REL = { semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal", bimestral: "Bimestral" };
function periodoRel(tipo, ref) {
  if (tipo !== "bimestral") return periodo(tipo, ref);
  const d = dt(ref), m0 = d.getMonth() - (d.getMonth() % 2);
  const ini = inicioMes(new Date(d.getFullYear(), m0, 1)), fim = fimMes(new Date(d.getFullYear(), m0 + 1, 1));
  return { tipo, inicio: ini, fim, rotulo: `${nomeMes(ini).split(" ")[0]} e ${nomeMes(fim)}` };
}
async function renderRelatorios() {
  const p = periodoRel(tipoRel, refRel);
  const mesesInteiros = ["mensal", "bimestral"].includes(tipoRel);
  const [ganhos, entradas, gastosT, maos] = await Promise.all([
    q(sb.from("v_ganhos").select("*").gte("dia", p.inicio).lte("dia", p.fim)),
    q(sb.from("v_entradas").select("*").gte("data", p.inicio).lte("data", p.fim)),
    q(sb.from("gastos").select("*").gte("data", p.inicio).lte("data", p.fim)),
    carregarMaos(false),
  ]);
  const gastos = gastosT.filter((g) => !g.cancelado);
  const funcIds = new Set(maos.filter(ehFuncHora).map((m) => m.id));
  let folha = 0;
  if (mesesInteiros) {
    for (let m = p.inicio; m <= p.fim; m = addMes(m, 1)) {
      const r = await rpc("resumo_folha", { p_mes: m }).catch(() => []);
      folha += (Array.isArray(r) ? r : []).reduce((a, x) => a + Number(x.liquido || 0), 0);
    }
  }
  const externos = ganhos.filter((g) => !(mesesInteiros && funcIds.has(g.mao_de_obra_id)));
  const maoObra = soma(externos, "valor"), entrou = soma(entradas, "valor_total"), gastou = soma(gastos, "valor");
  const resultado = entrou - maoObra - folha - gastou;

  const prod = {};
  ganhos.filter((g) => g.origem !== "hora").forEach((g) => {
    const k = `${g.produto_nome} · ${g.servico_nome}`;
    prod[k] ??= { nome: k, qtd: 0, valor: 0 };
    prod[k].qtd += Number(g.quantidade); prod[k].valor += Number(g.valor);
  });
  const ranking = Object.values(prod).sort((a, b) => b.qtd - a.qtd);
  const maxQ = ranking[0]?.qtd || 1;
  const pes = {};
  ganhos.forEach((g) => {
    pes[g.mao_de_obra_nome] ??= { nome: g.mao_de_obra_nome, pc: 0, h: 0, valor: 0, itens: {} };
    const x = pes[g.mao_de_obra_nome];
    if (g.origem === "hora") x.h += Number(g.quantidade);
    else { x.pc += Number(g.quantidade); const k = `${g.produto_nome} · ${g.servico_nome}`; x.itens[k] = (x.itens[k] || 0) + Number(g.quantidade); }
    x.valor += Number(g.valor);
  });
  const pessoas = Object.values(pes).sort((a, b) => b.valor - a.valor)
    .map((x) => ({ ...x, top: Object.entries(x.itens).sort((a, b) => b[1] - a[1])[0]?.[0] || (x.h ? "Horas trabalhadas" : "—") }));
  const qtdTxtP = (x) => [x.pc ? `${inteiro(x.pc)} pç` : "", x.h ? `${inteiro(x.h)} h` : ""].filter(Boolean).join(" · ") || "—";

  main.innerHTML = `
    <div class="topo-pagina"><div><h1>Relatórios</h1><p>O que entrou, o que saiu e o que mais foi produzido no período.</p></div></div>
    <div class="barra-periodo">
      <div class="seg">${Object.entries(TIPOS_REL).map(([k, t]) => `<button class="${k === tipoRel ? "ativo" : ""}" data-tr="${k}">${t}</button>`).join("")}</div>
      <div class="nav-periodo">
        <button class="btn sec peq" id="reAnt" aria-label="Período anterior">◀</button><strong>${esc(p.rotulo)}</strong>
        <button class="btn sec peq" id="reSeg" aria-label="Próximo período">▶</button><button class="btn sec peq" id="reHoje">Hoje</button>
      </div>
    </div>
    <div class="kpis-v2">
      <div class="kpi-v2 escuro"><span>Resultado do período</span><strong style="${resultado < 0 ? "color:#ff8a80" : ""}">${moeda(resultado)}</strong><small>entrou − saiu</small></div>
      <div class="kpi-v2"><span>Entrou (empresas)</span><strong>${moeda(entrou)}</strong><small>${entradas.length} entrada${entradas.length === 1 ? "" : "s"}</small></div>
      <div class="kpi-v2"><span>Mão de obra${mesesInteiros ? " + folha" : ""}</span><strong>${moeda(maoObra + folha)}</strong><small>${mesesInteiros ? `${moeda(maoObra)} + ${moeda(folha)} folha` : "salários mensais: veja o relatório mensal"}</small></div>
      <div class="kpi-v2"><span>Gastos da fábrica</span><strong>${moeda(gastou)}</strong><small>${gastos.length} lançamento${gastos.length === 1 ? "" : "s"}</small></div>
    </div>
    <div class="grade-gastos">
      <div class="card">
        <h2 style="margin:0">Produtos mais feitos</h2>
        <p class="small muted" style="margin:.2rem 0 .8rem">Somando todas as mãos de obra · peças finalizadas</p>
        ${ranking.length ? ranking.slice(0, 15).map((r, i) => `<div class="rank-linha"><span class="rank-pos ${i ? "" : "um"}">${i + 1}</span>
          <div><strong>${esc(r.nome)}</strong><i><b style="width:${Math.max(2, Math.round((r.qtd / maxQ) * 100))}%" class="${i ? "" : "um"}"></b></i></div>
          <span class="right">${inteiro(r.qtd)} pç</span><strong class="right num">${moeda(r.valor)}</strong></div>`).join("")
          : `<p class="muted">Nenhuma peça finalizada neste período.</p>`}
      </div>
      <div class="card">
        <h2 style="margin-top:0">Por mão de obra</h2>
        ${pessoas.length ? `<ul class="lista-final">${pessoas.map((x) => `<li><span><strong>${esc(x.nome)}</strong><br><span class="small muted">mais fez: ${esc(x.top)}</span></span>
          <span class="right"><span class="small">${qtdTxtP(x)}</span><br><strong class="num">${moeda(x.valor)}</strong></span></li>`).join("")}</ul>`
          : `<p class="muted">Ninguém finalizou nada neste período.</p>`}
      </div>
    </div>
    <div class="acoes"><button class="btn sec" id="reImprimir">🖨️ Imprimir</button><button class="btn sec" id="reCsv">Baixar planilha (CSV)</button></div>`;

  $$("[data-tr]", main).forEach((b) => (b.onclick = () => { tipoRel = b.dataset.tr; renderRelatorios(); }));
  $("#reAnt").onclick = () => { refRel = tipoRel === "bimestral" ? addMes(p.inicio, -2) : periodoAnterior(p).inicio; renderRelatorios(); };
  $("#reSeg").onclick = () => { refRel = tipoRel === "bimestral" ? addMes(p.inicio, 2) : periodoSeguinte(p).inicio; renderRelatorios(); };
  $("#reHoje").onclick = () => { refRel = isoLocal(); renderRelatorios(); };
  $("#reImprimir").onclick = () => window.print();
  $("#reCsv").onclick = () => baixarCsv(`relatorio-${tipoRel}-${p.inicio}.csv`, ["Tipo", "Nome", "Quantidade", "Valor"], [
    ["Resumo", "Entrou (empresas)", "", entrou], ["Resumo", "Mão de obra", "", maoObra], ["Resumo", "Folha", "", folha], ["Resumo", "Gastos", "", gastou], ["Resumo", "Resultado", "", resultado],
    ...ranking.map((r) => ["Produto", r.nome, r.qtd, r.valor]),
    ...pessoas.map((x) => ["Mão de obra", x.nome, qtdTxtP(x), x.valor]),
  ].map((l) => l.map((v) => (typeof v === "number" ? v.toFixed(2).replace(".", ",") : v))));
}


// ===============================================================
// VERSÃO 8 — vários administradores e "quem fez" em cada alteração
// ===============================================================
let NOMES = {};
async function carregarNomes() {
  try { (await q(sb.from("perfis").select("id, nome"))).forEach((p) => (NOMES[p.id] = p.nome)); } catch { /* segue sem nomes */ }
}
const quandoCurto = (iso) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
// Etiqueta pequena: quem fez a última alteração e quando
const autorTag = (r) => {
  const id = r?.alterado_por || r?.criado_por;
  if (!id || !NOMES[id]) return "";
  return `<span class="autor" title="Última alteração por ${esc(NOMES[id])}">${esc(NOMES[id].split(" ")[0])}${r.alterado_em ? ` · ${quandoCurto(r.alterado_em)}` : ""}</span>`;
};

async function carregarAdmins() {
  return q(sb.from("perfis").select("*").eq("papel", "dono").order("nome"));
}
function cardAdmins() {
  return `<div class="card section" id="cardAdmins" style="margin-top:1rem">
    <div class="section-head"><h2 style="margin:0">Administradores</h2><button class="btn acento peq" id="novoAdmin" type="button">＋ Novo administrador</button></div>
    <p class="muted small" style="margin-top:.2rem">Quem pode entrar no painel do dono. Cada alteração no sistema fica anotada com o nome de quem fez.</p>
    <div id="listaAdmins"><p class="muted small">Carregando…</p></div>
  </div>
  <div class="card section" id="cardHistorico" style="margin-top:1rem">
    <div class="section-head"><h2 style="margin:0">Histórico de alterações</h2>
      <select id="histFiltro" style="max-width:260px;width:auto"><option value="">Todos os administradores</option></select></div>
    <div id="listaHist"><p class="muted small">Carregando…</p></div>
  </div>`;
}
async function ligarAdmins() {
  const admins = await carregarAdmins();
  const ativos = admins.filter((a) => a.ativo);
  $("#listaAdmins").innerHTML = `<ul class="lista-final">${admins.map((a) => `<li>
    <span><strong>${esc(a.nome)}</strong>${a.id === perfil.id ? ` <span class="small muted">(você)</span>` : ""}<br>
      <span class="small muted">usuário: ${esc(a.usuario)}</span> ${a.ativo ? "" : selo("cancelado", "Desativado")}</span>
    <span style="display:flex;gap:.4rem;flex-wrap:wrap;justify-content:flex-end">
      ${a.id === perfil.id ? `<button class="btn sec peq" type="button" id="adminMinhaConta">Minha conta</button>`
        : `<button class="btn sec peq" type="button" data-adlogin="${a.id}">Login</button>
           <button class="btn ${a.ativo ? "perigo" : "ok"} peq" type="button" data-adat="${a.id}">${a.ativo ? "Desativar" : "Ativar"}</button>`}
    </span></li>`).join("")}</ul>`;
  $("#adminMinhaConta")?.addEventListener("click", modalMinhaConta);
  $$("[data-adlogin]").forEach((b) => (b.onclick = () => modalLogin(admins.find((a) => a.id === b.dataset.adlogin), () => ligarAdmins())));
  $$("[data-adat]").forEach((b) => (b.onclick = async () => {
    const a = admins.find((x) => x.id === b.dataset.adat);
    if (a.ativo && ativos.length <= 1) return aviso("Precisa ficar pelo menos um administrador ativo.", true);
    if (!(await confirmar(`${a.ativo ? "Desativar" : "Ativar"} o acesso de ${a.nome} ao painel do dono?`, a.ativo ? "Desativar" : "Ativar"))) return;
    try { await adminUsuarios({ acao: a.ativo ? "desativar" : "ativar", id: a.id }); aviso("Pronto!"); ligarAdmins(); }
    catch (e) { aviso(e.message, true); }
  }));
  $("#novoAdmin").onclick = () => abrirModal({
    titulo: "Novo administrador",
    conteudo: `<p class="muted small" style="margin-top:0">Ele vai entrar no mesmo painel do dono, com acesso a tudo.</p>
      <div class="linha"><div><label>Nome *</label><input name="nome" required></div></div>
      <div class="linha">
        <div><label>Usuário (login) *</label><input name="usuario" required autocapitalize="none" placeholder="ex.: carlos"></div>
        <div><label>Senha inicial *</label><input name="senha" required minlength="6" placeholder="mín. 6 caracteres"></div>
      </div>
      <div class="linha"><div><label>WhatsApp</label><input name="whatsapp" inputmode="tel"></div></div>
      <button type="submit" class="btn bloco">Criar administrador</button>`,
    onSubmit: async (fd) => {
      const nome = String(fd.get("nome") || "").trim(), usuario = String(fd.get("usuario") || "").trim().toLowerCase();
      if (!nome || !usuario || String(fd.get("senha") || "").length < 6) throw new Error("Preencha nome, usuário e uma senha com pelo menos 6 caracteres.");
      const novo = await adminUsuarios({ acao: "criar", nome, usuario, senha: fd.get("senha"), whatsapp: fd.get("whatsapp") || null });
      if (!novo?.id) throw new Error("Não foi possível criar o login.");
      await rpc("tornar_admin", { p_id: novo.id });
      await carregarNomes();
      aviso(`Administrador criado! Usuário: ${usuario}`);
      ligarAdmins();
    },
  });
  const sel = $("#histFiltro");
  sel.innerHTML = `<option value="">Todos os administradores</option>${admins.map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join("")}`;
  sel.onchange = () => ligarHistorico(sel.value);
  ligarHistorico("");
}

const TABELAS_HIST = {
  perfis: "cadastro", produtos: "produto", servicos: "serviço", lotes: "lote", entregas: "entrega", pagamentos: "pagamento",
  notas: "nota de pagamento", empresas: "empresa", entradas: "entrada de empresa", horas: "horas", funcionarios_fixos: "funcionário",
  folha_pagamentos: "pagamento da folha", folha_lancamentos: "lançamento da folha", equipamentos: "equipamento",
  manutencoes: "manutenção", gastos_fixos: "gasto fixo", gastos: "gasto",
};
const ACOES_HIST = { insert: "Criou", update: "Alterou", delete: "Excluiu" };
function descreverHist(h) {
  const d = h.dados || {};
  const nome = d.nome || d.descricao || (d.mao_de_obra_id && NOMES[d.mao_de_obra_id]) || (d.perfil_id && NOMES[d.perfil_id]) || "";
  const valor = d.valor_total ?? d.valor ?? d.salario;
  const qtd = d.quantidade != null ? `${inteiro(d.quantidade)} ${h.tabela === "horas" ? "h" : "pç"}` : d.horas != null ? `${inteiro(d.horas)} h` : "";
  const acao = h.tabela === "perfis" && h.acao === "update" && d.excluido_em ? "Excluiu" : ACOES_HIST[h.acao];
  return `${acao} ${TABELAS_HIST[h.tabela] || h.tabela}${nome ? ` <strong>${esc(nome)}</strong>` : ""}${qtd ? ` · ${qtd}` : ""}${valor != null && !isNaN(valor) ? ` · ${moeda(valor)}` : ""}`;
}
async function ligarHistorico(usuario) {
  let c = sb.from("auditoria").select("*").order("quando", { ascending: false }).limit(120);
  if (usuario) c = c.eq("usuario_id", usuario);
  let hist = [];
  try { hist = await q(c); } catch (e) { $("#listaHist").innerHTML = `<p class="muted small">${esc(e.message)}</p>`; return; }
  $("#listaHist").innerHTML = hist.length ? `<ul class="lista-final hist">${hist.map((h) => `<li>
    <span>${descreverHist(h)}</span>
    <span class="autor">${esc((NOMES[h.usuario_id] || "—").split(" ")[0])} · ${quandoCurto(h.quando)}</span></li>`).join("")}</ul>
    <p class="muted small">Mostrando as últimas ${hist.length} alterações.</p>`
    : `<p class="muted small">Nenhuma alteração registrada ainda.</p>`;
}

// Troca usuário e/ou senha de um login (mão de obra, funcionário ou administrador)
function modalLogin(m, depois) {
  abrirModal({
    titulo: `Login de ${m.nome}`,
    conteudo: `<div class="linha">
        <div><label>Usuário</label><input name="usuario" value="${esc(m.usuario)}" required autocapitalize="none"></div>
        <div><label>Nova senha (deixe em branco para manter)</label><input name="senha" minlength="6" placeholder="mín. 6 caracteres"></div>
      </div>
      <p class="muted small">Depois de salvar, passe o novo usuário e/ou a nova senha para ${esc(m.nome)}.</p>
      <button type="submit" class="btn bloco">Salvar</button>`,
    onSubmit: async (fd) => {
      const novo = String(fd.get("usuario") || "").trim().toLowerCase();
      const senha = String(fd.get("senha") || "");
      if (!novo) throw new Error("Informe o usuário.");
      if (senha && senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
      const mudou = [];
      if (novo !== m.usuario) { await adminUsuarios({ acao: "alterar_usuario", id: m.id, usuario: novo }); mudou.push(`usuário: ${novo}`); }
      if (senha) { await adminUsuarios({ acao: "redefinir_senha", id: m.id, senha }); mudou.push("senha nova"); }
      aviso(mudou.length ? `Salvo! ${m.nome} — ${mudou.join(" e ")}` : "Nada foi alterado.");
      depois?.();
    },
  });
}


// ===============================================================
// VERSÃO 9 — Cadastro de Motorista (recebe os avisos de "terminei")
// ===============================================================
function cardMotoristas() {
  return `<div class="card section" id="cardMotoristas" style="margin-top:1rem">
    <div class="section-head"><h2 style="margin:0">Cadastro de Motorista</h2><button class="btn acento peq" id="novoMotorista" type="button">＋ Novo motorista</button></div>
    <p class="muted small" style="margin-top:.2rem">O motorista entra pelo mesmo endereço do sistema e vê só os lotes que as costureiras avisaram que terminaram:
      nome, endereço, serviço e peças — <strong>nunca valores em R$</strong>. O celular dele recebe uma notificação a cada aviso.</p>
    <div id="listaMotoristas"><p class="muted small">Carregando…</p></div>
  </div>`;
}
async function ligarMotoristas() {
  const mots = (await q(sb.from("perfis").select("*").eq("papel", "motorista").order("nome"))).filter((m) => !m.excluido_em);
  $("#listaMotoristas").innerHTML = mots.length ? `<ul class="lista-final">${mots.map((m) => `<li>
      <span><strong>${esc(m.nome)}</strong> ${m.ativo ? "" : selo("cancelado", "Desativado")}<br>
        <span class="small muted">usuário: ${esc(m.usuario)}${m.whatsapp ? ` · <a href="${linkWhats(m.whatsapp)}" target="_blank" rel="noopener">${esc(m.whatsapp)}</a>` : ""}</span> ${autorTag(m)}</span>
      <span style="display:flex;gap:.4rem;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn sec peq" type="button" data-motedit="${m.id}">Editar</button>
        <button class="btn sec peq" type="button" data-motlogin="${m.id}">Login</button>
        <button class="btn ${m.ativo ? "sec" : "ok"} peq" type="button" data-motat="${m.id}">${m.ativo ? "Desativar" : "Ativar"}</button>
        ${lixeira(`data-motex="${m.id}"`, `Excluir ${esc(m.nome)}`)}
      </span></li>`).join("")}</ul>` : `<p class="muted small">Nenhum motorista cadastrado.</p>`;
  const mot = (id) => mots.find((m) => m.id === id);
  $$("[data-motlogin]").forEach((b) => (b.onclick = () => modalLogin(mot(b.dataset.motlogin), ligarMotoristas)));
  $$("[data-motat]").forEach((b) => (b.onclick = async () => {
    const m = mot(b.dataset.motat);
    if (!(await confirmar(`${m.ativo ? "Desativar" : "Ativar"} o acesso de ${m.nome}?`, m.ativo ? "Desativar" : "Ativar"))) return;
    try { await adminUsuarios({ acao: m.ativo ? "desativar" : "ativar", id: m.id }); aviso("Pronto!"); ligarMotoristas(); } catch (e) { aviso(e.message, true); }
  }));
  $$("[data-motex]").forEach((b) => (b.onclick = async () => {
    const m = mot(b.dataset.motex);
    if (!(await confirmar(`Excluir o motorista ${m.nome}? Ele perde o acesso e para de receber os avisos.`, "Excluir"))) return;
    try {
      if (m.ativo) { try { await adminUsuarios({ acao: "desativar", id: m.id }); } catch { /* segue */ } }
      await q(sb.from("perfis").update({ excluido_em: agoraIso(), ativo: false }).eq("id", m.id));
      aviso("Motorista excluído."); ligarMotoristas();
    } catch (e) { aviso(e.message, true); }
  }));
  $$("[data-motedit]").forEach((b) => (b.onclick = () => {
    const m = mot(b.dataset.motedit);
    abrirModal({
      titulo: `Editar ${m.nome}`,
      conteudo: `<div class="linha"><div><label>Nome *</label><input name="nome" value="${esc(m.nome)}" required></div></div>
        <div class="linha"><div><label>Contato (WhatsApp)</label><input name="whatsapp" value="${esc(m.whatsapp)}" inputmode="tel"></div></div>
        <p class="muted small">Para mudar usuário ou senha, use o botão Login.</p>
        <button type="submit" class="btn bloco">Salvar</button>`,
      onSubmit: async (fd) => {
        if (!String(fd.get("nome") || "").trim()) throw new Error("Informe o nome.");
        await q(sb.from("perfis").update({ nome: fd.get("nome"), whatsapp: fd.get("whatsapp") || null }).eq("id", m.id));
        aviso("Salvo!"); ligarMotoristas();
      },
    });
  }));
  $("#novoMotorista").onclick = () => abrirModal({
    titulo: "Novo motorista",
    conteudo: `<div class="linha"><div><label>Nome do motorista *</label><input name="nome" required></div></div>
      <div class="linha"><div><label>Contato (WhatsApp)</label><input name="whatsapp" inputmode="tel" placeholder="(11) 99999-9999"></div></div>
      <div class="linha">
        <div><label>Usuário (login) *</label><input name="usuario" required autocapitalize="none" placeholder="ex.: joao"></div>
        <div><label>Senha inicial *</label><input name="senha" required minlength="6" placeholder="mín. 6 caracteres"></div>
      </div>
      <p class="muted small">Depois, peça para ele entrar em <strong>${esc(location.host)}</strong> pelo celular, instalar o app e tocar em <strong>Ativar notificações</strong>.</p>
      <button type="submit" class="btn bloco">Cadastrar motorista</button>`,
    onSubmit: async (fd) => {
      const nome = String(fd.get("nome") || "").trim(), usuario = String(fd.get("usuario") || "").trim().toLowerCase();
      if (!nome || !usuario || String(fd.get("senha") || "").length < 6) throw new Error("Preencha nome, usuário e uma senha com pelo menos 6 caracteres.");
      const novo = await adminUsuarios({ acao: "criar", nome, usuario, senha: fd.get("senha"), whatsapp: fd.get("whatsapp") || null });
      if (!novo?.id) throw new Error("Não foi possível criar o login.");
      await rpc("tornar_motorista", { p_id: novo.id });
      await carregarNomes();
      aviso(`Motorista cadastrado! Usuário: ${usuario}`);
      ligarMotoristas();
    },
  });
}

render();
