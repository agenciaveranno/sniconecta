# 0002 — A pessoa no centro: CPF identifica, uuid referencia

**Decisão da Sede (setembro/2026).** Cadastro único de pessoas com CPF como
chave. O módulo de eventos traz mais de 16 mil pessoas com CPF e CodSNI.

**Decisão.** `public.pessoas` é a espinha. `cpf` (`text`, só dígitos, único)
identifica; `id` (uuid) é o alvo de toda chave estrangeira. Cada módulo
pendura fatos sobre a relação da pessoa com a instituição (matrícula,
inscrição, papel) e é dono das próprias tabelas. A ficha unificada é um
read model: uma tela que lê de vários módulos, não uma tabela nova.

**Por que não CPF como FK.** LGPD: dado pessoal replicado em toda tabela,
índice e log; CPF digitado errado exigiria cascata por dezenas de tabelas;
CPF em URL vaza no histórico e no `Referer`.

**Quem vê o quê.** A visão 360º é montada por capacidade, módulo a módulo.
Coordenador do Ciclo não vê o financeiro de eventos; operador de eventos não
vê nota de prova. As capacidades já nascem com prefixo de módulo por isso
(ver `src/lib/permissoes.ts` e o teste de minimização).

**Consequência para eventos.** `Inscricao.participanteId` (inteiro) vira
`inscricoes.pessoa_id` (uuid). Os IDs inteiros das tabelas de eventos são
preservados; `legado_id` guarda o inteiro antigo da pessoa para rastrear a
migração.
