# 0006 — Migração de dados como script repetível, sem o dado passar por terceiros

**Situação.** Só o módulo de eventos tem dados reais em produção (MySQL no
Railway). Enquanto a plataforma nasce, a produção continua recebendo vendas.

**Decisão.** `scripts/migrar-mysql.ts` lê a origem com usuário só de leitura
e grava no Supabase por fases, com upsert por `legado_id`. Roda quantas vezes
for preciso e uma última vez na virada, trazendo o dado fresco. Imprime um
relatório de contagens e rejeições por motivo, sem dado pessoal.

**Onde roda.** Na máquina de quem tem as duas conexões, ou em
`workflow_dispatch` com os segredos no GitHub. Nunca por chat, nunca por dump
enviado a terceiros: são milhares de pessoas com CPF, endereço e vínculo com
uma instituição religiosa.

**Para testar sem dado real.** `scripts/exportar-amostra.ts` gera uma amostra
anonimizada que preserva a forma dos dados (nulos, vazios, máscaras) e pode
ser compartilhada.

**Virada.** Janela curta, fora de horário e longe de evento: congela escrita
no MySQL, roda o script pela última vez, valida com os testes de fumaça,
aponta o domínio. O MySQL fica em somente leitura por algumas semanas como
plano de retorno.
