/**
 * BACKUP DIÁRIO NO GOOGLE PLANILHAS — Controle de Mão de Obra (Bordados)
 *
 * Cole este código em: Planilha > Extensões > Apps Script
 * Depois preencha os 2 campos abaixo (URL_FUNCAO e CODIGO_SECRETO).
 */
const CONFIG = {
  // 1) Troque SEU-PROJETO pelo código do seu projeto Supabase (o mesmo do Project URL)
  URL_FUNCAO: "https://SEU-PROJETO.supabase.co/functions/v1/exportar-dados",

  // 2) Cole aqui o mesmo código secreto que você colocou no Supabase (CODIGO_BACKUP)
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
  SpreadsheetApp.getActive().toast(`Dados atualizados (${total} lotes).`, "Backup", 5);
}

function backupAgora() {
  atualizarPlanilha_();
  const copia = salvarCopia_();
  SpreadsheetApp.getActive().toast(`Cópia salva: ${copia.getName()}`, "Backup", 6);
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
  desativarBackupDiario(true);
  ScriptApp.newTrigger("backupDiario")
    .timeBased().everyDays(1).atHour(CONFIG.HORA_BACKUP).inTimezone(FUSO)
    .create();
  backupAgora(); // já faz o primeiro para testar
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
  const ss = SpreadsheetApp.getActive();
  const mesAtual = Utilities.formatDate(new Date(), FUSO, "yyyy-MM") + "-01";
  const maos = d.maos_de_obra.filter((m) => m.papel === "mao_de_obra");
  const nomeMao = {}; maos.forEach((m) => (nomeMao[m.id] = m.nome));
  const STATUS = { enviado: "Enviado", recebido: "Recebido", em_producao: "Em produção", concluido: "Concluído",
    cancelado: "Cancelado", pendente: "A conferir", conferida: "Conferida" };

  // 1. Resumo do mês atual
  const resumoMes = d.resumo_mensal.filter((r) => r.mes === mesAtual);
  const abertos = d.lotes.filter((l) => l.status !== "concluido" && l.status !== "cancelado");
  const pendentes = d.entregas.filter((e) => e.status === "pendente");
  const linhasResumo = maos.map((m) => {
    const r = resumoMes.find((x) => x.mao_de_obra_id === m.id);
    const meusAbertos = abertos.filter((l) => l.mao_de_obra_id === m.id);
    return [
      m.nome,
      meusAbertos.length,
      meusAbertos.reduce((s, l) => s + l.qtd_saldo + l.qtd_em_conferencia, 0),
      pendentes.filter((e) => e.mao_de_obra_id === m.id).reduce((s, e) => s + e.quantidade, 0),
      r ? Number(r.quantidade) : 0,
      r ? Number(r.valor_total) : 0,
      r && r.pago_em ? "Pago em " + Utilities.formatDate(new Date(r.pago_em), FUSO, "dd/MM/yyyy") : (r ? "Em aberto" : "—"),
    ];
  });
  escreverAba_(ss, "Resumo do mês", [
    ["Mão de obra"], ["Lotes em aberto"], ["Peças com ela"], ["Peças a conferir"],
    ["Peças aprovadas no mês"], ["Valor a pagar no mês", MOEDA], ["Situação"],
  ], linhasResumo, `Mês: ${mesAtual.slice(5, 7)}/${mesAtual.slice(0, 4)} · Atualizado em ${agora_()}`);

  // 2. A pagar por mês (histórico)
  escreverAba_(ss, "A pagar por mês",
    [["Mês", "mm/yyyy"], ["Mão de obra"], ["Entregas"], ["Peças aprovadas"], ["Valor", MOEDA], ["Situação"], ["Pago em", DATA_HORA]],
    d.resumo_mensal.slice().sort((a, b) => (a.mes < b.mes ? 1 : -1)).map((r) => [
      dataSimples_(r.mes), r.mao_de_obra_nome, Number(r.entregas), Number(r.quantidade), Number(r.valor_total),
      r.pago_em ? "Pago" : "Em aberto", dataHora_(r.pago_em),
    ]));

  // 3. Lotes
  escreverAba_(ss, "Lotes", [
    ["Nº"], ["Enviado em", DATA_HORA], ["Mão de obra"], ["Produto"], ["Serviço"], ["Quantidade"], ["R$ por peça", MOEDA],
    ["Total do lote", MOEDA], ["Prazo", DATA], ["Situação"], ["Aprovadas"], ["A conferir"], ["Faltam"], ["Voltaram p/ refazer"],
    ["Valor aprovado", MOEDA], ["Recebido em", DATA_HORA], ["Concluído em", DATA_HORA], ["Observações"],
  ], d.lotes.slice().reverse().map((l) => [
    l.id, dataHora_(l.enviado_em), l.mao_de_obra_nome, l.produto_nome, l.servico_nome, l.quantidade, Number(l.valor_unitario),
    Number(l.valor_total), dataSimples_(l.prazo), l.atrasado ? "Atrasado" : STATUS[l.status] || l.status, l.qtd_aprovada,
    l.qtd_em_conferencia, l.qtd_saldo, l.qtd_retorno, Number(l.valor_aprovado), dataHora_(l.recebido_em),
    dataHora_(l.concluido_em), l.observacoes || "",
  ]));

  // 4. Entregas e conferências
  escreverAba_(ss, "Entregas", [
    ["Nº"], ["Lote"], ["Mão de obra"], ["Produto"], ["Serviço"], ["Entregue em", DATA_HORA], ["Peças entregues"], ["Situação"],
    ["Aprovadas"], ["Voltaram p/ refazer"], ["Conferido em", DATA_HORA], ["R$ por peça", MOEDA], ["Valor", MOEDA],
    ["Mês do pagamento", "mm/yyyy"], ["Obs. mão de obra"], ["Obs. conferência"],
  ], d.entregas.slice().reverse().map((e) => [
    e.id, e.lote_id, e.mao_de_obra_nome, e.produto_nome, e.servico_nome, dataHora_(e.entregue_em), e.quantidade,
    STATUS[e.status] || e.status, e.quantidade_aprovada == null ? "" : e.quantidade_aprovada,
    e.status === "conferida" ? e.quantidade_retorno : "", dataHora_(e.conferido_em), Number(e.valor_unitario),
    Number(e.valor), dataSimples_(e.mes_ref), e.observacao || "", e.observacao_conferencia || "",
  ]));

  // 5. Produção diária lançada pelas mãos de obra
  escreverAba_(ss, "Produção diária", [
    ["Dia", DATA], ["Mão de obra"], ["Lote"], ["Produto"], ["Serviço"], ["Peças"], ["Valor estimado", MOEDA], ["Observação"],
  ], d.producao.slice().reverse().map((p) => [
    dataSimples_(p.data), nomeMao[p.mao_de_obra_id] || "", p.lote_id, p.produto_nome, p.servico_nome, p.quantidade,
    Number(p.valor_estimado), p.observacao || "",
  ]));

  // 6. Materiais enviados
  const loteMao = {}; d.lotes.forEach((l) => (loteMao[l.id] = l.mao_de_obra_nome));
  escreverAba_(ss, "Materiais enviados", [["Lote"], ["Mão de obra"], ["Material"], ["Unidade"], ["Enviado"], ["Voltou"]],
    d.lote_materiais.slice().reverse().map((m) => [
      m.lote_id, loteMao[m.lote_id] || "", m.materiais ? m.materiais.nome : "", m.materiais ? m.materiais.unidade : "",
      Number(m.quantidade), Number(m.devolvido),
    ]));

  // 7. Cadastros
  escreverAba_(ss, "Mãos de obra", [["Nome"], ["Usuário"], ["Telefone"], ["Endereço"], ["Situação"], ["Cadastrado em", DATA_HORA], ["Observações"]],
    maos.map((m) => [m.nome, m.usuario, m.telefone || "", m.endereco || "", m.ativo ? "Ativo" : "Inativo", dataHora_(m.criado_em), m.observacoes || ""]));

  const nomeProd = {}; d.produtos.forEach((p) => (nomeProd[p.id] = p.nome));
  const nomeServ = {}; d.servicos.forEach((s) => (nomeServ[s.id] = s.nome));
  escreverAba_(ss, "Tabela de preços", [["Produto"], ["Serviço"], ["R$ por peça", MOEDA], ["Atualizado em", DATA_HORA]],
    d.precos.map((p) => [nomeProd[p.produto_id] || "", nomeServ[p.servico_id] || "", Number(p.valor_unitario), dataHora_(p.atualizado_em)])
      .sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1])));

  // Remove a aba vazia padrão, se existir
  ["Página1", "Sheet1", "Planilha1"].forEach((n) => {
    const s = ss.getSheetByName(n);
    if (s && ss.getSheets().length > 1 && s.getLastRow() === 0) ss.deleteSheet(s);
  });
  ss.setActiveSheet(ss.getSheetByName("Resumo do mês"));
  return d.lotes.length;
}

// Escreve uma aba inteira: colunas = [[título, formato?], ...]
function escreverAba_(ss, nome, colunas, linhas, subtitulo) {
  let aba = ss.getSheetByName(nome);
  if (!aba) aba = ss.insertSheet(nome);
  aba.clear();
  const inicio = subtitulo ? 3 : 1;
  if (subtitulo) aba.getRange(1, 1).setValue(subtitulo).setFontStyle("italic").setFontColor("#6b7180");

  const cab = aba.getRange(inicio, 1, 1, colunas.length);
  cab.setValues([colunas.map((c) => c[0])]).setFontWeight("bold").setBackground("#23324d").setFontColor("#ffffff");
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
  const ss = SpreadsheetApp.getActive();
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
// Datas
// ------------------------------------------------------------------
function agora_() { return Utilities.formatDate(new Date(), FUSO, "dd/MM/yyyy HH:mm"); }
function dataHora_(v) { return v ? new Date(v) : ""; }
function dataSimples_(v) {
  if (!v) return "";
  const p = String(v).slice(0, 10).split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}
