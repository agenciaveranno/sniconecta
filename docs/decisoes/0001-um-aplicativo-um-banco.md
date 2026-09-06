# 0001 — Um aplicativo, um banco, módulos por pasta

**Situação.** Dois sistemas da SEICHO-NO-IE DO BRASIL: o Ciclo de Estudos
(Supabase, sem dados ainda) e o SNI Ciclo de Eventos (MySQL no Railway, em
produção). A Sede quer a pessoa no centro de tudo: curso, evento, contribuição,
compra.

**Decisão.** Um único aplicativo Next 16 e um único projeto Supabase. Cada
sistema vira um **módulo** em `src/modulos/<nome>` com suas rotas, e o que é
comum (pessoas, papéis, estrutura, auditoria, notificações, configurações,
design system) vive no schema `public` e em `src/lib`.

**Alternativa recusada.** Dois aplicativos na Vercel compartilhando o banco.
Daria login único só com domínio comum e cookie de domínio, duplicaria barra
lateral, design system e fila, e deixaria os módulos divergirem. Vale só se
os frameworks não puderem convergir — e podem, porque começamos do zero.

**Consequência.** O módulo `ciclo` sobe de Next 14 / React 18 / Tailwind 3
para Next 16 / React 19 / Tailwind 4 ao entrar. O módulo `eventos` é
reescrito sobre o novo esquema. Nenhum dos dois sistemas atuais é tocado.
