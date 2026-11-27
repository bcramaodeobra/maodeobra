// Edge Function: enviar-push
// Manda a notificação para o celular do(s) motorista(s) quando uma costureira avisa "terminei".
// É chamada pelo próprio banco (gatilho nos avisos) com o código secreto "codigo_push".
// O motorista também pode chamar para "Testar notificação" (com o login dele).
// Deploy com "Verify JWT" DESLIGADO (a proteção é feita aqui dentro).
// Secrets necessários: VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-codigo-push",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    webpush.setVapidDetails("mailto:contato@manhub.com.br", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
    const body = await req.json().catch(() => ({}));

    let destinatarios: string[] = [];
    let aviso: { title: string; body: string; tag: string };

    if (body.teste) {
      // Teste: só o próprio motorista logado
      const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
      const { data: quem } = await admin.auth.getUser(token);
      if (!quem?.user) return resposta({ erro: "Faça login novamente." }, 401);
      destinatarios = [quem.user.id];
      aviso = { title: "Notificação funcionando ✓", body: "Você vai receber aqui os lotes prontos para buscar.", tag: "teste" };
    } else {
      // Chamado pelo banco: confere o código secreto
      const { data: conf } = await admin.from("configuracoes").select("valor").eq("chave", "codigo_push").single();
      if (!conf || req.headers.get("x-codigo-push") !== conf.valor) return resposta({ erro: "não autorizado" }, 401);

      const { data: a } = await admin.from("avisos").select("id, lote_id, mao_de_obra_id, mensagem").eq("id", body.aviso_id).single();
      if (!a) return resposta({ erro: "aviso não encontrado" }, 404);
      const { data: l } = await admin.from("lotes").select("quantidade, produto_id, servico_id").eq("id", a.lote_id).single();
      const [{ data: pf }, { data: p }, { data: s }, { data: ent }] = await Promise.all([
        admin.from("perfis").select("nome").eq("id", a.mao_de_obra_id).single(),
        admin.from("produtos").select("nome").eq("id", l?.produto_id).single(),
        admin.from("servicos").select("nome").eq("id", l?.servico_id).single(),
        admin.from("entregas").select("quantidade").eq("lote_id", a.lote_id),
      ]);
      const pecas = (l?.quantidade ?? 0) - (ent ?? []).reduce((t: number, e: { quantidade: number }) => t + e.quantidade, 0);
      // Sem valores em R$: só quem, o quê e quantas peças
      aviso = {
        title: `Lote pronto: ${pf?.nome ?? "costureira"}`,
        body: `${p?.nome ?? ""} · ${s?.nome ?? ""} · ${pecas} peças${a.mensagem ? ` — "${a.mensagem}"` : ""}`,
        tag: `aviso-${a.id}`,
      };
      const { data: mot } = await admin.from("perfis").select("id").eq("papel", "motorista").eq("ativo", true);
      destinatarios = (mot ?? []).map((m: { id: string }) => m.id);
    }

    if (!destinatarios.length) return resposta({ ok: true, enviados: 0 });
    const { data: inscr } = await admin.from("push_inscricoes").select("*").in("usuario_id", destinatarios);
    let enviados = 0;
    for (const i of inscr ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          JSON.stringify({ ...aviso, url: "motorista.html" }),
          { TTL: 60 * 60 * 24 },
        );
        enviados++;
      } catch (e) {
        const cod = (e as { statusCode?: number }).statusCode;
        if (cod === 404 || cod === 410) await admin.from("push_inscricoes").delete().eq("id", i.id); // celular saiu
      }
    }
    return resposta({ ok: true, enviados });
  } catch (e) {
    return resposta({ erro: String((e as Error)?.message ?? e) }, 500);
  }
});
