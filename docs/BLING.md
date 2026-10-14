# Integração Titan Hub × Bling — passo a passo

Este guia explica como ligar o Titan Hub ao Bling. Depois de ligado, o sistema faz três coisas sozinho:

1. **Produtos e preços**: a cada sincronização, lê os produtos do Bling e atualiza o preço no Titan. A ligação entre os dois é o **código (SKU)** do produto no Bling. Se aparecer um código que o Titan ainda não tem, o produto é criado **inativo**, para a equipe completar categoria, marca e dados técnicos antes de ativar.
2. **Estoque**: lê o saldo de cada depósito do Bling e atualiza o estoque de cada CD (Cascavel, Piracicaba). Toda mudança fica registrada no histórico de movimentos com o motivo "sync_bling".
3. **Pedidos**: a equipe pode enviar um pedido do Titan para o Bling, que vira um **pedido de venda**. Se o cliente ainda não existir no Bling, o sistema cria o contato pelo CNPJ.

> Enquanto o Bling não estiver conectado, o resto do Titan Hub funciona normalmente. As funções do Bling só respondem "Bling não conectado".

---

## 1. Rodar o SQL no Supabase (uma vez)

No Supabase, abra **SQL Editor**, cole todo o conteúdo do arquivo `supabase/migrations/0003_bling.sql` e clique em **Run**.

Esse arquivo cria três tabelas:
- `integracao_bling`: guarda as chaves de acesso. Ninguém consegue ler essa tabela pelo navegador, só o servidor.
- `bling_depositos`: diz qual depósito do Bling corresponde a qual CD.
- `bling_sincronizacoes`: histórico de cada sincronização, que a equipe pode consultar.

## 2. Criar o aplicativo no Bling

