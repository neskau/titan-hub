# Como colocar o Titan Hub no ar

Este guia é para fazer uma vez só. Leva cerca de 1 hora. Você vai precisar de três contas, todas no nome da Titan: **GitHub** (já existe), **Supabase** e **Vercel**. As duas últimas podem ser criadas com o login do GitHub.

> Nunca mande senhas ou chaves por chat ou e-mail. Elas são coladas só nos painéis do Supabase e da Vercel.

---

## 1. Banco de dados (Supabase)

1. Entre em [supabase.com](https://supabase.com) > **New project**.
   - Nome: `titan-hub`
   - Região: **South America (São Paulo)**
   - Crie uma senha forte para o banco e guarde num gerenciador de senhas.
2. Quando o projeto terminar de criar, abra **SQL Editor** > **New query** e rode, **um de cada vez e nesta ordem**, o conteúdo de cada arquivo da pasta `supabase/migrations`:
   1. `0001_schema.sql`
   2. `0002_gestao.sql`
   3. `0003_bling.sql`
   4. `0004_revisao.sql`

   Cole o arquivo inteiro e clique em **Run**. Cada um deve terminar com "Success".
3. Rode também `supabase/seed.sql`. Ele cria os dois CDs (Matriz Cascavel e Filial Piracicaba) e **produtos de exemplo** (SKU começando com `EX-`). Depois você troca pelos produtos reais na área de gestão ou pelo Bling.
4. Em **Authentication > URL Configuration**:
   - **Site URL:** o endereço final do sistema (ex.: `https://portal.titandistribuidora.com.br`; enquanto não houver domínio, use o endereço `.vercel.app` do passo 2).
   - **Redirect URLs:** adicione `https://SEU-ENDERECO/entrar/confirmar`.
5. Em **Authentication > Providers > Email**, deixe **Confirm email** ligado.
6. Em **Project Settings > API**, você vai copiar três valores para a Vercel no passo seguinte: **Project URL**, chave **anon public** e chave **service_role**. A service_role é secreta.

## 2. Site (Vercel)

1. Entre em [vercel.com](https://vercel.com) com o GitHub da Titan > **Add New > Project** > escolha o repositório `titan-hub` > **Import**.
2. Antes de clicar em Deploy, abra **Environment Variables** e cadastre:

   | Nome | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave anon public |
   | `SUPABASE_SERVICE_ROLE_KEY` | chave service_role (secreta) |
   | `CRON_SECRET` | uma frase aleatória com 32+ caracteres (gere em um gerador de senhas) |
   | `BLING_CLIENT_ID` e `BLING_CLIENT_SECRET` | deixe em branco por enquanto (ver `docs/BLING.md`) |

3. Clique em **Deploy**. Em 2 a 3 minutos o sistema estará no ar num endereço `https://titan-hub-xxxx.vercel.app`.
4. Volte ao Supabase (passo 1.4) e confira a Site URL e a Redirect URL com esse endereço.

## 3. Primeiro administrador

1. Abra o sistema, clique em **Criar conta** e cadastre-se com o seu e-mail. Confirme pelo link que chegar.
2. No Supabase, **SQL Editor**, rode (trocando o e-mail):

   ```sql
   update perfis set papel = 'admin' where email = 'paulo@titandistribuidora.com.br';
   ```

3. Saia e entre de novo: você cai na área de **Gestão**.
4. Para as vendedoras: cada uma cria a conta em **Criar conta**, e você muda o papel delas em **Gestão > Equipe**, sem precisar de SQL. Preencha o telefone de cada uma: é o número usado no botão de WhatsApp do portal.

## 4. Domínio próprio (opcional, recomendado)

O endereço `app.titandistribuidora.com.br` hoje aponta para a plataforma do parceiro. Use outro, por exemplo `portal.titandistribuidora.com.br`:

1. Vercel > projeto > **Settings > Domains** > adicione `portal.titandistribuidora.com.br`.
2. A Vercel mostra um registro **CNAME**. Cadastre-o onde o domínio é administrado (registro.br, Cloudflare, Hostinger etc.).
3. Atualize a Site URL e a Redirect URL no Supabase (passo 1.4) para o novo endereço.

## 5. Bling

Siga `docs/BLING.md`: criar o aplicativo no Bling, colar as duas chaves na Vercel, clicar em **Conectar** e ligar cada depósito do Bling ao CD certo.

## 6. Conferência final

- [ ] Visitante abre `/catalogo` e vê produtos **sem preço**.
- [ ] Um integrador de teste cria conta, cadastra a empresa e vê "Cadastro em análise".
- [ ] Em **Gestão > Integradores**, você aprova a empresa e escolhe a vendedora responsável.
- [ ] O integrador passa a ver preço e estoque, monta um kit e fecha um pedido.
- [ ] O pedido aparece em **Gestão > Pedidos**, e o estoque do CD baixou.
- [ ] Você avança o status até "Entregue" e o integrador vê a linha do tempo atualizada.
- [ ] Ao cancelar um pedido de teste, o estoque volta.

## Em caso de problema

- **Tela de erro ao abrir o site:** confira as variáveis do passo 2 na Vercel e faça **Redeploy**.
- **Link de confirmação de e-mail não funciona:** confira a Redirect URL do passo 1.4.
- **"permission denied" ao rodar o SQL:** confirme que rodou as migrações na ordem 0001 → 0004.
- **Testes técnicos:** `npm test` (regras de negócio e Bling) e `node supabase/testes/regras-banco.mjs` (regras de acesso do banco, precisa de um Postgres local).
