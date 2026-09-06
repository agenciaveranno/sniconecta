# 0009 — Papel tem escopo de unidade; o resto é dado do módulo

**Situação.** A tabela `papeis` do Ciclo tem três problemas para virar tabela
de plataforma:

1. **Aponta para uma tabela de módulo.** `papeis.edicao_id` é chave
   estrangeira para `edicoes`, que é do Ciclo. A espinha da plataforma passaria
   a depender do esquema de um módulo — e a coluna **nunca é escrita** por
   nenhum código (`docs/estudo/ciclo-esquema.md`).
2. **A lista de tipos é fixa e só do Ciclo.** O `check` aceita seis valores;
   o esqueleto já declarou `eventos_admin` e `eventos_operador`, que não
   passariam.
3. **Só reconhece `sede` como nacional.** O `check` exige `localidade_id`
   preenchida para todo tipo que não seja `sede`, e os dois papéis de eventos
   são nacionais por natureza — o domínio de eventos não tem escopo
   geográfico (decisão 0003).

**Decisão.**

```
tipos_papel(codigo, nome, modulo, escopo)     catálogo, dado
papeis(pessoa_id, tipo, unidade_id, ativo)    escopo = unidade ou nacional
```

- `unidade_id` nulo significa **nacional**; preenchido, vale naquela unidade e
  nas descendentes dela na árvore (decisão 0008).
- `tipos_papel.escopo` declara qual das duas formas o tipo aceita, e um
  gatilho recusa a combinação errada. É o que o `check` fazia, mas como dado:
  papel de módulo novo entra com um `INSERT`, não com uma migração.
- `tipos_papel.modulo` diz de quem é o papel. Serve à tela de concessão e ao
  teste de minimização, que confere que papel de um módulo não recebe
  capacidade de outro.

**Escopo mais fino que unidade não é papel — é dado do módulo.** Professor de
uma turma, aluno de uma matrícula, coordenador de uma edição: isso é vínculo
do domínio, e vive na tabela do módulo que já o representa. A plataforma não
precisa saber que turma existe para dizer quem é professor; o módulo sabe, e é
ele quem responde. É o que remove `edicao_id` sem perder nada.

**Alternativa recusada — escopo genérico (`escopo_tipo` + `escopo_id` solto).**
Caberia qualquer coisa, inclusive turma e edição, sem a plataforma conhecer o
módulo. Recusada porque `escopo_id` sem chave estrangeira é integridade
referencial jogada fora na tabela que decide quem entra: uma linha apontando
para uma edição apagada vira papel que não se sabe avaliar, e o banco não
avisa.

**Consequência.** A matriz de `src/lib/permissoes.ts` continua sendo a lista
de capacidades por tipo de papel, e `podeEm(capacidade, unidadeId)` passa a
resolver pela árvore: quem tem o papel numa Regional o exerce nas Associações
Locais dela. Os tipos do Ciclo entram no catálogo com `modulo = 'ciclo'` e os
de eventos com `modulo = 'eventos'`, nacionais. `presidente_uap` fica como
tipo do Ciclo enquanto ninguém souber o que a sigla significa — promovê-lo a
cargo institucional é decisão de negócio, não de esquema
(`docs/estudo/estrutura-organizacional.md` §6-Q7).
