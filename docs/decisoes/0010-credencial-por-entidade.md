# 0010 — Credencial mora no cadastro da entidade, cifrada e sem GRANT

*Aceita em 06/09/2026.*

## Problema

Cada Organização, cada Regional e cada Academia tem **conta própria na Cielo**.
O dinheiro do ingresso cai na conta de quem promove o evento, não numa conta
central: é assim que a instituição já opera, e o sistema não vai mudar isso.

Isso desmonta duas soluções óbvias:

- **Credencial em variável de ambiente.** Não são uma nem duas: são mais de
  cem, uma por entidade que vende, e mudam quando a entidade troca de conta.
  Um `CIELO_MERCHANT_KEY` global daria o dinheiro de todo mundo a uma conta só.
- **Uma tela de "integrações" à parte.** Quem cadastra a Regional já sabe por
  onde ela recebe. Separar as duas coisas garante que metade das Regionais
  fique cadastrada sem conta e ninguém descubra até a primeira venda falhar.

O SMTP tem o problema inverso — é um só para a instituição inteira — mas a
mesma restrição: a senha do provedor muda sem aviso, e enquanto o deploy não
sai, nenhum comprovante e nenhum certificado chega a ninguém.

## Decisão

Uma tabela `credenciais`, com o dono explícito e o segredo cifrado.

**O dono é uma coluna, não um texto.** `organizacao_id`, `unidade_id` ou
`local_id` — exatamente um preenchido para a Cielo, nenhum para o SMTP, que é
da instituição. Um `check` cobra isso, e um índice único por dono impede duas
contas no mesmo lugar: com duas, a venda cairia ora numa, ora noutra, conforme
a ordem que o banco devolvesse.

**O segredo vai cifrado, sempre.** AES-256-GCM por `src/lib/cripto.ts`. Um
`check` exige o prefixo `v1.` do formato — é o que barra o dia em que alguém,
depurando, gravar a senha em claro "só para testar" e ela ficar lá.

**A tabela não tem GRANT nenhum.** Nem `anon`, nem `authenticated`, nem para a
Sede. Quem lê é o servidor, com `service_role`, e devolve à tela só a parte
pública — merchant id, host, remetente — mais a informação de que existe
segredo gravado. O harness de RLS afirma isso: *"nem a Sede lê credencial pelo
cliente"*.

**A chave nunca volta para a tela.** Campo em branco mantém a que está
gravada; preenchido, troca. Se voltasse preenchida, bastaria abrir o modal com
o DevTools ligado para lê-la.

**Merchant ID em branco apaga a conta.** É o único jeito de a entidade parar
de receber. Ignorar o campo vazio faria quem limpou o cadastro sair da tela
achando que desligou a venda, com o dinheiro ainda caindo na conta antiga.

**Quem pode ter conta é catálogo, não `if` na tela.**
`tipos_unidade.aceita_conta_cielo` e `tipos_local.aceita_conta_cielo`. Hoje:
Regional e Academia (e toda Organização, que não tem tipo). No dia em que um
Núcleo passar a vender, é um `update`, não um deploy.

**Ver a conta exige `configuracao.gerir`, além de `estrutura.gerir`.** Quem
desenha a estrutura não precisa enxergar por onde entra o dinheiro. O bloco
some do formulário e a coluna some da tabela para quem não tem as duas.

## Consequências

- A venda precisa resolver de quem é a conta antes de cobrar. Sem conta
  cadastrada a entidade não vende, e a mensagem tem de dizer isso — não "erro
  ao processar".
- `SUPABASE_SERVICE_ROLE_KEY` e `CREDENCIAIS_ENCRYPTION_KEY` viram dependência
  de qualquer tela que mostre credencial. Sem a segunda, a operação estoura em
  vez de gravar em claro.
- Trocar `CREDENCIAIS_ENCRYPTION_KEY` invalida tudo que está gravado. Se um
  dia for preciso, é migração de dados: decifrar com a antiga, cifrar com a
  nova — não uma troca de variável.
