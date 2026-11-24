import {
  sb, exigirPapel, sair, modalTrocarSenha, adminUsuarios, rpc, q,
  moeda, inteiro, dataBR, dataHoraBR, inicioMes, nomeMes,
  selo, esc, $, $$, aviso, abrirModal, confirmar,
  isoLocal, periodo, periodoAnterior, periodoSeguinte, rotuloPeriodo, FREQUENCIAS,
} from "./comum.js";
import { NOME_FABRICA } from "../config.js";

const perfil = await exigirPapel("dono");
document.title = `${NOME_FABRICA} — Painel do Dono`;
$("#quem").textContent = perfil.nome;
$("#btnSair").onclick = sair;
$("#btnSenha").onclick = modalMinhaConta;
$("#btnSenha").title = "Minha conta (usuário e senha)";

function modalMinhaConta() {
  const m = abrirModal({
    titulo: "Minha conta",
    conteudo: `<p class="muted small" style="margin-top:0">Você entra com o usuário <strong>${esc(perfil.usuario)}</strong>.</p>
      <div class="acoes" style="flex-direction:column;align-items:stretch">
        <button type="button" class="btn" id="contaUsuario">✏️ Alterar meu usuário</button>
        <button type="button" class="btn sec" id="contaSenha">🔑 Trocar minha senha</button>
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
      onSubmit: async (fd) => {
        const novo = String(fd.get("usuario") || "").trim().toLowerCase();
        const r = await adminUsuarios({ acao: "alterar_usuario", id: perfil.id, usuario: novo });
        perfil.usuario = r?.usuario || novo;
        aviso(`Pronto! Da próxima vez, entre com o usuário: ${perfil.usuario}`);
      },
    });
  };
}

const main = $("#conteudo");
let abaAtual = "inicio";

const diaMes = (d) => dataBR(d).slice(0, 5);
const maiusc = (t) => String(t ?? "").toUpperCase();
const soma = (lista, campo) => lista.reduce((s, x) => s + Number(x[campo] || 0), 0);
const linkWhats = (n) => (n ? `https://wa.me/55${String(n).replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")}` : "");

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
    if (abaAtual === "minha") await renderMinha();
    if (abaAtual === "maos") await renderMaos();
    if (abaAtual === "servicos") await renderServicos();
    if (abaAtual === "fechamentos") await renderFechamentos();
    if (abaAtual === "admin") await renderAdmin();
  } catch (e) {
    main.innerHTML = `<div class="card vazio">Erro ao carregar: ${esc(e.message)}</div>`;
  }
}

async function carregarMaos(soAtivas = true) {
  let c = sb.from("perfis").select("*").eq("papel", "mao_de_obra").order("nome");
  if (soAtivas) c = c.eq("ativo", true);
  return q(c);
}
async function carregarCatalogo() {
  const [produtos, servicos] = await Promise.all([
    q(sb.from("produtos").select("*").order("nome")),
    q(sb.from("servicos").select("*").order("nome")),
  ]);
  return { produtos, servicos };
}

// ===============================================================
// INÍCIO — botões com os nomes das mãos de obra
// ===============================================================
async function renderInicio() {
  const [maos, abertos] = await Promise.all([
    carregarMaos(),
    q(sb.from("v_lotes").select("id, mao_de_obra_id, mao_de_obra_nome, produto_nome, servico_nome, quantidade, valor_aberto, qtd_falta, aviso_em, aviso_mensagem").eq("status", "aberto")),
  ]);
  const porMao = {};
  abertos.forEach((l) => {
    porMao[l.mao_de_obra_id] ??= { lotes: 0, valor: 0, avisos: 0 };
    porMao[l.mao_de_obra_id].lotes += 1;
    porMao[l.mao_de_obra_id].valor += Number(l.valor_aberto);
    if (l.aviso_em) porMao[l.mao_de_obra_id].avisos += 1;
  });
  const avisos = abertos.filter((l) => l.aviso_em).sort((a, b) => (a.aviso_em < b.aviso_em ? 1 : -1));

  main.innerHTML = `
    <div class="titulo-pagina">Mãos de obra</div>
    <div class="section-head"><div class="data-hoje">${dataBR(new Date())}</div>
      ${maos.length ? `<button class="btn acento" id="btnNovoLote">＋ Enviar lote</button>` : ""}</div>
    ${avisos.length ? `<div class="lista-avisos"><div class="card">
      <h3 style="margin:0 0 .4rem">✋ Avisaram que terminaram</h3>
      <ul class="lista-final">${avisos.map((l) => `<li><span><strong>${esc(l.mao_de_obra_nome)}</strong> – ${esc(l.produto_nome)}: ${esc(l.servico_nome)} – ${inteiro(l.qtd_falta)} pç
        <br><span class="small muted">${dataHoraBR(l.aviso_em)}${l.aviso_mensagem ? ` · “${esc(l.aviso_mensagem)}”` : ""}</span></span>
        <button class="btn peq" data-ficha="${l.mao_de_obra_id}">Abrir</button></li>`).join("")}</ul></div></div>` : ""}
    ${maos.length ? `<div class="grade-nomes">${maos.map((m) => {
      const a = porMao[m.id];
      return `<button class="btn-nome ${a ? "" : "inativo"}" data-ficha="${m.id}">${esc(maiusc(m.nome))}
        <small>${a ? `${a.lotes} lote${a.lotes > 1 ? "s" : ""} · ${moeda(a.valor)}` : "sem lote em aberto"}</small>
        ${a?.avisos ? `<span class="bandeira">✋ terminou ${a.avisos > 1 ? a.avisos + " lotes" : "1 lote"}</span>` : ""}</button>`;
    }).join("")}</div>`
      : `<div class="card vazio">Nenhuma mão de obra cadastrada ainda.<br>Comece pela aba <strong>Cadastros serviços</strong> e depois <strong>Cadastros mão de obra</strong>.</div>`}`;

  $$("[data-ficha]", main).forEach((b) => (b.onclick = () => abrirFicha(b.dataset.ficha)));
  $("#btnNovoLote")?.addEventListener("click", () => modalNovoLote());
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
            ${l.observacoes ? `<br>Obs.: ${esc(l.observacoes)}` : ""}</div>
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
        <li><span>${diaMes(e.entregue_em)} – ${esc(e.produto_nome)}: ${esc(e.servico_nome)} – ${inteiro(e.quantidade)} pç ${selo(e.tipo === "pronto" ? "pronto" : "parcial", e.tipo === "pronto" ? "Lote pronto" : "Parcial")}</span>
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
  const [maos, { produtos, servicos }] = await Promise.all([carregarMaos(), carregarCatalogo()]);
  const prodAtivos = produtos.filter((p) => p.ativo && servicos.some((s) => s.produto_id === p.id && s.ativo));
  if (!maos.length) return aviso("Cadastre uma mão de obra primeiro.", true);
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
    q(sb.from("v_entregas").select("valor").eq("mes_ref", mes)),
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
    <div class="titulo-pagina">Minha mão de obra</div>
    <div class="section-head"><span class="muted small">Tudo o que o Bruno recebe das empresas para distribuir às mãos de obra.</span>
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
            lucro <strong>${moeda((e.valor_unitario - e.valor_mao_de_obra) * e.quantidade)}</strong>${e.observacoes ? `<br>Obs.: ${esc(e.observacoes)}` : ""}</div>
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
      ${empresas.length ? `<ul class="lista-final">${empresas.map((e) => `<li class="${e.ativo ? "" : "muted"}">
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
            <button type="submit" class="btn bloco">Salvar</button>`,
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
async function renderMaos() {
  const maos = await carregarMaos(false);
  main.innerHTML = `
    <div class="titulo-pagina">Cadastros mão de obra</div>
    <div class="section-head"><span class="muted small">Cada mão de obra entra no painel dela com usuário e senha.</span>
      <button class="btn" id="novoMo">＋ Nova mão de obra</button></div>
    ${maos.length ? `<div class="card tabela-wrap"><table>
      <thead><tr><th>Nome</th><th>Usuário</th><th>WhatsApp</th><th>Endereço</th><th>Chave PIX</th><th>Pagamento</th><th>Situação</th><th></th></tr></thead>
      <tbody>${maos.map((m) => `<tr>
        <td><strong>${esc(m.nome)}</strong></td><td>${esc(m.usuario)}</td>
        <td>${m.whatsapp ? `<a href="${linkWhats(m.whatsapp)}" target="_blank" rel="noopener">${esc(m.whatsapp)}</a>` : "—"}</td>
        <td class="small">${esc(m.endereco || "—")}</td><td class="small">${esc(m.pix || "—")}</td>
        <td class="small">${FREQUENCIAS[m.frequencia_pagamento] || "Mensal"}</td>
        <td>${m.ativo ? selo("pronto", "Ativo") : selo("cancelado", "Inativo")}</td>
        <td class="right" style="white-space:nowrap">
          <button class="btn sec peq" data-ed="${m.id}">Editar</button>
          <button class="btn sec peq" data-senha="${m.id}">Login</button>
          <button class="btn ${m.ativo ? "perigo" : "ok"} peq" data-at="${m.id}">${m.ativo ? "Desativar" : "Ativar"}</button>
        </td></tr>`).join("")}</tbody></table></div>` : `<div class="card vazio">Nenhuma mão de obra cadastrada.</div>`}`;

  const campos = (m = {}) => `
    <div class="linha"><div><label>Nome *</label><input name="nome" value="${esc(m.nome)}" required></div></div>
    <div class="linha">
      <div><label>WhatsApp</label><input name="whatsapp" value="${esc(m.whatsapp)}" inputmode="tel" placeholder="(11) 99999-9999"></div>
      <div><label>Chave PIX</label><input name="pix" value="${esc(m.pix)}" placeholder="CPF, telefone, e-mail ou aleatória"></div>
    </div>
    <div class="linha">
      <div><label>Endereço</label><input name="endereco" value="${esc(m.endereco)}"></div>
      <div><label>Forma de pagamento</label><select name="frequencia_pagamento">${Object.entries(FREQUENCIAS).map(([k, t]) =>
        `<option value="${k}" ${(m.frequencia_pagamento || "mensal") === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
    </div>`;

  $("#novoMo").onclick = () => abrirModal({
    titulo: "Nova mão de obra",
    conteudo: `${campos()}
      <div class="linha">
        <div><label>Usuário (login) *</label><input name="usuario" required autocapitalize="none" placeholder="ex.: adriana"></div>
        <div><label>Senha inicial *</label><input name="senha" required minlength="6" placeholder="mín. 6 caracteres"></div>
      </div>
      <button type="submit" class="btn bloco">Criar acesso</button>`,
    onSubmit: async (fd) => {
      const novo = await adminUsuarios({ acao: "criar", ...Object.fromEntries(fd) });
      if (novo?.id && fd.get("frequencia_pagamento")) {
        await q(sb.from("perfis").update({ frequencia_pagamento: fd.get("frequencia_pagamento") }).eq("id", novo.id));
      }
      aviso(`Acesso criado! Usuário: ${String(fd.get("usuario")).trim().toLowerCase()}`);
      renderMaos();
    },
  });

  $$("[data-ed]", main).forEach((b) => (b.onclick = () => {
    const m = maos.find((x) => x.id === b.dataset.ed);
    abrirModal({
      titulo: `Editar ${m.nome}`,
      conteudo: `${campos(m)}<p class="muted small">Usuário: <strong>${esc(m.usuario)}</strong> (não pode ser alterado)</p>
        <button type="submit" class="btn bloco">Salvar</button>`,
      onSubmit: async (fd) => {
        if (!fd.get("nome")) throw new Error("Informe o nome.");
        await q(sb.from("perfis").update({
          nome: fd.get("nome"), whatsapp: fd.get("whatsapp") || null, pix: fd.get("pix") || null, endereco: fd.get("endereco") || null,
          frequencia_pagamento: fd.get("frequencia_pagamento") || "mensal",
        }).eq("id", m.id));
        aviso("Salvo!"); renderMaos();
      },
    });
  }));

  $$("[data-senha]", main).forEach((b) => (b.onclick = () => {
    const m = maos.find((x) => x.id === b.dataset.senha);
    abrirModal({
      titulo: `Login de ${m.nome}`,
      conteudo: `<div class="linha">
          <div><label>Usuário</label><input name="usuario" value="${esc(m.usuario)}" required autocapitalize="none"></div>
          <div><label>Nova senha (deixe em branco para manter)</label><input name="senha" minlength="6" placeholder="mín. 6 caracteres"></div>
        </div>
        <p class="muted small">Depois de salvar, passe o novo usuário e/ou a nova senha para ${esc(m.nome)}. Ela pode trocar a senha depois no painel dela.</p>
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
        renderMaos();
      },
    });
  }));

  $$("[data-at]", main).forEach((b) => (b.onclick = async () => {
    const m = maos.find((x) => x.id === b.dataset.at);
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
    <div class="titulo-pagina">Cadastros serviços</div>
    <div class="section-head"><span class="muted small">Cada serviço tem dois valores por peça: o que a <strong>empresa paga</strong> ao Bruno e o que ele <strong>paga à mão de obra</strong>.</span>
      <button class="btn" id="novoProduto">＋ Novo produto</button></div>
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
      <button type="submit" class="btn bloco">Salvar</button>`,
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
        <button type="submit" class="btn bloco">Salvar</button>`,
      aoAbrir: (f) => {
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
  const [entregas, abertos, maos, pags] = await Promise.all([
    q(sb.from("v_entregas").select("*").gte("dia", p.inicio).lte("dia", p.fim).order("produto_nome").order("servico_nome")),
    q(sb.from("v_lotes").select("mao_de_obra_id, valor_aberto").eq("status", "aberto")),
    carregarMaos(false),
    q(sb.from("pagamentos").select("*").lte("inicio", p.fim).gte("fim", p.inicio).order("pago_em")),
  ]);
  const por = {};
  const g = (id) => (por[id] ??= { total: 0, pago: 0, qtd: 0, aberto: 0, entregas: [] });
  entregas.forEach((e) => { const x = g(e.mao_de_obra_id); x.total += Number(e.valor); x.qtd += e.quantidade; if (e.pago) x.pago += Number(e.valor); x.entregas.push(e); });
  abertos.forEach((l) => { g(l.mao_de_obra_id).aberto += Number(l.valor_aberto); });
  const lista = maos.filter((m) => m.ativo || por[m.id]?.total);
  const tot = Object.values(por).reduce((a, x) => ({ total: a.total + x.total, pago: a.pago + x.pago, aberto: a.aberto + x.aberto }), { total: 0, pago: 0, aberto: 0 });

  main.innerHTML = `
    <div class="titulo-pagina">Fechamentos</div>
    <div class="barra-periodo">
      <div class="seg">${Object.entries(FREQUENCIAS).map(([k, t]) => `<button class="${k === tipoFech ? "ativo" : ""}" data-tipo="${k}">${t}</button>`).join("")}</div>
      <div class="nav-periodo">
        <button class="btn sec peq" id="perAnt" title="Período anterior">◀</button>
        <strong>${esc(p.rotulo)}</strong>
        <button class="btn sec peq" id="perSeg" title="Próximo período">▶</button>
        <button class="btn sec peq" id="perHoje">Hoje</button>
      </div>
    </div>
    <div class="totais">
      <div class="total escuro"><div class="r">Total a receber</div><div class="v">${moeda(tot.aberto + tot.total - tot.pago)}</div></div>
      <div class="total amarelo"><div class="r">Em aberto com as mãos de obra</div><div class="v">${moeda(tot.aberto)}</div></div>
      <div class="total"><div class="r">Finalizado no período</div><div class="v">${moeda(tot.total)}</div></div>
      <div class="total"><div class="r">Já pago</div><div class="v">${moeda(tot.pago)}</div></div>
    </div>
    ${lista.length ? `<div class="grade-fech">${lista.map((m) => {
      const x = por[m.id] || { total: 0, pago: 0, aberto: 0 };
      const falta = x.total - x.pago;
      const receber = x.aberto + falta;
      return `<button class="cartao-fech ${receber ? "" : "zerado"}" data-det="${m.id}">
        <span class="nome">${esc(maiusc(m.nome))}<small>${FREQUENCIAS[m.frequencia_pagamento] || "Mensal"}</small></span>
        <span class="valor">R$ <b>${moeda(receber).replace("R$", "").trim()}</b></span>
        ${x.total && !falta && !x.aberto ? `<span class="tag-pago">PAGO</span>` : ""}
      </button>`;
    }).join("")}</div>` : `<div class="card vazio">Nenhuma mão de obra cadastrada.</div>`}
    <p class="muted small" style="text-align:center">Valor em verde = lotes em aberto + o que ela já finalizou no período e ainda não foi pago. Clique no nome para ver o detalhe.</p>`;

  $$("[data-tipo]", main).forEach((b) => (b.onclick = () => { tipoFech = b.dataset.tipo; renderFechamentos(); }));
  $("#perAnt").onclick = () => { refFech = periodoAnterior(p).inicio; renderFechamentos(); };
  $("#perSeg").onclick = () => { refFech = periodoSeguinte(p).inicio; renderFechamentos(); };
  $("#perHoje").onclick = () => { refFech = isoLocal(); renderFechamentos(); };
  $$("[data-det]", main).forEach((b) => (b.onclick = () => {
    const mo = maos.find((x) => x.id === b.dataset.det);
    detalheFechamento(mo, por[mo.id] || { total: 0, pago: 0, qtd: 0, aberto: 0, entregas: [] }, pags.filter((x) => x.mao_de_obra_id === mo.id), p);
  }));
}

// Agrupa entregas por produto + serviço + preço
function agruparEntregas(entregas) {
  const m = {};
  entregas.forEach((e) => {
    const k = `${e.produto_nome}|${e.servico_nome}|${e.valor_unitario}`;
    m[k] ??= { produto_nome: e.produto_nome, servico_nome: e.servico_nome, valor_unitario: e.valor_unitario, quantidade: 0, valor: 0, pago: 0 };
    m[k].quantidade += e.quantidade; m[k].valor += Number(e.valor); if (e.pago) m[k].pago += Number(e.valor);
  });
  return Object.values(m).sort((a, b) => (a.produto_nome + a.servico_nome).localeCompare(b.produto_nome + b.servico_nome));
}

function detalheFechamento(mo, x, pags, p) {
  const linhas = agruparEntregas(x.entregas);
  const falta = x.total - x.pago;
  const r = { mao_de_obra_nome: mo.nome, quantidade: x.qtd, valor_total: x.total };
  const m = abrirModal({
    titulo: `${maiusc(mo.nome)} — ${p.rotulo}`,
    largo: true,
    conteudo: `
      <div class="ficha-topo"><div class="ficha-contato">${mo.pix ? `PIX: <strong>${esc(mo.pix)}</strong> · ` : ""}Pagamento ${(FREQUENCIAS[mo.frequencia_pagamento] || "Mensal").toLowerCase()}</div>
        <span>${x.total ? (falta ? selo("aberto", `Falta pagar ${moeda(falta)}`) : selo("pago", "Tudo pago")) : ""}</span></div>
      ${x.aberto ? `<p class="small" style="margin:.4rem 0 0">Em aberto com ela agora (ainda não finalizado): <strong>${moeda(x.aberto)}</strong></p>` : ""}
      ${linhas.length ? `<div class="tabela-wrap" style="margin-top:.6rem"><table>
        <thead><tr><th>Produto</th><th>Serviço</th><th class="right">Quantidade</th><th class="right">R$/peça</th><th class="right">Valor</th><th>Situação</th></tr></thead>
        <tbody>${linhas.map((i) => `<tr><td>${esc(i.produto_nome)}</td><td>${esc(i.servico_nome)}</td><td class="right num">${inteiro(i.quantidade)}</td>
          <td class="right num">${moeda(i.valor_unitario)}</td><td class="right num">${moeda(i.valor)}</td>
          <td>${i.pago >= i.valor ? selo("pago", "Pago") : i.pago ? selo("aberto", "Parte paga") : selo("aberto", "A pagar")}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="2">Total</td><td class="right num">${inteiro(x.qtd)}</td><td></td><td class="right num">${moeda(x.total)}</td><td></td></tr></tfoot>
      </table></div>` : `<p class="muted">Nada finalizado neste período.</p>`}
      ${pags.length ? `<h3 style="margin-top:1rem">Pagamentos registrados</h3><ul class="lista-final">${pags.map((pg) => `<li>
        <span>${dataBR(pg.pago_em)} – ${esc(rotuloPeriodo(pg.tipo, pg.inicio))}<br><span class="small muted">${inteiro(pg.quantidade)} peças</span></span>
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
    if (!(await confirmar(`Marcar ${moeda(falta)} de ${mo.nome} (${p.rotulo}) como pago? Essas entregas ficam travadas.`, "Marcar como pago"))) return;
    try { await rpc("pagar_periodo", { p_mao_de_obra: mo.id, p_inicio: p.inicio, p_fim: p.fim, p_tipo: p.tipo }); aviso("Pagamento registrado!"); m.fechar(); renderFechamentos(); }
    catch (e) { aviso(e.message, true); }
  });
  $$("[data-desfpag]", f).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Desfazer este pagamento? As entregas voltam para 'a pagar'.", "Desfazer"))) return;
    try { await rpc("desfazer_pagamento", { p_pagamento: Number(b.dataset.desfpag) }); aviso("Pagamento desfeito."); m.fechar(); renderFechamentos(); }
    catch (e) { aviso(e.message, true); }
  }));
  $("#fRecibo", f)?.addEventListener("click", () => imprimirRecibo(r, linhas, mo, p.rotulo));
  $("#fNota", f)?.addEventListener("click", () => {
    m.fechar(); abaAtual = "admin";
    $$("#abas button").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === "admin"));
    renderAdmin({ moId: mo.id, tipo: p.tipo, ref: p.inicio });
  });
}

function imprimirRecibo(r, linhas, mo, rotulo) {
  const w = window.open("", "_blank");
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo ${esc(r.mao_de_obra_nome)} ${esc(rotulo)}</title>
    <link rel="stylesheet" href="${new URL("css/style.css", location.href)}"></head><body style="background:#fff;padding:1.5rem">
    <h1>${esc(NOME_FABRICA)} — Recibo de serviços</h1>
    <p><strong>Mão de obra:</strong> ${esc(r.mao_de_obra_nome)}${mo.pix ? `<br><strong>PIX:</strong> ${esc(mo.pix)}` : ""}<br><strong>Período:</strong> ${esc(rotulo)}</p>
    <table><thead><tr><th>Produto</th><th>Serviço</th><th class="right">Quantidade</th><th class="right">R$/peça</th><th class="right">Valor</th></tr></thead>
    <tbody>${linhas.map((i) => `<tr><td>${esc(i.produto_nome)}</td><td>${esc(i.servico_nome)}</td><td class="right">${inteiro(i.quantidade)}</td><td class="right">${moeda(i.valor_unitario)}</td><td class="right">${moeda(i.valor)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="2">Total</td><td class="right">${inteiro(r.quantidade)}</td><td></td><td class="right">${moeda(r.valor_total)}</td></tr></tfoot></table>
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

  main.innerHTML = `
    <div class="titulo-pagina">Administrativo</div>
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
              <span class="small muted">${inteiro(n.quantidade)} peças · ${moeda(n.valor_total)}</span></span>
            ${n.lida_em ? selo("pronto", "Lida") : selo("aberto", "Não lida")}</li>`).join("")}</ul>`
            : `<p class="muted small">Nenhuma nota enviada ainda.</p>`}
        </div>
      </div>
    </div>`;

  ligarCalculadora();
  ligarPagamentos(maos, pre);
  ligarRelatorio();

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

// Monta a prévia da nota e envia
function ligarPagamentos(maos, pre = {}) {
  const selMo = $("#pagMo"), selTipo = $("#pagTipo"), area = $("#pagPrevia");
  let per = periodo(selTipo.value, pre.ref || isoLocal());
  const textoWhats = (mo, linhas, total, qtd, msg) =>
    `Olá, ${mo.nome.split(" ")[0]}! Segue o fechamento — ${per.rotulo} — ${NOME_FABRICA}:\n\n` +
    linhas.map((i) => `• ${i.produto_nome} – ${i.servico_nome}: ${inteiro(i.quantidade)} pç × ${moeda(i.valor_unitario)} = ${moeda(i.valor)}`).join("\n") +
    `\n\nTotal: ${inteiro(qtd)} peças — *${moeda(total)}*` + (msg ? `\n\n${msg}` : "") +
    `\n\nVocê também pode ver esta nota no seu painel.`;

  const carregar = async () => {
    $("#pagRotulo").textContent = per.rotulo;
    const mo = maos.find((m) => m.id === selMo.value);
    if (!mo) { area.innerHTML = ""; return; }
    area.innerHTML = `<p class="muted small">Carregando…</p>`;
    let entregas;
    try { entregas = await q(sb.from("v_entregas").select("*").eq("mao_de_obra_id", mo.id).gte("dia", per.inicio).lte("dia", per.fim)); }
    catch (e) { area.innerHTML = `<p class="small" style="color:var(--bad)">${esc(e.message)}</p>`; return; }
    const linhas = agruparEntregas(entregas);
    if (!linhas.length) { area.innerHTML = `<div class="alerta">${esc(mo.nome)} não tem nada finalizado em: ${esc(per.rotulo)}.</div>`; return; }
    const total = soma(linhas, "valor"), qtd = soma(linhas, "quantidade"), pago = soma(linhas, "pago");
    area.innerHTML = `
      <div class="nota-previa">
        <div class="nota-topo"><strong>${esc(NOME_FABRICA)}</strong><span>Fechamento — ${esc(per.rotulo)}</span></div>
        <div class="small" style="margin-bottom:.4rem">Para: <strong>${esc(mo.nome)}</strong>${mo.pix ? ` · PIX: ${esc(mo.pix)}` : ""}</div>
        <table><thead><tr><th>Produto · serviço</th><th class="right">Qtd</th><th class="right">R$/peça</th><th class="right">Valor</th></tr></thead>
          <tbody>${linhas.map((i) => `<tr><td>${esc(i.produto_nome)} · ${esc(i.servico_nome)}</td><td class="right num">${inteiro(i.quantidade)}</td><td class="right num">${moeda(i.valor_unitario)}</td><td class="right num">${moeda(i.valor)}</td></tr>`).join("")}</tbody>
          <tfoot><tr><td>Total</td><td class="right num">${inteiro(qtd)}</td><td></td><td class="right num">${moeda(total)}</td></tr></tfoot></table>
        ${pago ? `<p class="small muted" style="margin:.4rem 0 0">Já pago neste período: ${moeda(pago)} · falta: ${moeda(total - pago)}</p>` : ""}
      </div>
      <div class="linha" style="margin-top:.7rem"><div><label>Mensagem (opcional)</label><input id="pagMsg" placeholder="Ex.: O PIX cai até sexta-feira."></div></div>
      <label class="check-whats ${mo.whatsapp ? "" : "desab"}"><input type="checkbox" id="pagWhats" ${mo.whatsapp ? "" : "disabled"}>
        Também enviar pelo WhatsApp ${mo.whatsapp ? `(${esc(mo.whatsapp)})` : "— cadastre o WhatsApp dela para usar"}</label>
      <button class="btn acento bloco" id="pagEnviar">📩 Enviar nota para ${esc(mo.nome.split(" ")[0])}</button>`;

    $("#pagEnviar").onclick = async (ev) => {
      const btn = ev.currentTarget, whats = $("#pagWhats").checked, msg = $("#pagMsg").value.trim();
      const janela = whats ? window.open("about:blank", "_blank") : null; // abre já, para o navegador não bloquear
      btn.disabled = true;
      try {
        await rpc("enviar_nota", { p_mao_de_obra: mo.id, p_inicio: per.inicio, p_fim: per.fim, p_tipo: per.tipo, p_mensagem: msg || null });
        if (janela) janela.location.href = `${linkWhats(mo.whatsapp)}?text=${encodeURIComponent(textoWhats(mo, linhas, total, qtd, msg))}`;
        aviso(whats ? "Nota enviada! Confira o WhatsApp que abriu." : "Nota enviada para o painel dela!");
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
        q(sb.from("v_entregas").select("*").eq("mes_ref", mes).order("mao_de_obra_nome")),
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
        finalizadas: <strong>${inteiro(soma(entregas, "quantidade"))}</strong> · já pago às mãos de obra: <strong>${moeda(pago)}</strong> (falta ${moeda(custo - pago)})</p>

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
      ${entregas.length ? tabela(`<th>Mão de obra</th><th>Produto · serviço</th><th class="right">Peças</th><th class="right">R$/peça</th><th class="right">Valor</th><th>Situação</th>`,
        Object.entries(porMao).map(([nome, lst]) => {
          const g = agruparEntregas(lst);
          return g.map((i, n) => `<tr><td>${n ? "" : `<strong>${esc(nome)}</strong>`}</td><td>${esc(i.produto_nome)} · ${esc(i.servico_nome)}</td><td class="right num">${inteiro(i.quantidade)}</td><td class="right num">${moeda(i.valor_unitario)}</td><td class="right num">${moeda(i.valor)}</td>
              <td>${i.pago >= i.valor ? "Pago" : i.pago ? "Parte paga" : "A pagar"}</td></tr>`).join("") +
            `<tr class="subtotal"><td></td><td>Subtotal ${esc(nome)}</td><td class="right num">${inteiro(soma(lst, "quantidade"))}</td><td></td><td class="right num">${moeda(soma(lst, "valor"))}</td><td></td></tr>`;
        }).join(""),
        `<tfoot><tr><td colspan="2">Total repassado</td><td class="right num">${inteiro(soma(entregas, "quantidade"))}</td><td></td><td class="right num">${moeda(custo)}</td><td></td></tr></tfoot>`)
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
    const [lotes, entregas, entradas] = await Promise.all([
      q(sb.from("v_lotes").select("*").order("id")),
      q(sb.from("v_entregas").select("*").order("id")),
      q(sb.from("v_entradas").select("*").order("id")),
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
    aviso("Cópia baixada (3 arquivos).");
  } catch (e) { aviso(e.message, true); }
}

// ---------------------------------------------------------------
render();
