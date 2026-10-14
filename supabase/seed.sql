-- Dados iniciais: CDs reais da Titan + produtos de EXEMPLO (substituir pelos reais na migração)
insert into cds (id, nome, uf, matriz, prazo_entrega, fator_preco) values
  ('cascavel',   'Matriz Cascavel',   'PR', true,  '1 dia útil',   1.0000),
  ('piracicaba', 'Filial Piracicaba', 'SP', false, '1 dia útil',   1.0000)
on conflict (id) do nothing;

with p as (
  insert into produtos (sku, nome, marca, categoria, especificacao, potencia_w, potencia_kw, fase, modulos_por_estrutura, tipo_telhado) values
  ('EX-MOD-620', 'Módulo 620W N-Type TOPCon Bifacial', 'Exemplo', 'Módulos', '620 Wp · 23,0%', 620, null, null, null, null),
  ('EX-MOD-585', 'Módulo 585W Monocristalino Half-Cell', 'Exemplo', 'Módulos', '585 Wp · 22,6%', 585, null, null, null, null),
  ('EX-INV-5M',  'Inversor On-Grid 5kW Monofásico 220V', 'Exemplo', 'Inversores', '2 MPPT', null, 5, 'mono', null, null),
  ('EX-INV-8M',  'Inversor On-Grid 8kW Monofásico 220V', 'Exemplo', 'Inversores', '2 MPPT', null, 8, 'mono', null, null),
  ('EX-INV-10M', 'Inversor On-Grid 10kW Monofásico 220V', 'Exemplo', 'Inversores', '3 MPPT', null, 10, 'mono', null, null),
  ('EX-INV-15T', 'Inversor On-Grid 15kW Trifásico 380V', 'Exemplo', 'Inversores', '2 MPPT', null, 15, 'tri', null, null),
  ('EX-EST-CER', 'Estrutura Telha Cerâmica · 4 módulos', 'Exemplo', 'Estruturas', 'Alumínio', null, null, null, 4, 'ceramica'),
  ('EX-EST-MET', 'Estrutura Telha Metálica · 4 módulos', 'Exemplo', 'Estruturas', 'Minitrilho', null, null, null, 4, 'metalica'),
  ('EX-CAB-6',   'Cabo Solar 6 mm² 1,8 kV (metro)', 'Exemplo', 'Elétrica', 'Vendido por metro', null, null, null, null, null),
  ('EX-MC4',     'Par de conectores MC4', 'Exemplo', 'Elétrica', 'IP68', null, null, null, null, null),
  ('EX-SBOX',    'String Box CC 2E/1S', 'Exemplo', 'Elétrica', 'DPS + fusível', null, null, null, null, null)
  returning id, sku
)
insert into precos (produto_id, preco_base)
select id, case sku
  when 'EX-MOD-620' then 612 when 'EX-MOD-585' then 548 when 'EX-INV-5M' then 3980 when 'EX-INV-8M' then 5640
  when 'EX-INV-10M' then 6870 when 'EX-INV-15T' then 10450 when 'EX-EST-CER' then 398 when 'EX-EST-MET' then 276
  when 'EX-CAB-6' then 7.40 when 'EX-MC4' then 24 when 'EX-SBOX' then 690 end
from p;

insert into estoque (produto_id, cd_id, quantidade, minimo)
select p.id, c.id, case when c.id = 'cascavel' then 500 else 200 end, 20 from produtos p cross join cds c
on conflict do nothing;
