# Controle de Mão de Obra — Fábrica de Bordados

Sistema web para o dono da fábrica enviar lotes às mãos de obra externas, conferir as entregas e fechar o pagamento do mês. Cada mão de obra tem login próprio e acompanha seus lotes e o valor acumulado no mês.

- **Site:** HTML + JavaScript puro, sem compilação → GitHub Pages
- **Banco, login e funções:** Supabase

## Como funciona

1. **Dono envia um lote** com mão de obra, produto, serviço, quantidade, prazo e materiais. O valor por peça vem da tabela de preços e fica **congelado no lote**.
2. **Mão de obra confirma que recebeu**, lança a produção do dia e registra entregas (pode entregar em partes).
3. **Dono confere cada entrega:** informa quantas peças foram aprovadas (essas são pagas) e quantas voltam para refazer (voltam para o saldo do lote). A diferença conta como perda e não é paga.
4. **Fechamento:** soma tudo que foi conferido no mês, por mão de obra. Ao clicar em "Fechar e pagar", o mês fica travado. Dá para imprimir o recibo e reabrir o mês se algo foi feito por engano.

---

## Instalação (uma vez só)

### 1. Supabase — criar o projeto e o banco
1. Crie um projeto em <https://supabase.com>.
2. Abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Authentication → Sign In / Providers → Email**, **desative** a opção "Allow new users to sign up". Só o dono cria os acessos.

### 2. Criar a conta do dono
1. Em **Authentication → Users → Add user → Create new user**:
   - E-mail: `dono@bordados.app` (o usuário de login vai ser `dono`)
   - Senha: a que você quiser
   - Marque **Auto Confirm User**
2. No **SQL Editor**, rode:
   ```sql
   insert into public.perfis (id, usuario, nome, papel)
   select id, 'dono', 'Seu Nome', 'dono' from auth.users where email = 'dono@bordados.app';
   ```

> O domínio `bordados.app` é só interno (não precisa existir). Se trocar, troque também em `web/config.js` e na variável `DOMINIO_LOGIN` da função.

### 3. Publicar a função de usuários (Edge Function)
É ela que permite ao dono criar mãos de obra e redefinir senhas com segurança.

**Pelo painel (mais fácil):** **Edge Functions → Deploy a new function → Via Editor**, com o nome `admin-usuarios`. Cole o conteúdo de `supabase/functions/admin-usuarios/index.ts` e clique em **Deploy**.

**Ou pela linha de comando:**
```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase functions deploy admin-usuarios
```
(Opcional) Se usar outro domínio, crie o segredo `DOMINIO_LOGIN` em **Edge Functions → Secrets**.

### 4. Configurar o site
Edite `web/config.js` com os dados de **Project Settings → API**:
- `SUPABASE_URL` → Project URL
- `SUPABASE_ANON_KEY` → chave `anon` / `publishable` (é pública, pode ficar no site)

> ⚠️ **Nunca** coloque a chave `service_role` / `secret` no site.

### 5. GitHub Pages
1. Crie um repositório no GitHub e envie esta pasta inteira.
2. No repositório, vá em **Settings → Pages → Source: GitHub Actions**.
3. A cada `push` na branch `main`, o site é publicado sozinho (veja a aba **Actions**).
4. O endereço fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

### 6. Primeiro uso
Entre como `dono` e vá em **Cadastros**, nesta ordem:
1. **Produtos** (ex.: Toalha de banho, Jaleco)
2. **Serviços** (ex.: Bordado de nome, Arremate)
3. **Preços** (o valor pago por peça para cada produto + serviço)
4. **Materiais** (opcional: linhas, entretelas…)
5. **Mãos de obra:** cria o usuário e a senha inicial de cada uma

Depois é só usar **Enviar novo lote**.

---

## Estrutura

```
supabase/
  schema.sql                      tabelas, cálculos, regras e segurança (RLS)
  functions/admin-usuarios/       criar mão de obra, redefinir senha, ativar/desativar
web/                              site publicado no GitHub Pages
  index.html                      login
  dono.html   + js/dono.js        painel do dono
  producao.html + js/mao-de-obra.js  painel da mão de obra
  js/comum.js                     login, formatação, janelas
  config.js                       ⚙️ dados do Supabase
.github/workflows/pages.yml       publicação automática
```

## Segurança
- Cada mão de obra só enxerga os próprios lotes, entregas e pagamentos. Isso é garantido **no banco** (Row Level Security), não só na tela.
- A mão de obra não consegue alterar valores nem quantidades. Ela só usa as ações permitidas: confirmar recebimento, lançar produção e registrar entrega.
- Um mês fechado fica travado: nenhuma entrega dele pode ser conferida ou desfeita sem antes reabrir o fechamento.
- Ao desativar uma mão de obra, o login dela é bloqueado na hora.

## Próximas fases (sugestão)
- Vales e adiantamentos descontados no fechamento
- Fotos do lote na saída e na volta (Supabase Storage)
- Instalar como app no celular (PWA)
- Relatórios de produtividade por mão de obra e produto

## Backups
- `supabase/functions/exportar-dados/` → função que o Google Planilhas usa para ler os dados (protegida por código secreto `CODIGO_BACKUP`; publicar com "Verify JWT" desligado).
- `google-planilhas/Codigo.gs` → script colado na planilha (Extensões → Apps Script). Atualiza as abas e salva uma cópia por dia no Google Drive.
- O backup completo do banco fica num **repositório privado separado** (arquivo `controle-bordados-backup.zip`), com o segredo `SUPABASE_DB_URL` (Session pooler).
