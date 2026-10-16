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

const arquivos = ["migrations/0001_schema.sql", "migrations/0002_gestao.sql", "migrations/0003_bling.sql", "migrations/0004_revisao.sql", "migrations/0005_crm.sql", "migrations/0006_ajustes_crm.sql", "seed.sql"];
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
await como(U.gest, "update empresas set status='aprovada', vendedora_id=$2 where id=$1", [emp, U.vend]);
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

console.log("\nRevisão (0004)");
await espera_erro(() => como(null, "select preco_no_cd($1,'cascavel')", [m620]), "visitante não lê preço pela função preco_no_cd");
await espera_erro(() => como(U.outro, "select preco_no_cd($1,'cascavel')", [m620]), "usuário sem empresa aprovada não lê preço pela função");
const pedF = (await como(U.int, "select criar_pedido('cascavel','pix',$1::jsonb,'85900000',null,-5000) id", [JSON.stringify([{ produto_id: m620, quantidade: 1 }])])).rows[0].id;
const pf = (await c.query("select subtotal, frete, total from pedidos where id=$1", [pedF])).rows[0];
ok(Number(pf.frete) === 0 && Number(pf.total) === Number(pf.subtotal), `frete enviado pelo cliente é ignorado (total R$ ${pf.total})`);
await espera_erro(() => como(U.int, "select criar_pedido('cascavel','pix',null,'85900000',null,0)"), "itens nulos não criam pedido vazio");
await c.query("update produtos set ativo=false where id=$1", [m620]);
await espera_erro(() => como(U.int, "select criar_pedido('cascavel','pix',$1::jsonb,'85900000',null,0)", [JSON.stringify([{ produto_id: m620, quantidade: 1 }])]), "produto inativo não é vendido");
await c.query("update produtos set ativo=true where id=$1", [m620]);
await c.query("update perfis set ativo=false where id=$1", [U.int]);
await espera_erro(() => como(U.int, "select criar_pedido('cascavel','pix',$1::jsonb,'85900000',null,0)", [JSON.stringify([{ produto_id: m620, quantidade: 1 }])]), "integrador desativado não compra");
ok((await como(U.int, "select count(*)::int n from precos")).rows[0].n === 0, "integrador desativado não vê preço");
await c.query("update perfis set ativo=true where id=$1", [U.int]);
await c.query("update perfis set ativo=false where id=$1", [U.gest]);
const promo = await como(U.gest, "update perfis set papel='gestor' where id=$1", [U.outro]);
ok(promo.rowCount === 0, "gestor desativado não promove ninguém");
await c.query("update perfis set ativo=true where id=$1", [U.gest]);
await espera_erro(() => como(U.vend, "update pedidos set status='cancelado' where id=$1", [pedF]), "vendedora não cancela pelo update direto (sem devolver estoque)");
await espera_erro(() => como(U.vend, "update pedidos set status='entregue' where id=$1", [pedF]), "não pula etapas do pedido");
await espera_erro(() => como(U.vend, "update pedidos set total=1 where id=$1", [pedF]), "equipe não altera o total por fora do frete");
await espera_erro(() => como(U.vend, "update pedidos set status='recebido' where id=$1", [ped]), "pedido cancelado não é reaberto");
ok((await como(U.vend, "update pedidos set status='faturado' where id=$1", [pedF])).rowCount === 1, "equipe avança o pedido para a próxima etapa");
ok((await como(U.vend, "update pedidos set frete=150, total=subtotal+150, rastreio='BR1' where id=$1", [pedF])).rowCount === 1, "equipe grava frete e rastreio");
ok((await como(U.gest, "delete from perfis where id=$1", [U.vend])).rowCount === 0, "gestor não apaga perfis pela API");
await espera_erro(() => como(U.outro, "select cadastrar_empresa('123','X LTDA',null,'Toledo','PR','45999990000','Residencial')"), "CNPJ inválido recusado pela função");
await espera_erro(() => como(U.vend, "select cadastrar_empresa('22333444000155','Y LTDA',null,'Toledo','PR','45999990000','Residencial')"), "equipe não se vincula a empresa integradora");
ok((await como(U.int, "select * from minha_vendedora()")).rows[0]?.nome === "vend", "integrador vê nome/telefone da vendedora responsável");
await espera_erro(() => como(U.gest, "select aplicar_estoque_bling('[]'::jsonb)"), "só a chave de serviço aplica o estoque do Bling");
// Bling diz 300 em Cascavel; o pedido pedF (1 un., ainda não enviado ao Bling) precisa continuar descontado.
await c.query("set role service_role");
await c.query("select aplicar_estoque_bling($1::jsonb)", [JSON.stringify([{ produto_id: m620, cd_id: "cascavel", quantidade: 300 }])]);
await c.query("reset role");
ok((await c.query("select quantidade from estoque where produto_id=$1 and cd_id='cascavel'", [m620])).rows[0].quantidade === 299, "sync do Bling desconta pedidos do Titan ainda não enviados");

