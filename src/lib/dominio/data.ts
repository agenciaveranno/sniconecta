/**
 * Datas do banco na forma que se lê no Brasil.
 *
 * Aqui e não numa tela: a mesma data aparece em mandato, em evento e em
 * inscrição, e três formatações próprias divergem na primeira que alguém
 * corrigir.
 */

/** `2026-09-01` → `01/09/2026`. Nulo vira traço, nunca a palavra "null". */
export function dataBR(iso: string | null): string {
  if (!iso) return "—";
  // ⚠️ Partido à mão, e não `new Date(iso)`: data sem hora é interpretada como
  // UTC meia-noite, e num fuso a oeste de Greenwich — o nosso — isso volta um
  // dia atrás. Toda posse do dia 1º aparecia como dia 31 do mês anterior, e o
  // mandato do CDOR, que começa em setembro, era lido como de agosto.
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}
