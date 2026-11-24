// Funções compartilhadas entre o painel do dono e o da mão de obra
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, DOMINIO_LOGIN } from "../config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Login ----------
export const emailDoUsuario = (usuario) => `${usuario.trim().toLowerCase()}@${DOMINIO_LOGIN}`;

export async function entrar(usuario, senha) {
  const { error } = await sb.auth.signInWithPassword({ email: emailDoUsuario(usuario), password: senha });
  if (error) throw new Error("Usuário ou senha incorretos.");
  return carregarPerfil();
}

export async function carregarPerfil() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from("perfis").select("*").eq("id", session.user.id).single();
  if (error || !data) return null;
  if (!data.ativo) { await sb.auth.signOut(); throw new Error("Seu acesso está desativado. Fale com o dono."); }
  return data;
}

// Garante que a pessoa certa está na página certa
export async function exigirPapel(papel) {
  let perfil = null;
  try { perfil = await carregarPerfil(); } catch { /* inativo */ }
  if (!perfil) { location.replace("index.html"); throw new Error("sem sessão"); }
  if (perfil.papel !== papel) {
    location.replace(perfil.papel === "dono" ? "dono.html" : "producao.html");
    throw new Error("papel errado");
  }
  return perfil;
}

export async function sair() {
  await sb.auth.signOut();
  location.replace("index.html");
}

export async function trocarSenha(usuario, atual, nova) {
  if (nova.length < 6) throw new Error("A nova senha precisa ter pelo menos 6 caracteres.");
  const { error: e1 } = await sb.auth.signInWithPassword({ email: emailDoUsuario(usuario), password: atual });
  if (e1) throw new Error("Senha atual incorreta.");
  const { error } = await sb.auth.updateUser({ password: nova });
  if (error) throw new Error(error.message);
}

// Chama a Edge Function de usuários (só o dono)
export async function adminUsuarios(corpo) {
  const { data, error } = await sb.functions.invoke("admin-usuarios", { body: corpo });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).erro || msg; } catch { /* sem corpo */ }
    throw new Error(msg);
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

// Executa uma função do banco e converte o erro em mensagem amigável
export async function rpc(nome, params) {
  const { data, error } = await sb.rpc(nome, params);
  if (error) throw new Error(error.message);
  return data;
}

export async function q(promessa) {
  const { data, error } = await promessa;
  if (error) throw new Error(error.message);
  return data;
}

// ---------- Formatação ----------
const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const moeda = (v) => fmtMoeda.format(Number(v || 0));
export const inteiro = (v) => Number(v || 0).toLocaleString("pt-BR");

export function dataBR(d) {
  if (!d) return "—";
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [a, m, dia] = s.split("-"); return `${dia}/${m}/${a}`; }
  return new Date(s).toLocaleDateString("pt-BR");
}
export const dataHoraBR = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

// Datas no formato AAAA-MM-DD no fuso local
export function isoLocal(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function inicioSemana(d = new Date()) {
  const x = new Date(d); const dia = (x.getDay() + 6) % 7; // segunda = 0
  x.setDate(x.getDate() - dia); return isoLocal(x);
}
export function inicioMes(d = new Date()) { return isoLocal(new Date(d.getFullYear(), d.getMonth(), 1)); }
export function fimMes(d = new Date()) { return isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
export function nomeMes(iso) {
  const [a, m] = iso.split("-").map(Number);
  const t = new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const STATUS = {
  aberto: "Em aberto", pronto: "Pronto", cancelado: "Cancelado",
  parcial: "Parcial", pago: "Pago",
};
export const selo = (status, texto) => `<span class="selo ${status}">${esc(texto ?? STATUS[status] ?? status)}</span>`;

// ---------- HTML ----------
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

let toastTimer;
export function aviso(msg, erro = false) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = erro ? "erro" : ""; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), erro ? 5000 : 2800);
}

// Modal simples. conteudo = HTML. onSubmit recebe (FormData, form) e pode lançar erro.
export function abrirModal({ titulo, conteudo, onSubmit, aoAbrir, largo = false }) {
  const fundo = document.createElement("div");
  fundo.className = "modal-fundo";
  fundo.innerHTML = `<div class="modal${largo ? " largo" : ""}" role="dialog" aria-modal="true">
      <div class="modal-topo"><h2>${esc(titulo)}</h2><button class="icon-btn" data-fechar aria-label="Fechar" style="color:var(--muted)">✕</button></div>
      <form novalidate>${conteudo}</form></div>`;
  const fechar = () => fundo.remove();
  fundo.addEventListener("click", (e) => { if (e.target === fundo || e.target.closest("[data-fechar]")) fechar(); });
  const form = $("form", fundo);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!onSubmit) return fechar();
    const botao = $("button[type=submit]", form);
    if (botao) botao.disabled = true;
    try { await onSubmit(new FormData(form), form); fechar(); }
    catch (err) { aviso(err.message, true); }
    finally { if (botao) botao.disabled = false; }
  });
  document.body.appendChild(fundo);
  aoAbrir?.(form, fechar);
  if (!largo) $("input:not([type=hidden]), select, textarea", form)?.focus();
  return { fechar, form };
}