console.log("\nCRM: carteira, oportunidades e cadastro pela equipe");
const V2 = "00000000-0000-0000-0000-000000000005", NOVO = "00000000-0000-0000-0000-000000000006", INT2 = "00000000-0000-0000-0000-000000000007";
for (const [id, nome] of [[V2, "vend2"], [NOVO, "novo"], [INT2, "int2"]]) await c.query("insert into auth.users values ($1, $2, $3)", [id, `${nome}@teste.com`, { nome }]);
await c.query("update perfis set papel='vendedora' where id=$1", [V2]);
ok((await como(U.vend, "select count(*)::int n from empresas where id=$1", [emp])).rows[0].n === 1, "vendedora vê a empresa da própria carteira");
ok((await como(V2, "select count(*)::int n from empresas where id=$1", [emp])).rows[0].n === 0, "outra vendedora não vê empresa fora da carteira");
ok((await como(V2, "select count(*)::int n from pedidos")).rows[0].n === 0, "outra vendedora não vê pedidos fora da carteira");
await espera_erro(() => como(V2, "select cancelar_pedido($1)", [pedF]), "vendedora não cancela pedido de outra carteira");
const emp2 = (await como(INT2, "select cadastrar_empresa('22.333.444/0001-55','Raio Sul Energia LTDA','Raio Sul','Pato Branco','PR','46999990000','Agro') id")).rows[0].id;
const op2 = (await c.query("select id, vendedora_id, origem from oportunidades where empresa_id=$1", [emp2])).rows[0];
ok(op2 && op2.vendedora_id === null && op2.origem === "portal", "cadastro no site vira oportunidade 'portal' sem dona");
ok((await como(U.vend, "select count(*)::int n from oportunidades where id=$1", [op2.id])).rows[0].n === 0, "vendedora não vê lead ainda não distribuído");
ok((await como(U.gest, "select count(*)::int n from oportunidades where id=$1", [op2.id])).rows[0].n === 1, "gestor vê lead novo para distribuir");
await espera_erro(() => como(U.vend, "update empresas set vendedora_id=$2 where id=$1", [emp, V2]), "vendedora não passa a carteira para outra");
await como(U.gest, "update empresas set vendedora_id=$2, status='aprovada' where id=$1", [emp2, V2]);
ok((await c.query("select vendedora_id from oportunidades where id=$1", [op2.id])).rows[0].vendedora_id === V2, "ao distribuir a empresa, a oportunidade vai junto");
await espera_erro(() => como(V2, "update oportunidades set vendedora_id=$2 where id=$1", [op2.id, U.vend]), "vendedora não transfere oportunidade");
const opM = (await como(U.vend, "insert into oportunidades (titulo, vendedora_id, valor_estimado, origem, cidade) values ('Solar Toledo', $1, 85000, 'indicacao', 'Toledo') returning id", [U.vend])).rows[0].id;
ok(!!opM, "vendedora cria oportunidade manual para si");
await espera_erro(() => como(U.vend, "insert into oportunidades (titulo, vendedora_id) values ('Errado', $1)", [V2]), "vendedora não cria oportunidade na carteira de outra");
await espera_erro(() => como(U.vend, "update oportunidades set etapa='perdido' where id=$1", [opM]), "perda exige motivo");
await como(U.vend, "update oportunidades set etapa='perdido', motivo_perda='Preço' where id=$1", [opM]);
ok((await c.query("select count(*)::int n from atividades where oportunidade_id=$1 and tipo='sistema'", [opM])).rows[0].n === 1, "mudança de etapa registrada na linha do tempo");
ok((await como(U.vend, "insert into atividades (oportunidade_id, tipo, descricao, autor_id) values ($1,'nota','Ligou pedindo prazo',$2) returning id", [opM, U.vend])).rowCount === 1, "vendedora registra nota na própria oportunidade");
await espera_erro(() => como(U.vend, "insert into atividades (oportunidade_id, tipo, descricao, autor_id) values ($1,'sistema','falso',$2)", [opM, U.vend]), "ninguém forja registro do sistema");
await espera_erro(() => como(V2, "insert into atividades (oportunidade_id, tipo, descricao, autor_id) values ($1,'nota','x',$2)", [opM, V2]), "outra vendedora não escreve em oportunidade alheia");
const empN = (await como(U.vend, "select equipe_cadastrar_integrador($1,'33.444.555/0001-81','Lumen Instalações LTDA','Lumen','Umuarama','PR','44999990000','Residencial','piracicaba') id", [NOVO])).rows[0].id;
const eN = (await c.query("select status, vendedora_id, cd_padrao from empresas where id=$1", [empN])).rows[0];
ok(eN.status === "aprovada" && eN.vendedora_id === U.vend && eN.cd_padrao === "piracicaba", "vendedora cadastra integrador já aprovado na carteira dela");
ok((await como(NOVO, "select count(*)::int n from precos")).rows[0].n > 0, "integrador cadastrado pela vendedora já vê preço");
ok((await c.query("select count(*)::int n from oportunidades where empresa_id=$1", [empN])).rows[0].n === 0, "cadastro pela equipe não cria lead de distribuição");
await c.query("insert into auth.users values ('00000000-0000-0000-0000-000000000008','x@teste.com','{}')");
await espera_erro(() => como(V2, "select equipe_cadastrar_integrador('00000000-0000-0000-0000-000000000008','11.222.333/0001-81','Sol Forte',null,'Toledo','PR','1','Residencial')"), "CNPJ de outra carteira é recusado");
await espera_erro(() => como(U.vend, "select equipe_cadastrar_integrador($1,'44555666000177','Outra LTDA',null,'X','PR','1','Agro')", [V2]), "não vincula membro da equipe como integrador");
await espera_erro(() => como(U.int, "select equipe_cadastrar_integrador('00000000-0000-0000-0000-000000000008','44555666000177','Outra LTDA',null,'X','PR','1','Agro')"), "integrador não usa a função da equipe");
ok((await como(U.vend, "select * from desempenho_equipe(current_date)")).rows.length === 1, "vendedora vê só o próprio desempenho");
ok((await como(U.gest, "select * from desempenho_equipe(current_date)")).rows.length >= 2, "gestor vê o desempenho da equipe");
await espera_erro(() => como(U.vend, "insert into metas values ($1, date_trunc('month', current_date)::date, 999999)", [U.vend]), "vendedora não define a própria meta");
ok((await como(U.gest, "insert into metas values ($1, date_trunc('month', current_date)::date, 500000) returning vendedora_id", [U.vend])).rowCount === 1, "gestor define meta");
ok((await c.query("select count(*)::int n from atividades where empresa_id=$1 and descricao like 'Pedido #%'", [emp])).rows[0].n >= 1, "pedido aparece na linha do tempo da empresa");

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
await c.end();

process.exit(falhas ? 1 : 0);
