import {
  sb, exigirPapel, sair, modalTrocarSenha, adminUsuarios, rpc, q,
  moeda, inteiro, dataBR, dataHoraBR, inicioMes, nomeMes,
  selo, esc, $, $$, aviso, abrirModal, confirmar,
} from "./comum.js";
import { NOME_FABRICA } from "../config.js";

const perfil = await exigirPapel("dono");
document.title = `${NOME_FABRICA} — Painel do Dono`;
$("#quem").textContent = perfil.nome;
$("#btnSair").onclick = sair;
$("#btnSenha").onclick = () => modalTrocarSenha(perfil.usuario);

const main = $("#conteudo");
let abaAtual = "inicio";
let mesFechamento = inicioMes().slice(0, 7);

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
    q(sb.from("v_lotes").select("mao_de_obra_id, valor_aberto, qtd_falta").eq("status", "aberto")),
  ]);
  const porMao = {};
  abertos.forEach((l) => {
    porMao[l.mao_de_obra_id] ??= { lotes: 0, valor: 0 };
    porMao[l.mao_de_obra_id].lotes += 1;
    porMao[l.mao_de_obra_id].valor += Number(l.valor_aberto);
  });

  main.innerHTML = `
    <div class="titulo-pagina">Mãos de obra</div>
    <div class="section-head"><div class="data-hoje">${dataBR(new Date())}</div>
      ${maos.length ? `<button class="btn acento" id="btnNovoLote">＋ Enviar lote</button>` : ""}</div>
    ${maos.length ? `<div class="grade-nomes">${maos.map((m) => {
      const a = porMao[m.id];
      return `<button class="btn-nome ${a ? "" : "inativo"}" data-ficha="${m.id}">${esc(maiusc(m.nome))}
        <small>${a ? `${a.lotes} lote${a.lotes > 1 ? "s" : ""} · ${moeda(a.valor)}` : "sem lote em aberto"}</small></button>`;
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
  const [[mo], abertos, entregasMes, [fech]] = await Promise.all([
    q(sb.from("perfis").select("*").eq("id", moId)),
    q(sb.from("v_lotes").select("*").eq("mao_de_obra_id", moId).eq("status", "aberto").order("enviado_em")),
    q(sb.from("v_entregas").select("*").eq("mao_de_obra_id", moId).eq("mes_ref", mes).order("entregue_em", { ascending: false })),
    q(sb.from("fechamentos").select("*").eq("mao_de_obra_id", moId).eq("mes", mes)),
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
          <div class="acoes">
            <button type="button" class="btn sec peq" data-parcial="${l.id}">Entrega parcial</button>
            <button type="button" class="btn pronto peq" data-pronto="${l.id}">✓ Lote pronto</button>
            ${l.qtd_entregue === 0 ? `<button type="button" class="btn perigo peq" data-cancelar="${l.id}">Cancelar</button>` : ""}
          </div>
        </div>`).join("") : `<p class="muted">Nenhum lote em aberto.</p>`}

      <h3 style="margin-top:1.2rem">Finalizado em ${nomeMes(mes).toLowerCase()} ${fech ? selo("pago", "Pago em " + dataBR(fech.pago_em)) : ""}</h3>
      ${entregasMes.length ? `<ul class="lista-final">${entregasMes.map((e) => `
        <li><span>${diaMes(e.entregue_em)} – ${esc(e.produto_nome)}: ${esc(e.servico_nome)} – ${inteiro(e.quantidade)} pç ${selo(e.tipo === "pronto" ? "pronto" : "parcial", e.tipo === "pronto" ? "Lote pronto" : "Parcial")}</span>
          <span style="white-space:nowrap"><strong class="num">${moeda(e.valor)}</strong>
          ${fech ? "" : `<button type="button" class="icon-btn" style="color:var(--muted);font-size:1rem" data-desfazer="${e.id}" title="Desfazer">↺</button>`}</span></li>`).join("")}</ul>`
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

  abrirModal({
    titulo: "Enviar lote",
    conteudo: `
      <div class="linha"><div><label>Mão de obra *</label><select name="mo" required>
        <option value="">Selecione…</option>${maos.map((x) => `<option value="${x.id}" ${x.id === moId ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></div></div>
      <div class="linha">
        <div><label>Produto *</label><select name="produto" required><option value="">Selecione…</option>${prodAtivos.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select></div>
        <div><label>Serviço *</label><select name="servico" required disabled><option value="">Escolha o produto</option></select></div>
      </div>
      <div class="linha">
        <div><label>Quantidade de peças *</label><input name="quantidade" type="number" min="1" step="1" required inputmode="numeric"></div>
        <div><label>Valor por peça (R$)</label><input name="valor" type="number" min="0" step="0.01"></div>
      </div>
      <div class="lote-total" style="margin:0 0 .8rem"><span>Total do lote</span><span id="prevTotal">R$ 0,00</span></div>
      <div class="linha"><div><label>Observação (opcional)</label><input name="obs" placeholder="Cor, tamanho, detalhe…"></div></div>
      <button type="submit" class="btn bloco acento">Enviar lote</button>`,
    aoAbrir: (f) => {
      const total = () => ($("#prevTotal", f).textContent = moeda(Number(f.quantidade.value || 0) * Number(f.valor.value || 0)));
      f.produto.onchange = () => {
        const lista = servicos.filter((s) => s.produto_id == f.produto.value && s.ativo);
        f.servico.innerHTML = `<option value="">Selecione…</option>` + lista.map((s) => `<option value="${s.id}" data-valor="${s.valor_unitario}">${esc(s.nome)} — ${moeda(s.valor_unitario)}</option>`).join("");
        f.servico.disabled = !lista.length; f.valor.value = ""; total();
      };
      f.servico.onchange = () => { f.valor.value = f.servico.selectedOptions[0]?.dataset.valor ?? ""; total(); };
      f.quantidade.oninput = f.valor.oninput = total;
    },
    onSubmit: async (fd) => {
      if (!fd.get("mo") || !fd.get("servico")) throw new Error("Escolha a mão de obra, o produto e o serviço.");
      const qtd = parseInt(fd.get("quantidade"), 10);
      if (!(qtd > 0)) throw new Error("Informe a quantidade de peças.");
      await rpc("enviar_lote", {
        p_mao_de_obra: fd.get("mo"), p_servico: Number(fd.get("servico")), p_quantidade: qtd,
        p_observacoes: fd.get("obs") || null, p_valor_unitario: fd.get("valor") === "" ? null : Number(fd.get("valor")),
      });
      aviso("Lote enviado!");
      if (abaAtual === "inicio") renderInicio();
      if (moId) abrirFicha(fd.get("mo"));
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
      <thead><tr><th>Nome</th><th>Usuário</th><th>WhatsApp</th><th>Endereço</th><th>Chave PIX</th><th>Situação</th><th></th></tr></thead>
      <tbody>${maos.map((m) => `<tr>
        <td><strong>${esc(m.nome)}</strong></td><td>${esc(m.usuario)}</td>
        <td>${m.whatsapp ? `<a href="${linkWhats(m.whatsapp)}" target="_blank" rel="noopener">${esc(m.whatsapp)}</a>` : "—"}</td>
        <td class="small">${esc(m.endereco || "—")}</td><td class="small">${esc(m.pix || "—")}</td>
        <td>${m.ativo ? selo("pronto", "Ativo") : selo("cancelado", "Inativo")}</td>
        <td class="right" style="white-space:nowrap">
          <button class="btn sec peq" data-ed="${m.id}">Editar</button>
          <button class="btn sec peq" data-senha="${m.id}">Senha</button>
          <button class="btn ${m.ativo ? "perigo" : "ok"} peq" data-at="${m.id}">${m.ativo ? "Desativar" : "Ativar"}</button>
        </td></tr>`).join("")}</tbody></table></div>` : `<div class="card vazio">Nenhuma mão de obra cadastrada.</div>`}`;

  const campos = (m = {}) => `
    <div class="linha"><div><label>Nome *</label><input name="nome" value="${esc(m.nome)}" required></div></div>
    <div class="linha">
      <div><label>WhatsApp</label><input name="whatsapp" value="${esc(m.whatsapp)}" inputmode="tel" placeholder="(11) 99999-9999"></div>
      <div><label>Chave PIX</label><input name="pix" value="${esc(m.pix)}" placeholder="CPF, telefone, e-mail ou aleatória"></div>
    </div>
    <div class="linha"><div><label>Endereço</label><input name="endereco" value="${esc(m.endereco)}"></div></div>`;

  $("#novoMo").onclick = () => abrirModal({
    titulo: "Nova mão de obra",
    conteudo: `${campos()}
      <div class="linha">
        <div><label>Usuário (login) *</label><input name="usuario" required autocapitalize="none" placeholder="ex.: adriana"></div>
        <div><label>Senha inicial *</label><input name="senha" required minlength="6" placeholder="mín. 6 caracteres"></div>
      </div>
      <button type="submit" class="btn bloco">Criar acesso</button>`,
    onSubmit: async (fd) => {
      await adminUsuarios({ acao: "criar", ...Object.fromEntries(fd) });
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
        }).eq("id", m.id));
        aviso("Salvo!"); renderMaos();
      },
    });
  }));

  $$("[data-senha]", main).forEach((b) => (b.onclick = () => {
    const m = maos.find((x) => x.id === b.dataset.senha);
    abrirModal({
      titulo: `Nova senha para ${m.nome}`,
      conteudo: `<div class="linha"><div><label>Nova senha (mín. 6)</label><input name="senha" required minlength="6"></div></div>
        <p class="muted small">Passe a nova senha para ${esc(m.nome)}. Ela poderá trocar depois no painel dela.</p>
        <button type="submit" class="btn bloco">Redefinir senha</button>`,
      onSubmit: async (fd) => { await adminUsuarios({ acao: "redefinir_senha", id: m.id, senha: fd.get("senha") }); aviso("Senha redefinida!"); },
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
  main.innerHTML = `
    <div class="titulo-pagina">Cadastros serviços</div>
    <div class="section-head"><span class="muted small">Cada produto tem seus serviços, e cada serviço tem o valor pago por peça.</span>
      <button class="btn" id="novoProduto">＋ Novo produto</button></div>
    ${produtos.length ? `<div class="grid cards">${produtos.map((p) => {
      const lista = servicos.filter((s) => s.produto_id === p.id);
      return `<div class="card produto-card ${p.ativo ? "" : "inativo"}">
        <div class="section-head" style="margin-bottom:.3rem">
          <h2 style="margin:0">${esc(maiusc(p.nome))}</h2>
          <span><button class="btn sec peq" data-edprod="${p.id}">Editar</button></span>
        </div>
        ${!p.ativo ? `<p class="small muted">Produto inativo (não aparece ao enviar lote)</p>` : ""}
        ${lista.length ? lista.map((s) => `<div class="servico-linha ${s.ativo ? "" : "inativo"}">
            <span>${esc(s.nome)}${s.ativo ? "" : " <span class='small'>(inativo)</span>"}</span>
            <strong class="right num">${moeda(s.valor_unitario)}</strong>
            <button class="btn sec peq" data-edserv="${s.id}">Editar</button></div>`).join("")
          : `<p class="muted small">Nenhum serviço ainda.</p>`}
        <form class="novo-servico" data-addserv="${p.id}">
          <input name="nome" placeholder="Novo serviço (ex.: Bainha)" required>
          <input name="valor" type="number" step="0.01" min="0" placeholder="R$ por peça" required>
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
    if (!nome || f.valor.value === "" || valor < 0) return aviso("Informe o nome e o valor do serviço.", true);
    try { await q(sb.from("servicos").insert({ produto_id: Number(f.dataset.addserv), nome, valor_unitario: valor })); aviso("Serviço adicionado!"); renderServicos(); }
    catch (err) { aviso(err.message, true); }
  }));

  $$("[data-edserv]", main).forEach((b) => (b.onclick = () => {
    const s = servicos.find((x) => x.id == b.dataset.edserv);
    abrirModal({
      titulo: `Editar serviço — ${nomeDe(produtos, s.produto_id)}`,
      conteudo: `<div class="linha">
          <div><label>Serviço *</label><input name="nome" value="${esc(s.nome)}" required></div>
          <div><label>R$ por peça *</label><input name="valor" type="number" step="0.01" min="0" value="${s.valor_unitario}" required></div></div>
        <label style="display:flex;gap:.5rem;align-items:center;margin-bottom:.4rem"><input type="checkbox" name="ativo" style="width:auto" ${s.ativo ? "checked" : ""}> Ativo</label>
        <p class="muted small">Mudar o valor não altera lotes já enviados.</p>
        <button type="submit" class="btn bloco">Salvar</button>`,
      onSubmit: async (fd) => {
        if (!fd.get("nome") || fd.get("valor") === "") throw new Error("Informe nome e valor.");
        await q(sb.from("servicos").update({ nome: fd.get("nome"), valor_unitario: Number(fd.get("valor")), ativo: fd.get("ativo") === "on" }).eq("id", s.id));
        aviso("Salvo!"); renderServicos();
      },
    });
  }));
}
const nomeDe = (lista, id) => lista.find((x) => x.id == id)?.nome ?? "";

// ===============================================================
// FECHAMENTOS — por mão de obra, produto e serviço, no mês
// ===============================================================
async function renderFechamentos() {
  const mes = `${mesFechamento}-01`;
  const [itens, resumo, maos] = await Promise.all([
    q(sb.from("v_fechamento").select("*").eq("mes", mes).order("mao_de_obra_nome").order("produto_nome").order("servico_nome")),
    q(sb.from("v_resumo_mensal").select("*").eq("mes", mes)),
    carregarMaos(false),
  ]);
  const total = soma(resumo, "valor_total");
  const pago = resumo.filter((r) => r.pago_em).reduce((s, r) => s + Number(r.valor_total), 0);
  const porMao = {};
  itens.forEach((i) => { (porMao[i.mao_de_obra_id] ??= []).push(i); });

  main.innerHTML = `
    <div class="titulo-pagina">Fechamentos</div>
    <div class="section-head"><span class="muted small">Soma das entregas parciais e dos lotes prontos de cada mês.</span>
      <input type="month" id="mesSel" value="${mesFechamento}" style="width:auto"></div>
    <div class="totais">
      <div class="total escuro"><div class="r">Total de ${nomeMes(mes).toLowerCase()}</div><div class="v">${moeda(total)}</div></div>
      <div class="total"><div class="r">Já pago</div><div class="v">${moeda(pago)}</div></div>
      <div class="total amarelo"><div class="r">Falta pagar</div><div class="v">${moeda(total - pago)}</div></div>
    </div>
    ${resumo.length ? resumo.sort((a, b) => a.mao_de_obra_nome.localeCompare(b.mao_de_obra_nome)).map((r) => {
      const mo = maos.find((x) => x.id === r.mao_de_obra_id) || {};
      const linhas = porMao[r.mao_de_obra_id] || [];
      return `<div class="card section">
        <div class="section-head"><h2 style="margin:0">${esc(maiusc(r.mao_de_obra_nome))}</h2>
          <span>${r.pago_em ? selo("pago", "Pago em " + dataBR(r.pago_em)) : selo("aberto", "A pagar")}</span></div>
        ${mo.pix ? `<p class="small muted" style="margin:0 0 .5rem">PIX: <strong>${esc(mo.pix)}</strong></p>` : ""}
        <div class="tabela-wrap"><table>
          <thead><tr><th>Produto</th><th>Serviço</th><th class="right">Quantidade</th><th class="right">R$/peça</th><th class="right">Valor</th></tr></thead>
          <tbody>${linhas.map((i) => `<tr><td>${esc(i.produto_nome)}</td><td>${esc(i.servico_nome)}</td><td class="right num">${inteiro(i.quantidade)}</td>
            <td class="right num">${moeda(i.valor_unitario)}</td><td class="right num">${moeda(i.valor)}</td></tr>`).join("")}</tbody>
          <tfoot><tr><td colspan="2">Total</td><td class="right num">${inteiro(r.quantidade)}</td><td></td><td class="right num">${moeda(r.valor_total)}</td></tr></tfoot>
        </table></div>
        <div class="acoes">
          ${r.pago_em ? `<button class="btn perigo peq" data-reabrir="${r.fechamento_id}">Reabrir</button>`
            : `<button class="btn ok peq" data-pagar="${r.mao_de_obra_id}">Marcar como pago</button>`}
          <button class="btn sec peq" data-recibo="${r.mao_de_obra_id}">🖨️ Recibo</button>
        </div>
      </div>`;
    }).join("") : `<div class="card vazio">Nenhuma entrega em ${nomeMes(mes).toLowerCase()}.</div>`}`;

  $("#mesSel").onchange = (e) => { mesFechamento = e.target.value || mesFechamento; renderFechamentos(); };
  $$("[data-pagar]", main).forEach((b) => (b.onclick = async () => {
    const r = resumo.find((x) => x.mao_de_obra_id === b.dataset.pagar);
    if (!(await confirmar(`Marcar ${moeda(r.valor_total)} de ${r.mao_de_obra_nome} (${nomeMes(mes).toLowerCase()}) como pago? As entregas deste mês ficam travadas.`, "Marcar como pago"))) return;
    try { await rpc("fechar_mes", { p_mao_de_obra: r.mao_de_obra_id, p_mes: mes }); aviso("Marcado como pago!"); renderFechamentos(); }
    catch (e) { aviso(e.message, true); }
  }));
  $$("[data-reabrir]", main).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Reabrir este fechamento? Ele volta para 'a pagar'.", "Reabrir"))) return;
    try { await rpc("reabrir_mes", { p_fechamento: Number(b.dataset.reabrir) }); aviso("Fechamento reaberto."); renderFechamentos(); }
    catch (e) { aviso(e.message, true); }
  }));
  $$("[data-recibo]", main).forEach((b) => (b.onclick = () => {
    const r = resumo.find((x) => x.mao_de_obra_id === b.dataset.recibo);
    imprimirRecibo(r, porMao[r.mao_de_obra_id] || [], maos.find((x) => x.id === r.mao_de_obra_id) || {}, mes);
  }));
}

function imprimirRecibo(r, linhas, mo, mes) {
  const w = window.open("", "_blank");
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo ${esc(r.mao_de_obra_nome)} ${nomeMes(mes)}</title>
    <link rel="stylesheet" href="${new URL("css/style.css", location.href)}"></head><body style="background:#fff;padding:1.5rem">
    <h1>${esc(NOME_FABRICA)} — Recibo de serviços</h1>
    <p><strong>Mão de obra:</strong> ${esc(r.mao_de_obra_nome)}${mo.pix ? `<br><strong>PIX:</strong> ${esc(mo.pix)}` : ""}<br><strong>Período:</strong> ${nomeMes(mes)}</p>
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
async function renderAdmin() {
  const conf = Object.fromEntries((await q(sb.from("configuracoes").select("*"))).map((c) => [c.chave, c.valor]));
  main.innerHTML = `
    <div class="titulo-pagina">Administrativo</div>
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

      <div class="card">
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
            <div class="linha"><div><label>Link do App da Web do backup (opcional)</label><input name="link_app_backup" value="${esc(conf.link_app_backup)}" placeholder="https://script.google.com/macros/s/…/exec"></div></div>
            <div class="linha"><div><label>Código secreto do backup</label><input name="codigo_backup" type="password" value="${esc(conf.codigo_backup)}" autocomplete="off"></div></div>
            <button class="btn" type="submit">Salvar links</button>
          </form>
        </details>
      </div>
    </div>`;

  ligarCalculadora();

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
    const [lotes, entregas] = await Promise.all([
      q(sb.from("v_lotes").select("*").order("id")),
      q(sb.from("v_entregas").select("*").order("id")),
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
    aviso("Cópia baixada (2 arquivos).");
  } catch (e) { aviso(e.message, true); }
}

// ---------------------------------------------------------------
render();
