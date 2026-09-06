# Migração dos dados de eventos (MySQL → Supabase)

Ver a decisão em `docs/decisoes/0006-migracao-repetivel.md`.

## Onde se roda cada coisa

São dois lugares diferentes, e confundi-los é a primeira pedra do caminho:

| O quê | Onde | Precisa instalar? |
|---|---|---|
| `scripts/esquema-origem.sql`, `scripts/contagens.sql`, o `CREATE USER` | Serviço MySQL no Railway → aba **Console** | Não |
| `npm run migrar` | Terminal da sua máquina, na pasta do projeto | Node e o repositório |

⚠️ **Use a aba Console, não a Data.** A aba *Data → Query* serve para espiar
dados, não para extrair esquema, e falha de três jeitos diferentes:

- **Acrescenta `LIMIT 100`** ao que você cola. Corta resultado longo em
  silêncio — e quebra qualquer DDL, porque `FLUSH PRIVILEGES LIMIT 100` não é
  SQL válido.
- **Roda uma instrução por vez.** Colar um arquivo com várias dá erro de
  sintaxe na segunda.
- **Pagina de cinco em cinco linhas, sem exportar.** Um resultado de 31
  tabelas vira sete telas para copiar à mão.

A aba **Console** é um terminal dentro do container: sem paginação, sem
`LIMIT`, com o cliente `mysql` à mão e aceitando `SET SESSION` — que é o que
permite juntar as colunas de uma tabela numa linha só sem o servidor cortar em
1024 caracteres. `scripts/esquema-origem.sql` é escrito para ele: três comandos
que devolvem umas trinta linhas de texto, de um copiar-colar só.

## Antes de rodar

1. **Leia o esquema da origem.** Cole os três comandos de
   `scripts/esquema-origem.sql` no Console, um por vez, e guarde as saídas. Só
   nomes de tabela, de coluna e tipos: nenhum dado pessoal sai daí. É o que
   permite escrever cada fase contra os nomes reais em vez de adivinhar.
2. **Rode `scripts/contagens.sql`**, no mesmo Console, e guarde os números: são
   eles que dizem o que esperar do relatório.
3. **Crie um usuário somente leitura**, ainda no Console:

   ```sql
   CREATE USER 'sni_leitura'@'%' IDENTIFIED BY 'uma-senha-longa-e-aleatoria';
   GRANT SELECT ON *.* TO 'sni_leitura'@'%';
   FLUSH PRIVILEGES;
   ```

   ⚠️ Somente leitura, e nunca o usuário da aplicação. A migração lê a base de
   produção de um sistema que está no ar: um `UPDATE` acidental ali derruba a
   venda de ingresso de quem está comprando naquele minuto.

   Este passo só é necessário na hora de rodar a migração.

4. **Monte a string de conexão** com o host, a porta e o banco que aparecem na
   aba **Variables** do serviço (`MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`),
   trocando o usuário e a senha pelos que você acabou de criar. Preencha
   `MIGRACAO_MYSQL_URL` e `DATABASE_URL` (pooler do Supabase, porta 6543) no
   `.env.local`. Nunca commite esse arquivo.

## Rodando

```bash
npm run migrar -- --dry-run          # lê tudo, não grava nada, mostra o relatório
npm run migrar -- --fase=pessoas     # uma fase só
npm run migrar                       # todas as fases, em ordem
```

Cada execução grava `migracao-relatorio-<data>.json` na raiz (ignorado pelo
git). O relatório tem contagens por fase e as rejeições com motivo e id
antigo. É esse arquivo que se compartilha para discutir o resultado.

## Fases

| Fase | Origem | Destino | Estado |
|---|---|---|---|
| pessoas | `Participant` | `public.pessoas` | implementada |
| estrutura | `Regional`, `Organizacao`, `Local`, `Promotor`, `Orientador` | `public.regionais`, `public.organizacoes`, `eventos.*` | a fazer |
| eventos | `Evento`, `IngressoTipo`, `IngressoCampo`, `Combo*`, `Cupom`, `EventoOrientador` | `eventos.*` | a fazer |
| compras | `PedidoPendente`, `Inscricao`, `InscricaoResposta`, `MagicLink`, `CarrinhoAbandonado` | `eventos.*` | a fazer |
| comissao | `Comissao*` | `eventos.comissao_*` | a fazer |
| configuracao | `Configuracao`, `CieloAccount`, `RegionalPromotorEmail` | `public.configuracoes`, segredos cifrados | a fazer |
| auditoria | `AuditLog` | `public.auditoria` | a fazer |
| sequencias | — | `setval` por tabela | a fazer |

## Regras de transformação

- CPF só dígitos, com dígito verificador validado. Inválido é rejeitado.
- E-mail em branco vira `NULL`. Malformado é descartado com aviso.
- Dinheiro `DECIMAL(10,2)` → centavos inteiros.
- `TINYINT(1)` → `boolean`. `DATETIME` sem fuso → `timestamptz`, assumindo
  São Paulo.
- Regional e organização (texto livre) → tabelas estruturadas; nomes que não
  batem saem numa lista para decisão.
- Imagens em base64 → Supabase Storage; a tabela guarda a URL.
- IDs inteiros das tabelas de eventos preservados; `legado_id` em tudo.

## Amostra anonimizada

```bash
npm run amostra -- --linhas=50
```

Gera `amostra-<data>.json` com nomes, CPFs (válidos e fictícios), e-mails e
telefones trocados, preservando nulos, vazios e máscaras. Pode ser
compartilhado para testar as transformações.
