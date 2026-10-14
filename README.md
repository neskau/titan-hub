# Titan Hub

Sistema próprio da **Titan Distribuidora Solar**: portal de compras para integradores e área de gestão comercial (pedidos, integradores, estoque por CD, produtos e datasheets), integrado ao ERP Bling.

- **Tecnologia:** Next.js 14 (App Router) + Supabase (Postgres, Auth, Storage), hospedado na Vercel.
- **Colocar no ar:** [docs/INSTALACAO.md](docs/INSTALACAO.md)
- **Integração Bling:** [docs/BLING.md](docs/BLING.md)

## Estrutura

| Caminho | O que é |
| --- | --- |
| `src/app/catalogo` | Catálogo público (sem preço) |
| `src/app/entrar`, `src/app/cadastro` | Login, conta e cadastro da empresa por CNPJ |
| `src/app/portal` | Área do integrador: catálogo por CD, monte seu kit, carrinho, pedidos |
| `src/app/gestao` | Área da equipe: dashboard, pedidos, integradores, estoque, produtos, equipe |
| `src/app/api/bling` | Conexão OAuth e sincronização com o Bling |
| `src/lib/dominio` | Regras de negócio puras (kit, payback) com testes |
| `supabase/migrations` | Banco de dados e regras de acesso — rodar em ordem |
| `supabase/testes` | Teste das regras de acesso do banco |

## Desenvolvimento

```bash
cp .env.example .env.local   # preencher com as chaves do Supabase
npm install
npm run dev                  # http://localhost:3000
npm test                     # testes de regras de negócio e Bling
```
