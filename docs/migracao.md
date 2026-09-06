# Migração dos dados de eventos (MySQL → Supabase)

Ver a decisão em `docs/decisoes/0006-migracao-repetivel.md`.

## Onde se roda cada coisa

São dois lugares diferentes, e confundi-los é a primeira pedra do caminho:

| O quê | Onde | Precisa instalar? |
|---|---|---|
| `scripts/esquema-origem.sql`, `scripts/contagens.sql` | Painel do Railway: serviço do MySQL → aba **Data** → **Query** | Não |
| `CREATE USER` / `GRANT` | Cliente MySQL de verdade (`railway connect`, TablePlus, DBeaver) | Sim |
| `npm run migrar` | Terminal da sua máquina, na pasta do projeto | Node e o repositório |

O painel do Railway executa **SQL** — mas com duas restrições que não estão
escritas em lugar nenhum e custam meia hora a quem não as conhece:

- **Uma instrução por vez.** Colar um arquivo com várias dá erro de sintaxe
  na segunda.
- **Ele acrescenta `LIMIT 100`** ao que você colou. Isso corta consulta longa
  em silêncio — e quebra qualquer DDL, porque `FLUSH PRIVILEGES LIMIT 100`
  não é SQL válido. É por isso que o `CREATE USER` não roda ali.

As consultas de `scripts/esquema-origem.sql` foram escritas para caber nessa
régua: nenhuma tem `LIMIT` próprio, e todas devolvem uma linha por TABELA (não
por coluna), o que as mantém bem abaixo de 100.

`mysqldump` não é SQL, é programa de linha de comando — por isso o retrato do
esquema vem por `scripts/esquema-origem.sql`, que faz o mesmo trabalho
consultando o `information_schema` e roda no painel, sem instalar nada.

## Antes de rodar

1. **Leia o esquema da origem.** Cole `scripts/esquema-origem.sql` no painel
   do Railway, uma consulta por vez, e guarde os quatro resultados. Só nomes
   de tabela, de coluna e tipos: nenhum dado pessoal sai daí. É o que permite
   escrever cada fase contra os nomes reais em vez de adivinhar.
2. **Rode `scripts/contagens.sql`**, no mesmo painel, e guarde os números: são
   eles que dizem o que esperar do relatório.
3. **Crie um usuário somente leitura.** Isto é DDL: não roda no painel. Abra
   um cliente de verdade — `railway connect` (CLI do Railway), TablePlus ou
   DBeaver apontando para o host da aba Variables — e rode:

   ```sql
   CREATE USER 'sni_leitura'@'%' IDENTIFIED BY 'uma-senha-longa-e-aleatoria';
   GRANT SELECT ON *.* TO 'sni_leitura'@'%';
   FLUSH PRIVILEGES;
   ```

   ⚠️ Somente leitura, e nunca o usuário da aplicação. A migração lê a base de
   produção de um sistema que está no ar: um `UPDATE` acidental ali derruba a
   venda de ingresso de quem está comprando naquele minuto.

   Este passo só é necessário na hora de rodar a migração. Para ler o esquema
   e as contagens, o painel basta.

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
