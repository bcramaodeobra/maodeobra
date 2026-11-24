/**
 * BACKUP DIÁRIO NO GOOGLE PLANILHAS — Controle de Mão de Obra (Bordados) — versão 2
 *
 * Cole este código em: Planilha > Extensões > Apps Script
 * Depois preencha os 2 campos abaixo (URL_FUNCAO e CODIGO_SECRETO).
 */
const CONFIG = {
  // 1) Troque SEU-PROJETO pelo código do seu projeto Supabase (o mesmo do Project URL)
  URL_FUNCAO: "https://SEU-PROJETO.supabase.co/functions/v1/exportar-dados",

  // 2) Cole aqui o mesmo código secreto que está no Supabase (CODIGO_BACKUP)
  CODIGO_SECRETO: "COLE-AQUI-O-CODIGO-SECRETO",

  // Opções (pode deixar como está)
  HORA_BACKUP: 23,                                   // hora do backup diário (0 a 23), horário de Brasília
  PASTA_BACKUP: "Backups - Controle de Bordados",    // pasta no Google Drive onde ficam as cópias
  DIAS_PARA_GUARDAR: 0,                              // 0 = guardar todas as cópias para sempre
};

const FUSO = "America/Sao_Paulo";
const MOEDA = '"R$" #,##0.00';
const DATA = "dd/mm/yyyy";
const DATA_HORA = "dd/mm/yyyy hh:mm";

// ------------------------------------------------------------------
// Menu na planilha
// ------------------------------------------------------------------
function onOpen() {
  guardarIdPlanilha_();
  SpreadsheetApp.getUi()
    .createMenu("🧵 Backup")
    .addItem("Atualizar dados agora", "atualizarAgora")
    .addItem("Fazer backup agora (atualizar + salvar cópia)", "backupAgora")
    .addSeparator()
    .addItem("Ativar backup diário automático", "ativarBackupDiario")
    .addItem("Desativar backup diário", "desativarBackupDiario")
    .addToUi();
}

function atualizarAgora() {
  const total = atualizarPlanilha_();
  aviso_(`Dados atualizados (${total} lotes).`);
}

function backupAgora() {
  atualizarPlanilha_();
  const copia = salvarCopia_();
  aviso_(`Cópia salva: ${copia.getName()}`);
}

// Executado todos os dias pelo gatilho automático
function backupDiario() {
  try {
    atualizarPlanilha_();
    salvarCopia_();
    limparCopiasAntigas_();
  } catch (e) {
    MailApp.sendEmail(
      Session.getEffectiveUser().getEmail(),
      "⚠️ Falha no backup diário — Controle de Bordados",
      "O backup automático de hoje não funcionou.\n\nErro: " + e.message +
      "\n\nAbra a planilha e use o menu Backup > Atualizar dados agora para testar."
    );
    throw e;
  }
}

function ativarBackupDiario() {
  guardarIdPlanilha_();
  desativarBackupDiario(true);
  ScriptApp.newTrigger("backupDiario")
    .timeBased().everyDays(1).atHour(CONFIG.HORA_BACKUP).inTimezone(FUSO)
    .create();
  backupAgora();
  SpreadsheetApp.getUi().alert(
    `Backup diário ativado!\n\nTodo dia, por volta das ${CONFIG.HORA_BACKUP}h, a planilha será atualizada e uma cópia ` +
    `será salva na pasta "${CONFIG.PASTA_BACKUP}" do seu Google Drive.\n\nSe der erro, você recebe um e-mail.`
  );
}

function desativarBackupDiario(silencioso) {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "backupDiario")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  if (silencioso !== true) SpreadsheetApp.getUi().alert("Backup diário desativado.");
}

// ------------------------------------------------------------------
// Botão "Fazer backup agora" do painel do dono (App da Web)
// ------------------------------------------------------------------
function doGet(e) {
  const pagina = (titulo, texto, ok) => HtmlService.createHtmlOutput(
    `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;text-align:center">
       <div style="font-size:48px">${ok ? "✅" : "⚠️"}</div><h2>${titulo}</h2><p style="color:#555">${texto}</p>
       <p style="color:#999;font-size:13px">Pode fechar esta aba.</p></div>`).setTitle(titulo);
  if (!e || !e.parameter || e.parameter.codigo !== CONFIG.CODIGO_SECRETO) {
    return pagina("Acesso negado", "Código inválido.", false);
  }
  try {
    const total = atualizarPlanilha_();
    const copia = salvarCopia_();
    return pagina("Backup feito!", `${total} lotes salvos. Cópia: ${copia.getName()}`, true);
  } catch (err) {
    return pagina("O backup falhou", err.message, false);
  }
}