1. Entre no Bling com um usuário **administrador**.
2. Vá em **Central de Extensões → Área do Integrador** (o mesmo caminho aparece em https://developer.bling.com.br, em "Aplicativos"). Clique em **Criar aplicativo** e escolha o tipo **API / uso próprio (privado)**.
3. Preencha:
   - **Nome**: Titan Hub
   - **Link de redirecionamento (URL de callback)**: `https://SEU-DOMINIO/api/bling/callback`
     - Troque `SEU-DOMINIO` pelo endereço do Titan Hub na Vercel, por exemplo `https://titan-hub.vercel.app/api/bling/callback` ou o domínio próprio.
     - O endereço precisa ser **exatamente** igual, com `https`, sem barra no final.
4. Em **Escopos** (permissões), marque:
   - **Produtos** (leitura)
   - **Estoques** / **Controle de estoque** (leitura)
   - **Depósitos** (leitura)
   - **Pedidos de venda** (leitura e escrita)
   - **Contatos** (leitura e escrita)
   > Atenção: se os escopos forem alterados depois, o Bling derruba a conexão e será preciso clicar em "Conectar Bling" de novo.
5. Salve. O Bling mostra o **Client ID** e o **Client Secret**. Copie os dois e não mande o Client Secret por WhatsApp ou e-mail.

## 3. Colocar as chaves na Vercel

Na Vercel, abra o projeto Titan Hub e vá em **Settings → Environment Variables**. Cadastre as variáveis abaixo em **Production** (e em Preview, se for usar):

| Variável | Valor |
|---|---|
| `BLING_CLIENT_ID` | o Client ID do Bling |
| `BLING_CLIENT_SECRET` | o Client Secret do Bling |
| `CRON_SECRET` | uma senha longa e aleatória, com pelo menos 16 caracteres. Para gerar uma, rode `openssl rand -hex 32` ou use um gerador de senhas. |
| `SUPABASE_SERVICE_ROLE_KEY` | normalmente já está cadastrada |

Depois de salvar as variáveis, faça um **Redeploy** (aba Deployments → ⋯ → Redeploy) para que elas passem a valer.

## 4. Conectar

1. Entre no Titan Hub com um usuário **gestor** ou **admin**.
2. Abra no navegador: `https://SEU-DOMINIO/api/bling/conectar`
3. O Bling vai pedir login e autorização. Clique em **Autorizar**.
4. Você volta para `/gestao?bling=conectado`. A partir daí, o sistema renova o acesso sozinho:
   - a chave de acesso vale cerca de 6 horas e é renovada automaticamente;
   - a chave de renovação vale 30 dias e se renova a cada uso.

   Com a sincronização automática rodando, ninguém precisa reconectar. Se o sistema ficar mais de 30 dias sem falar com o Bling, repita este passo.

## 5. Ligar depósitos do Bling aos CDs

O Bling separa o estoque por **depósito**, e o Titan separa por **CD**. É preciso informar qual depósito corresponde a qual CD.

**Descobrir o número (id) de cada depósito:** no Bling, abra **Estoque → Depósitos** e clique no depósito. O número aparece no endereço da página (`.../depositos/edit/12345678`). Se não aparecer, peça ao desenvolvedor para consultar `GET /depositos` da API.

**Cadastrar no Supabase** (SQL Editor). Troque os números pelos seus:

```sql
insert into bling_depositos (deposito_id, cd_id, descricao) values
  (14887654321, 'cascavel',   'Depósito Geral - Cascavel'),
  (14887654322, 'piracicaba', 'Filial Piracicaba');

-- Conferir:
select d.*, c.nome from bling_depositos d join cds c on c.id = d.cd_id;
```

- Se dois depósitos apontarem para o mesmo CD, os saldos são **somados**.
- Depósito que não estiver nessa tabela é **ignorado**.
- O estoque usado é o **saldo virtual** do Bling: o saldo físico menos o que já está reservado em pedidos.

## 6. Sincronização automática

O arquivo `vercel.json` agenda uma chamada a `/api/bling/sync` **uma vez por dia, às 6h de Brasília** (`0 9 * * *`, porque a Vercel usa horário UTC). Ela atualiza primeiro os produtos e depois o estoque. A Vercel envia o `CRON_SECRET` sozinha.

> **Quer atualizar mais vezes ao dia?** O plano gratuito (Hobby) da Vercel só permite uma execução diária. Para rodar a cada 30 minutos, há duas saídas: passar para o plano Pro e trocar o `schedule` por `*/30 * * * *`, ou usar um serviço externo gratuito, como cron-job.org, chamando a URL com o cabeçalho abaixo.

**Rodar na mão** (para testar):

```bash
curl -X POST https://SEU-DOMINIO/api/bling/sync \
  -H "Authorization: Bearer SEU_CRON_SECRET"
# só produtos:  .../api/bling/sync?so=produtos
# só estoque:   .../api/bling/sync?so=estoque
```

**Ver o histórico** (SQL Editor):

```sql
select tipo, inicio, fim, ok, mensagem, contadores
from bling_sincronizacoes order by inicio desc limit 20;
```

**Produtos novos criados pela sincronização** (para completar e ativar):

```sql
select sku, nome, categoria, marca from produtos
where ativo = false and bling_produto_id is not null order by criado_em desc;
```

## 7. Enviar um pedido ao Bling

Um usuário da equipe (vendedora, gestor ou admin), logado, faz `POST /api/bling/pedido/<id-do-pedido>`. O botão na tela de gestão chama esse endereço.

- O pedido aparece no Bling com o **número da loja** `TITAN-<número>`. Ele não é duplicado, mesmo que o botão seja clicado duas vezes.
- Todos os produtos do pedido precisam ter vínculo com o Bling. Para isso, rode a sincronização de produtos antes.

## 8. Se der erro

| Mensagem | O que fazer |
|---|---|
| **Bling não conectado** | Faça o passo 4. |
| **Bling não conectado: a autorização expirou ou foi revogada** | Os escopos mudaram, o app foi reinstalado ou a conexão ficou mais de 30 dias parada. Repita o passo 4. |
| **BLING_CLIENT_ID / BLING_CLIENT_SECRET não configurados** | Faça o passo 3 e depois o Redeploy. |
| **Link de conexão expirado ou inválido** | Você levou mais de 10 minutos ou abriu o link em outro navegador. Abra `/api/bling/conectar` de novo. |
| **Bling recusou o token: invalid_grant / redirect_uri** | O link de redirecionamento no app do Bling está diferente do domínio. Confira o passo 2.3. |
| **Nenhum depósito do Bling mapeado para CD** | Faça o passo 5. |
| **Produtos sem vínculo com o Bling: SKU...** | Esses SKUs não existem no Bling ou o código está diferente. Corrija o código e rode `?so=produtos`. |
| **Não autorizado** (sync) | O `CRON_SECRET` da chamada está diferente do cadastrado na Vercel. |
| HTTP **429** / "limite" | O Bling permite 3 requisições por segundo e 120 mil por dia. O sistema espera e tenta de novo sozinho. Se o erro continuar, espere alguns minutos. |

Se nada disso resolver, consulte `bling_sincronizacoes` (passo 6) e mande a coluna `mensagem` para o desenvolvedor. Essa mensagem nunca contém senhas nem chaves.

## Referências

- Documentação da API v3: https://developer.bling.com.br
- Autenticação (OAuth): https://developer.bling.com.br/aplicativos
- Limites de requisições: https://developer.bling.com.br/limites
- Tokens JWT: https://developer.bling.com.br/migracao-jwt