export function confirmar(texto, rotulo = "Confirmar") {
  return new Promise((ok) => {
    const m = abrirModal({
      titulo: "Confirmação",
      conteudo: `<p>${esc(texto)}</p><div class="acoes"><button type="submit" class="btn">${esc(rotulo)}</button><button type="button" class="btn sec" data-fechar>Voltar</button></div>`,
      onSubmit: async () => ok(true),
    });
    m.form.closest(".modal-fundo").addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-fundo") || e.target.closest("[data-fechar]")) ok(false);
    });
  });
}

export function modalTrocarSenha(usuario) {
  abrirModal({
    titulo: "Trocar minha senha",
    conteudo: `
      <div class="linha"><div><label>Senha atual</label><input type="password" name="atual" required autocomplete="current-password"></div></div>
      <div class="linha"><div><label>Nova senha (mín. 6)</label><input type="password" name="nova" required minlength="6" autocomplete="new-password"></div></div>
      <div class="linha"><div><label>Repita a nova senha</label><input type="password" name="nova2" required autocomplete="new-password"></div></div>
      <button type="submit" class="btn bloco">Salvar nova senha</button>`,
    onSubmit: async (fd) => {
      if (fd.get("nova") !== fd.get("nova2")) throw new Error("As novas senhas não conferem.");
      await trocarSenha(usuario, fd.get("atual"), fd.get("nova"));
      aviso("Senha alterada!");
    },
  });
}

// ---------- Períodos de pagamento (semanal, quinzenal, mensal) ----------
export const FREQUENCIAS = { semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal" };
const dataDeIso = (iso) => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); };
const somaDias = (iso, n) => { const d = dataDeIso(iso); d.setDate(d.getDate() + n); return isoLocal(d); };

// Devolve { tipo, inicio, fim, rotulo } do período que contém a data
export function periodo(tipo, refIso = isoLocal()) {
  const d = dataDeIso(refIso);
  let inicio, fim, rotulo;
  if (tipo === "semanal") {
    inicio = inicioSemana(d); fim = somaDias(inicio, 6);
    rotulo = `Semana de ${dataBR(inicio).slice(0, 5)} a ${dataBR(fim).slice(0, 5)}`;
  } else if (tipo === "quinzenal") {
    const primeira = d.getDate() <= 15;
    inicio = isoLocal(new Date(d.getFullYear(), d.getMonth(), primeira ? 1 : 16));
    fim = primeira ? isoLocal(new Date(d.getFullYear(), d.getMonth(), 15)) : fimMes(d);
    rotulo = `${primeira ? "1ª" : "2ª"} quinzena de ${nomeMes(inicio).toLowerCase()} (${dataBR(inicio).slice(0, 5)} a ${dataBR(fim).slice(0, 5)})`;
  } else {
    inicio = inicioMes(d); fim = fimMes(d);
    rotulo = nomeMes(inicio);
  }
  return { tipo, inicio, fim, rotulo };
}
export const periodoAnterior = (p) => periodo(p.tipo, somaDias(p.inicio, -1));
export const periodoSeguinte = (p) => periodo(p.tipo, somaDias(p.fim, 1));
export const rotuloPeriodo = (tipo, inicio) => periodo(tipo || "mensal", inicio).rotulo;

// ---------- App (PWA): registro e botão "Instalar app" ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
let pedidoInstalacao = null;
const ouvintesInstalar = new Set();
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedidoInstalacao = e; ouvintesInstalar.forEach((f) => f()); });
window.addEventListener("appinstalled", () => { pedidoInstalacao = null; ouvintesInstalar.forEach((f) => f()); });

export const appInstalado = () =>
  matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

// Mostra o botão "📲 Instalar app" dentro do elemento (some quando já está instalado)
export function botaoInstalar(alvo) {
  if (!alvo) return;
  const desenhar = () => {
    if (appInstalado()) { alvo.innerHTML = ""; return; }
    if (pedidoInstalacao) {
      alvo.innerHTML = `<button type="button" class="btn sec bloco">📲 Instalar o app no celular</button>`;
      alvo.querySelector("button").onclick = async () => {
        pedidoInstalacao.prompt();
        await pedidoInstalacao.userChoice.catch(() => {});
        pedidoInstalacao = null; desenhar();
      };
    } else if (ehIphone()) {
      alvo.innerHTML = `<button type="button" class="btn sec bloco">📲 Como instalar o app no iPhone</button>`;
      alvo.querySelector("button").onclick = () => abrirModal({
        titulo: "Instalar no iPhone",
        conteudo: `<ol style="padding-left:1.2rem;line-height:1.7">
          <li>Abra este site no <strong>Safari</strong>.</li>
          <li>Toque no botão <strong>Compartilhar</strong> (quadrado com uma seta para cima, na barra de baixo).</li>
          <li>Role e toque em <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Toque em <strong>Adicionar</strong>. O ícone do app aparece na tela do celular.</li></ol>
          <button type="submit" class="btn bloco">Entendi</button>`,
      });
    } else {
      alvo.innerHTML = "";
    }
  };
  ouvintesInstalar.add(desenhar);
  desenhar();
}