// ------------------------------------------------------------------
// Busca os dados no Supabase
// ------------------------------------------------------------------
function buscarDados_() {
  if (CONFIG.URL_FUNCAO.includes("SEU-PROJETO") || CONFIG.CODIGO_SECRETO.includes("COLE-AQUI")) {
    throw new Error("Preencha URL_FUNCAO e CODIGO_SECRETO no topo do código (Extensões > Apps Script).");
  }
  const resp = UrlFetchApp.fetch(CONFIG.URL_FUNCAO, {
    method: "get",
    headers: { "x-codigo-backup": CONFIG.CODIGO_SECRETO },
    muteHttpExceptions: true,
  });
  let dados;
  try { dados = JSON.parse(resp.getContentText()); } catch (e) { dados = null; }
  if (resp.getResponseCode() !== 200 || !dados || dados.erro) {
    throw new Error(`Supabase respondeu ${resp.getResponseCode()}: ${(dados && dados.erro) || resp.getContentText().slice(0, 200)}`);
  }
  return dados;
}

// ------------------------------------------------------------------
// Monta as abas
// ------------------------------------------------------------------
function atualizarPlanilha_() {
  const d = buscarDados_();
  const ss = planilha_();
  const mesAtual = Utilities.formatDate(new Date(), FUSO, "yyyy-MM") + "-01";
  const maos = d.maos_de_obra.filter((m) => m.papel === "mao_de_obra");
  const STATUS = { aberto: "Em aberto", pronto: "Pronto", cancelado: "Cancelado" };

  // 1. Resumo do mês atual por mão de obra
  const resumoMes = d.resumo_mensal.filter((r) => r.mes === mesAtual);
  const abertos = d.lotes.filter((l) => l.status === "aberto");
  escreverAba_(ss, "Resumo do mês", [
    ["Mão de obra"], ["Lotes em aberto"], ["Peças com ela"], ["Valor em aberto", MOEDA],
    ["Peças finalizadas no mês"], ["Finalizado no mês", MOEDA], ["Situação do mês"],
  ], maos.map((m) => {
    const r = resumoMes.find((x) => x.mao_de_obra_id === m.id);
    const meus = abertos.filter((l) => l.mao_de_obra_id === m.id);
    return [
      m.nome, meus.length,
      meus.reduce((s, l) => s + l.qtd_falta, 0),
      meus.reduce((s, l) => s + Number(l.valor_aberto), 0),
      r ? Number(r.quantidade) : 0,
      r ? Number(r.valor_total) : 0,
      r && r.pago_em ? "Pago em " + Utilities.formatDate(new Date(r.pago_em), FUSO, "dd/MM/yyyy") : (r ? "A pagar" : "—"),
    ];
  }), `Mês: ${mesAtual.slice(5, 7)}/${mesAtual.slice(0, 4)} · Atualizado em ${agora_()}`);

  // 2. Fechamento detalhado (mão de obra × produto × serviço, por mês)
  const pago = {}; d.resumo_mensal.forEach((r) => (pago[r.mao_de_obra_id + r.mes] = r.pago_em));
  escreverAba_(ss, "Fechamentos", [
    ["Mês", "mm/yyyy"], ["Mão de obra"], ["Produto"], ["Serviço"], ["Quantidade"], ["R$ por peça", MOEDA], ["Valor", MOEDA], ["Situação"],
  ], d.fechamento.slice().sort((a, b) => (a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : a.mao_de_obra_nome.localeCompare(b.mao_de_obra_nome)))
    .map((f) => [
      dataSimples_(f.mes), f.mao_de_obra_nome, f.produto_nome, f.servico_nome, Number(f.quantidade),
      Number(f.valor_unitario), Number(f.valor), pago[f.mao_de_obra_id + f.mes] ? "Pago" : "A pagar",
    ]));

  // 3. Lotes
  escreverAba_(ss, "Lotes", [
    ["Nº"], ["Enviado em", DATA_HORA], ["Mão de obra"], ["Produto"], ["Serviço"], ["Quantidade"], ["R$ por peça", MOEDA],
    ["Total do lote", MOEDA], ["Entregue"], ["Falta"], ["Situação"], ["Finalizado em", DATA_HORA], ["Observações"],
  ], d.lotes.slice().reverse().map((l) => [
    l.id, dataHora_(l.enviado_em), l.mao_de_obra_nome, l.produto_nome, l.servico_nome, l.quantidade,
    Number(l.valor_unitario), Number(l.valor_total), l.qtd_entregue, l.qtd_falta, STATUS[l.status] || l.status,
    dataHora_(l.finalizado_em), l.observacoes || "",
  ]));

  // 4. Entregas (parciais e lotes prontos)
  escreverAba_(ss, "Entregas", [
    ["Data", DATA_HORA], ["Lote"], ["Mão de obra"], ["Produto"], ["Serviço"], ["Peças"], ["Tipo"], ["Valor", MOEDA], ["Mês", "mm/yyyy"],
  ], d.entregas.slice().reverse().map((e) => [
    dataHora_(e.entregue_em), e.lote_id, e.mao_de_obra_nome, e.produto_nome, e.servico_nome, e.quantidade,
    e.tipo === "pronto" ? "Lote pronto" : "Parcial", Number(e.valor), dataSimples_(e.mes_ref),
  ]));

  // 5. Cadastros
  escreverAba_(ss, "Mãos de obra", [["Nome"], ["Usuário"], ["WhatsApp"], ["Endereço"], ["Chave PIX"], ["Situação"], ["Cadastrado em", DATA_HORA]],
    maos.map((m) => [m.nome, m.usuario, m.whatsapp || "", m.endereco || "", m.pix || "", m.ativo ? "Ativo" : "Inativo", dataHora_(m.criado_em)]));

  const nomeProd = {}; d.produtos.forEach((p) => (nomeProd[p.id] = p.nome));
  escreverAba_(ss, "Serviços e preços", [["Produto"], ["Serviço"], ["R$ por peça", MOEDA], ["Situação"]],
    d.servicos.map((s) => [nomeProd[s.produto_id] || "", s.nome, Number(s.valor_unitario), s.ativo ? "Ativo" : "Inativo"])
      .sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1])));

  // Remove abas antigas/vazias
  ["Página1", "Sheet1", "Planilha1", "A pagar por mês", "Produção diária", "Materiais enviados", "Tabela de preços"].forEach((n) => {
    const s = ss.getSheetByName(n);
    if (s && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  return d.lotes.length;
}

// Escreve uma aba inteira: colunas = [[título, formato?], ...]
function escreverAba_(ss, nome, colunas, linhas, subtitulo) {
  let aba = ss.getSheetByName(nome);
  if (!aba) aba = ss.insertSheet(nome);
  aba.clear();
  const inicio = subtitulo ? 3 : 1;
  if (subtitulo) aba.getRange(1, 1).setValue(subtitulo).setFontStyle("italic").setFontColor("#6b7180");

  aba.getRange(inicio, 1, 1, colunas.length).setValues([colunas.map((c) => c[0])])
    .setFontWeight("bold").setBackground("#23324d").setFontColor("#ffffff");
  aba.setFrozenRows(inicio);

  if (linhas.length) {
    aba.getRange(inicio + 1, 1, linhas.length, colunas.length).setValues(linhas);
    colunas.forEach((c, i) => {
      if (c[1]) aba.getRange(inicio + 1, i + 1, linhas.length, 1).setNumberFormat(c[1]);
    });
  } else {
    aba.getRange(inicio + 1, 1).setValue("(sem dados ainda)").setFontColor("#6b7180");
  }
  aba.autoResizeColumns(1, colunas.length);
}

// ------------------------------------------------------------------
// Cópias diárias no Google Drive
// ------------------------------------------------------------------
function pastaBackup_() {
  const it = DriveApp.getFoldersByName(CONFIG.PASTA_BACKUP);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.PASTA_BACKUP);
}

function salvarCopia_() {
  const ss = planilha_();
  SpreadsheetApp.flush();
  const nome = `Backup bordados ${Utilities.formatDate(new Date(), FUSO, "yyyy-MM-dd HH'h'mm")}`;
  return DriveApp.getFileById(ss.getId()).makeCopy(nome, pastaBackup_());
}

function limparCopiasAntigas_() {
  if (!CONFIG.DIAS_PARA_GUARDAR) return;
  const limite = Date.now() - CONFIG.DIAS_PARA_GUARDAR * 86400000;
  const arquivos = pastaBackup_().getFiles();
  while (arquivos.hasNext()) {
    const f = arquivos.next();
    if (f.getName().indexOf("Backup bordados") === 0 && f.getDateCreated().getTime() < limite) f.setTrashed(true);
  }
}

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
function guardarIdPlanilha_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) PropertiesService.getScriptProperties().setProperty("ID_PLANILHA", ss.getId());
}

// Funciona no menu, no gatilho diário e no App da Web
function planilha_() {
  const ativa = SpreadsheetApp.getActiveSpreadsheet();
  if (ativa) return ativa;
  const id = PropertiesService.getScriptProperties().getProperty("ID_PLANILHA");
  if (!id) throw new Error("Abra a planilha uma vez e use o menu Backup para registrá-la.");
  return SpreadsheetApp.openById(id);
}

function aviso_(texto) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(texto, "Backup", 6); } catch (e) { /* sem tela */ }
}

function agora_() { return Utilities.formatDate(new Date(), FUSO, "dd/MM/yyyy HH:mm"); }
function dataHora_(v) { return v ? new Date(v) : ""; }
function dataSimples_(v) {
  if (!v) return "";
  const p = String(v).slice(0, 10).split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}
