// Teste das regras do banco: precisa de um Postgres local vazio na porta 54329 (usuário postgres, sem senha) e do pacote "pg".
// Uso: node supabase/testes/regras-banco.mjs
// Roda as migrações do Titan Hub num Postgres local com "stubs" do Supabase e testa as regras.
import pg from "pg";
import fs from "node:fs";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const c = new pg.Client({ host: "localhost", port: 54329, user: "postgres", password: "x", database: "postgres" });
await c.connect();

const stub = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('role', true) $$;
grant usage on schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
`;
await c.query(stub);

const arquivos = ["migrations/0001_schema.sql", "migrations/0002_gestao.sql", "migrations/0003_bling.sql", "seed.sql"];
for (const a of arquivos) {
  try { await c.query(fs.readFileSync(`${RAIZ}/${a}`, "utf8")); console.log("OK   ", a); }
  catch (e) { console.log("ERRO ", a, "→", e.message); await c.end();  process.exit(1); }
}

let falhas = 0;
const ok = (cond, msg) => { console.log(cond ? "  ✓" : "  ✗", msg); if (!cond) falhas++; };
const como = async (uid, sql, params = []) => {
  await c.query("begin");
  try {
    await c.query(`set local role ${uid ? "authenticated" : "anon"}`);
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return r;
  } catch (e) { await c.query("rollback"); throw e; }
};
const espera_erro = async (fn, msg) => { try { await fn(); ok(false, msg + " (deveria falhar)"); } catch (e) { ok(true, `${msg} → "${e.message}"`); } };

const U = { int: "00000000-0000-0000-0000-000000000001", vend: "00000000-0000-0000-0000-000000000002", gest: "00000000-0000-0000-0000-000000000003", outro: "00000000-0000-0000-0000-000000000004" };
for (const [k, id] of Object.entries(U)) await c.query("insert into auth.users values ($1, $2, $3)", [id, `${k}@teste.com`, { nome: k }]);
ok((await c.query("select count(*)::int n from perfis")).rows[0].n === 4, "trigger cria perfil para cada usuário novo");
await c.query("update perfis set papel='vendedora' where id=$1", [U.vend]);
await c.query("update perfis set papel='gestor' where id=$1", [U.gest]);

console.log("\nVisitante");
const vis = await como(null, "select preco, estoque from catalogo limit 3");
ok(vis.rows.length > 0 && vis.rows.every((r) => r.preco === null && r.estoque === null), "vê o catálogo sem preço e sem estoque");
ok((await como(null, "select count(*)::int n from precos")).rows[0].n === 0, "não lê a tabela de preços");

console.log("\nCadastro do integrador");
const emp = (await como(U.int, "select cadastrar_empresa('11.222.333/0001-81','Sol Forte Engenharia LTDA','Sol Forte','Toledo','PR','45999990000','Residencial') id")).rows[0].id;
ok(!!emp, "cadastra empresa e fica pendente");
ok((await como(U.int, "select count(*)::int n from precos")).rows[0].n === 0, "pendente ainda não vê preço");
const m620 = (await c.query("select id from produtos where sku='EX-MOD-620'")).rows[0].id;
await espera_erro(() => como(U.int, "select criar_pedido('cascavel','pix',$1::jsonb,'85900000',null,0)", [JSON.stringify([{ produto_id: m620, quantidade: 2 }])]), "pendente não consegue fechar pedido");
await espera_erro(() => como(U.int, "update perfis set papel='admin' where id=$1", [U.int]), "integrador não vira admin sozinho");
const mudou = await como(U.int, "update empresas set status='aprovada' where id=$1", [emp]);
ok(mudou.rowCount === 0, "integrador não aprova a própria empresa");

console.log("\nAprovação pela equipe");
await como(U.vend, "update empresas set status='aprovada', vendedora_id=$2 where id=$1", [emp, U.vend]);
ok((await como(U.int, "select count(*)::int n from precos")).rows[0].n > 0, "aprovado passa a ver preço");
await espera_erro(() => como(U.vend, "update empresas set status='bloqueada' where id=$1", [emp]), "vendedora não bloqueia empresa");

console.log("\nPedido");
const ped = (await como(U.int, "select criar_pedido('cascavel','pix',$1::jsonb,'85900000','teste',0) id", [JSON.stringify([{ produto_id: m620, quantidade: 16 }])])).rows[0].id;
const p = (await c.query("select subtotal, total from pedidos where id=$1", [ped])).rows[0];
ok(Number(p.subtotal) === 16 * 612, `total calculado no banco: R$ ${p.subtotal}`);
ok((await c.query("select quantidade from estoque where produto_id=$1 and cd_id='cascavel'", [m620])).rows[0].quantidade === 484, "estoque baixou de 500 para 484");
await espera_erro(() => como(U.int, "select criar_pedido('cascavel','pix',$1::jsonb,'85900000',null,0)", [JSON.stringify([{ produto_id: m620, quantidade: 9999 }])]), "recusa pedido acima do estoque");
await espera_erro(() => como(U.int, "select criar_pedido('cascavel','boleto_faturado',$1::jsonb,'85900000',null,0)", [JSON.stringify([{ produto_id: m620, quantidade: 1 }])]), "boleto faturado bloqueado sem liberação");
ok((await como(U.outro, "select count(*)::int n from pedidos")).rows[0].n === 0, "outro usuário não vê pedidos alheios");
ok((await como(U.int, "select count(*)::int n from pedidos")).rows[0].n === 1, "integrador vê o próprio pedido");

console.log("\nEstoque e cancelamento (equipe)");
await como(U.vend, "select transferir_estoque($1,'cascavel','piracicaba',84)", [m620]);
const saldos = (await c.query("select cd_id, quantidade from estoque where produto_id=$1 order by cd_id", [m620])).rows;
ok(saldos.find((s) => s.cd_id === "cascavel").quantidade === 400 && saldos.find((s) => s.cd_id === "piracicaba").quantidade === 284, "transferência de 84 un. entre CDs");
await espera_erro(() => como(U.int, "select transferir_estoque($1,'cascavel','piracicaba',1)", [m620]), "integrador não transfere estoque");
await como(U.vend, "select cancelar_pedido($1)", [ped]);
ok((await c.query("select quantidade from estoque where produto_id=$1 and cd_id='cascavel'", [m620])).rows[0].quantidade === 416, "cancelamento devolve 16 un. ao CD");
await espera_erro(() => como(U.vend, "select cancelar_pedido($1)", [ped]), "não cancela duas vezes");
await como(U.gest, "select ajustar_estoque($1,'piracicaba',300,50)", [m620]);
ok((await c.query("select count(*)::int n from movimentos_estoque where motivo='ajuste'")).rows[0].n === 1, "ajuste manual fica registrado");

console.log("\nBling");
await espera_erro(() => como(U.gest, "select * from integracao_bling"), "tokens do Bling inacessíveis até para gestor");

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
await c.end();

process.exit(falhas ? 1 : 0);
