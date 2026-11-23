// Edge Function: exportar-dados
// Usada pelo Google Planilhas para o backup diário. Só LÊ os dados.
// Só responde a quem enviar o código secreto (variável CODIGO_BACKUP nos Secrets do Supabase).
// Deploy com "Verify JWT" DESLIGADO (a proteção é o código secreto).

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-codigo-backup",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Compara textos sem vazar tempo (evita adivinhação do código)
function iguais(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const esperado = Deno.env.get("CODIGO_BACKUP") ?? "";
  if (esperado.length < 20) return json({ erro: "CODIGO_BACKUP não configurado no Supabase (mín. 20 caracteres)." }, 500);
  if (!iguais(req.headers.get("x-codigo-backup") ?? "", esperado)) return json({ erro: "Código secreto inválido." }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Busca tudo em páginas de 1000 linhas
  async function tudo(tabela: string, colunas = "*", ordem = "id") {
    const linhas: unknown[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await db.from(tabela).select(colunas).order(ordem, { ascending: true }).range(de, de + 999);
      if (error) throw new Error(`${tabela}: ${error.message}`);
      linhas.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return linhas;
  }

  try {
    const [maos, produtos, servicos, precos, materiais, lotes, loteMateriais, entregas, producao, resumo, fechamentos] =
      await Promise.all([
        tudo("perfis", "id, usuario, nome, papel, telefone, endereco, observacoes, ativo, criado_em", "nome"),
        tudo("produtos"),
        tudo("servicos"),
        tudo("precos"),
        tudo("materiais"),
        tudo("v_lotes"),
        tudo("lote_materiais", "*, materiais(nome, unidade)"),
        tudo("v_entregas"),
        tudo("v_producao"),
        tudo("v_resumo_mensal", "*", "mes"),
        tudo("fechamentos", "*", "mes"),
      ]);

    return json({
      gerado_em: new Date().toISOString(),
      maos_de_obra: maos, produtos, servicos, precos, materiais,
      lotes, lote_materiais: loteMateriais, entregas, producao,
      resumo_mensal: resumo, fechamentos,
    });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
