// App do motorista: só recebe os avisos de "terminei" das costureiras (sem valores em R$)
import { sb, exigirPapel, sair, modalTrocarSenha, rpc, confirmar, aviso, abrirModal, esc, $, $$, botaoInstalar, appInstalado } from "./comum.js";

const VAPID_PUBLICA = "BFqQOKpdbZIxdGhbHRHynfUuSiJb6MHks9msK3fLzaf9MBI8GcpOArsy7QXBQq-WKrOWmijRTaTzkAQAuhtI3tE";
const perfil = await exigirPapel("motorista");
$("#quem").textContent = `Olá, ${perfil.nome.split(" ")[0]}!`;
const main = $("#conteudo");

const hora = (iso) => { const d = new Date(iso); return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };
const ha = (iso) => {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return "agora"; if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60); if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dia${h >= 48 ? "s" : ""}`;
};
const zap = (n) => `https://wa.me/55${String(n).replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")}`;
const mapa = (e) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e)}`;

// ---------- Notificações ----------
const suportaPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const ehIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
const chaveBytes = (b64) => { const p = "=".repeat((4 - (b64.length % 4)) % 4); const s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };

async function estadoPush() {
  if (!suportaPush) return ehIphone && !appInstalado() ? "instalar" : "sem-suporte";
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "ativo" : "desligado";
}
async function ativarPush() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Você não permitiu as notificações. Libere nas configurações do navegador.");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(VAPID_PUBLICA) });
  const j = sub.toJSON();
  await sb.from("push_inscricoes").delete().eq("endpoint", j.endpoint);
  const { error } = await sb.from("push_inscricoes").insert({ usuario_id: perfil.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
  if (error) throw error;
}
async function testarPush() {
  const { data, error } = await sb.functions.invoke("enviar-push", { body: { teste: true } });
  if (error || data?.erro) throw new Error(data?.erro || "Não foi possível testar agora.");
  if (!data?.enviados) throw new Error("Este celular ainda não está inscrito. Toque em Ativar notificações.");
}

async function cartaoPush() {
  const st = await estadoPush();
  const txt = {
    ativo: ["✓ Notificações ligadas", "Quando uma costureira avisar que terminou, o celular toca."],
    desligado: ["Notificações desligadas", "Ligue para o celular avisar mesmo com o app fechado."],
    bloqueado: ["Notificações bloqueadas", "Libere as notificações deste site nas configurações do navegador."],
    instalar: ["Instale o app", "No iPhone: toque em Compartilhar → Adicionar à Tela de Início, abra pelo ícone e ligue as notificações."],
    "sem-suporte": ["Sem notificações neste navegador", "Abra pelo Chrome (Android) ou instale o app na tela inicial (iPhone)."],
  }[st];
  return `<div class="card push-card ${st}">
    <div><strong>${txt[0]}</strong><p class="small muted" style="margin:.2rem 0 0">${txt[1]}</p></div>
    ${st === "desligado" ? `<button class="btn acento" id="pushLigar">Ativar notificações</button>` : ""}
    ${st === "ativo" ? `<button class="btn sec peq" id="pushTestar">Testar</button>` : ""}
    ${st === "instalar" ? `<div id="areaInstalar"></div>` : ""}
  </div>`;
}

// ---------- Enviar lote (sem valores) ----------
async function modalEnviarLote() {
  let cat;
  try { cat = await rpc("catalogo_motorista"); } catch (e) { return aviso(e.message, true); }
  if (!cat?.maos?.length) return aviso("Nenhuma costureira cadastrada para receber lotes.", true);
  if (!cat?.servicos?.length) return aviso("Nenhum serviço cadastrado ainda.", true);
  const prods = cat.produtos.filter((p) => cat.servicos.some((s) => s.produto_id === p.id));
  const linha = () => `<div class="mot-linha">
      <div><label>Produto *</label><select name="produto"><option value="">Selecione…</option>${prods.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select></div>
      <div><label>Serviço *</label><select name="servico" disabled><option value="">Escolha o produto</option></select></div>
      <div><label>Peças *</label><input name="qtd" type="number" min="1" step="1" inputmode="numeric"></div>
      <button type="button" class="btn-lixo" data-rmlinha aria-label="Remover serviço" title="Remover"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg></button>
    </div>`;
  abrirModal({
    titulo: "Enviar lote",
    conteudo: `
      <div class="linha"><div><label>Costureira *</label><select name="mo" required><option value="">Selecione…</option>
        ${cat.maos.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join("")}</select></div></div>
      <div id="motLinhas">${linha()}</div>
      <button type="button" class="btn sec peq" id="motMais" style="margin:.2rem 0 .8rem">＋ Outro serviço</button>
      <div class="linha"><div><label>Observação (opcional)</label><input name="obs" placeholder="Ex.: entregue às 14h"></div></div>
      <button type="submit" class="btn bloco acento">Enviar lote</button>`,
    aoAbrir: (f) => {
      const ligar = () => {
        $$(".mot-linha", f).forEach((l) => {
          const sp = $("[name=produto]", l), ss = $("[name=servico]", l);
          sp.onchange = () => {
            const lst = cat.servicos.filter((s) => s.produto_id == sp.value);
            ss.innerHTML = lst.length ? `<option value="">Selecione…</option>${lst.map((s) => `<option value="${s.id}">${esc(s.nome)}</option>`).join("")}` : `<option value="">Escolha o produto</option>`;
            ss.disabled = !lst.length;
            if (lst.length === 1) ss.value = lst[0].id;
          };
          $("[data-rmlinha]", l).onclick = () => { if ($$(".mot-linha", f).length > 1) { l.remove(); } };
        });
      };
      $("#motMais", f).onclick = () => { $("#motLinhas", f).insertAdjacentHTML("beforeend", linha()); ligar(); };
      ligar();
    },
    onSubmit: async (fd, f) => {
      const mo = fd.get("mo");
      if (!mo) throw new Error("Escolha a costureira.");
      const itens = $$(".mot-linha", f || document).map((l) => ({ servico: Number($("[name=servico]", l).value), qtd: Number($("[name=qtd]", l).value) }));
      if (!itens.length || itens.some((i) => !i.servico || !(i.qtd > 0))) throw new Error("Escolha produto, serviço e quantidade de peças em cada linha.");
      for (const i of itens) await rpc("enviar_lote_motorista", { p_mao_de_obra: mo, p_servico: i.servico, p_quantidade: Math.round(i.qtd), p_observacoes: fd.get("obs") || null });
      aviso(itens.length > 1 ? `${itens.length} lotes enviados!` : "Lote enviado!");
      render();
    },
  });
}

// ---------- Lista ----------
let lista = [];
async function render() {
  let enviados = [];
  try {
    [lista, enviados] = await Promise.all([rpc("avisos_motorista"), rpc("lotes_enviados_motorista").catch(() => [])]);
    if (!Array.isArray(lista)) lista = [];
    if (!Array.isArray(enviados)) enviados = [];
  }
  catch (e) { main.innerHTML = `<div class="card vazio">Erro ao carregar: ${esc(e.message)}</div>`; return; }
  const pend = lista.filter((a) => a.pendente && !a.buscado_em);
  const buscando = lista.filter((a) => a.pendente && a.buscado_em);
  const antigos = lista.filter((a) => !a.pendente);
  $("#hero").innerHTML = `<div class="mo2-hero">
      <span class="r">PARA BUSCAR</span>
      <strong class="v">${pend.length} lote${pend.length === 1 ? "" : "s"}</strong>
      <div class="mo2-hero-linha">
        <div><span>Costureiras</span><strong>${new Set(pend.map((a) => a.costureira)).size}</strong></div>
        <div><span>Peças</span><strong>${pend.reduce((t, a) => t + Number(a.pecas || 0), 0)}</strong></div>
        <div><span>Já buscados</span><strong>${buscando.length}</strong></div>
      </div></div>`;
  const cartao = (a) => `<div class="mo-lote mot-card ${a.buscado_em ? "buscado" : ""}">
      <div class="mo-lote-topo"><div><div class="prod">${esc(a.costureira)}</div><div class="serv">${esc(a.produto)} · ${esc(a.servico)}</div></div>
        <div class="mot-pecas">${a.pecas}<small>peças</small></div></div>
      <div class="mo-lote-info">Avisou ${ha(a.avisado_em)} · ${hora(a.avisado_em)}</div>
      ${a.mensagem ? `<div class="mo-obs">💬 “${esc(a.mensagem)}”</div>` : ""}
      ${a.endereco ? `<div class="mo-lote-info">📍 ${esc(a.endereco)}</div>` : ""}
      <div class="mot-acoes">
        ${a.endereco ? `<a class="btn sec peq" href="${mapa(a.endereco)}" target="_blank" rel="noopener">Abrir no mapa</a>` : ""}
        ${a.whatsapp ? `<a class="btn sec peq" href="${zap(a.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
      </div>
      ${a.pendente ? (a.buscado_em
        ? `<div class="mo-avisado">✓ Buscado ${a.buscado_por ? `por ${esc(a.buscado_por.split(" ")[0])} ` : ""}em ${hora(a.buscado_em)} <button class="link" data-desf="${a.aviso_id}">Desfazer</button></div>`
        : `<button class="btn mo-btn-terminei" data-buscar="${a.aviso_id}">✓ Já busquei este lote</button>`) : ""}
    </div>`;
  main.innerHTML = `${await cartaoPush()}
    <button class="btn acento bloco mot-enviar" id="btnEnviarLote">＋ Enviar lote</button>
    <div class="mo2-titulo"><h2>Para buscar</h2><span class="selo parcial">${pend.length}</span></div>
    ${pend.length ? pend.map(cartao).join("") : `<div class="card vazio">Nenhum lote esperando. Quando uma costureira avisar que terminou, aparece aqui. 🙂</div>`}
    ${buscando.length ? `<div class="mo2-titulo"><h2>Buscados, aguardando conferência</h2></div>${buscando.map(cartao).join("")}` : ""}
    ${enviados.length ? `<div class="mo2-titulo"><h2>Lotes que enviei (7 dias)</h2></div><div class="card"><ul class="lista-final">${enviados.map((l) =>
      `<li><span><strong>${esc(l.costureira)}</strong> – ${esc(l.produto)} · ${esc(l.servico)}<br><span class="small muted">${hora(l.enviado_em)} · ${l.quantidade} peças</span></span>
        <span class="selo ${l.status === "aberto" ? "aberto" : l.status === "pronto" ? "pronto" : "cancelado"}">${l.status === "aberto" ? "Com a costureira" : l.status === "pronto" ? "Pronto" : "Cancelado"}</span></li>`).join("")}</ul></div>` : ""}
    ${antigos.length ? `<div class="mo2-titulo"><h2>Últimos 7 dias</h2></div><div class="card"><ul class="lista-final">${antigos.map((a) =>
      `<li><span><strong>${esc(a.costureira)}</strong> – ${esc(a.produto)} · ${esc(a.servico)}<br><span class="small muted">${hora(a.avisado_em)}</span></span><span class="selo pronto">Concluído</span></li>`).join("")}</ul></div>` : ""}
    <div class="menu-mais" style="margin-top:1rem">
      <button type="button" id="btnSenha"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><span>Trocar minha senha</span></button>
      <button type="button" id="btnSair" class="sair"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg><span>Sair</span></button>
    </div>`;
  if ($("#areaInstalar")) botaoInstalar($("#areaInstalar"));
  $("#btnEnviarLote").onclick = modalEnviarLote;
  $("#pushLigar")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try { await ativarPush(); aviso("Notificações ligadas!"); } catch (err) { aviso(err.message, true); }
    render();
  });
  $("#pushTestar")?.addEventListener("click", async () => {
    try { await testarPush(); aviso("Enviado! Deve tocar em alguns segundos."); } catch (err) { aviso(err.message, true); }
  });
  $$("[data-buscar]", main).forEach((b) => (b.onclick = async () => {
    try { await rpc("marcar_buscado", { p_aviso: Number(b.dataset.buscar), p_buscado: true }); aviso("Marcado como buscado!"); render(); }
    catch (e) { aviso(e.message, true); }
  }));
  $$("[data-desf]", main).forEach((b) => (b.onclick = async () => {
    if (!(await confirmar("Desfazer? O lote volta para a lista de buscar.", "Desfazer"))) return;
    try { await rpc("marcar_buscado", { p_aviso: Number(b.dataset.desf), p_buscado: false }); render(); }
    catch (e) { aviso(e.message, true); }
  }));
  $("#btnSenha").onclick = () => modalTrocarSenha(perfil.usuario);
  $("#btnSair").onclick = sair;
}

$("#btnAtualizar").onclick = () => { render(); aviso("Atualizado."); };
navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.tipo === "push") render(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
setInterval(() => { if (!document.hidden && !document.querySelector(".modal-fundo")) render(); }, 60000);
render();
