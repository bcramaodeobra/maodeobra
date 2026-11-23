// Edge Function: admin-usuarios
// Só o DONO pode chamar. Cria mão de obra, redefine senha e ativa/desativa acesso.
// Deploy: supabase functions deploy admin-usuarios
// Variável opcional: DOMINIO_LOGIN (padrão "bordados.app") — deve ser igual ao do site (config.js)

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DOMINIO = Deno.env.get("DOMINIO_LOGIN") ?? "bordados.app";
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

const usuarioValido = (u: string) => /^[a-z0-9._-]{3,30}$/.test(u);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // 1. Quem está chamando?
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: quem, error: errQuem } = await admin.auth.getUser(token);
  if (errQuem || !quem?.user) return resposta({ erro: "Sessão inválida. Entre novamente." }, 401);

  const { data: perfil } = await admin.from("perfis").select("papel, ativo").eq("id", quem.user.id).single();
  if (!perfil || perfil.papel !== "dono" || !perfil.ativo) {
    return resposta({ erro: "Apenas o dono pode gerenciar usuários." }, 403);
  }

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return resposta({ erro: "Dados inválidos" }, 400); }

  try {
    switch (body.acao) {
      // ---------------------------------------------------------------
      case "criar": {
        const usuario = String(body.usuario ?? "").trim().toLowerCase();
        const senha = String(body.senha ?? "");
        const nome = String(body.nome ?? "").trim();
        if (!usuarioValido(usuario)) return resposta({ erro: "Usuário: 3 a 30 caracteres, só letras minúsculas, números, ponto, - ou _." }, 400);
        if (senha.length < 6) return resposta({ erro: "A senha precisa ter pelo menos 6 caracteres." }, 400);
        if (!nome) return resposta({ erro: "Informe o nome." }, 400);

        const { data: existe } = await admin.from("perfis").select("id").eq("usuario", usuario).maybeSingle();
        if (existe) return resposta({ erro: "Este nome de usuário já existe." }, 409);

        const { data: novo, error } = await admin.auth.admin.createUser({
          email: `${usuario}@${DOMINIO}`,
          password: senha,
          email_confirm: true,
          user_metadata: { usuario, nome },
        });
        if (error) throw error;

        const { error: errPerfil } = await admin.from("perfis").insert({
          id: novo.user.id,
          usuario,
          nome,
          papel: "mao_de_obra",
          telefone: body.telefone || null,
          endereco: body.endereco || null,
          observacoes: body.observacoes || null,
        });
        if (errPerfil) {
          await admin.auth.admin.deleteUser(novo.user.id);
          throw errPerfil;
        }
        return resposta({ ok: true, id: novo.user.id });
      }

      // ---------------------------------------------------------------
      case "redefinir_senha": {
        const senha = String(body.senha ?? "");
        if (senha.length < 6) return resposta({ erro: "A senha precisa ter pelo menos 6 caracteres." }, 400);
        const { error } = await admin.auth.admin.updateUserById(body.id, { password: senha });
        if (error) throw error;
        return resposta({ ok: true });
      }

      // ---------------------------------------------------------------
      case "ativar":
      case "desativar": {
        if (body.id === quem.user.id) return resposta({ erro: "Você não pode desativar a si mesmo." }, 400);
        const ativo = body.acao === "ativar";
        const { error } = await admin.auth.admin.updateUserById(body.id, {
          ban_duration: ativo ? "none" : "876000h", // ~100 anos = bloqueado
        });
        if (error) throw error;
        await admin.from("perfis").update({ ativo }).eq("id", body.id);
        return resposta({ ok: true });
      }

      default:
        return resposta({ erro: "Ação desconhecida" }, 400);
    }
  } catch (e) {
    return resposta({ erro: (e as Error).message ?? "Erro inesperado" }, 500);
  }
});
