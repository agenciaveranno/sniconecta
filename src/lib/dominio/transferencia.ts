import { valorAEstornar, type InscricaoParaCancelar } from "./estorno";

/**
 * Passar uma inscrição de um evento para outro.
 *
 * É a última das três operações que `eventos.inscricoes.gerir` prometia desde
 * o começo — "transferir, trocar titular, cancelar" — e a única que mexe em
 * dinheiro, porque o ingresso de destino quase nunca custa o mesmo.
 *
 * ⚠️ ESTA CAMADA NÃO INVENTA POLÍTICA DE COBRANÇA. Ela mantém UMA invariante:
 * o que a inscrição nova registra como arrecadado é exatamente o que entrou no
 * caixa por ela. Quem decide se cobra a diferença, se cobra parte dela ou se a
 * casa absorve é quem está no balcão com a pessoa na frente — e a única coisa
 * que o sistema precisa saber é QUANTO FOI COBRADO AGORA. Qualquer regra fixa
 * aqui ("sempre cobra", "nunca cobra") seria decisão institucional escrita em
 * código, e erraria em metade dos balcões.
 */

export type InscricaoParaTransferir = InscricaoParaCancelar & {
  eventoId: number;
};

export type VeredictoTransferencia = { pode: true } | { pode: false; motivo: string };

/**
 * ⚠️ Quem JÁ ENTROU não se transfere, pela mesma razão que não se cancela: a
 * presença está registrada, e mudá-la de evento faria o relatório do evento de
 * ontem perder uma pessoa que esteve lá.
 */
export function podeTransferir(i: InscricaoParaTransferir): VeredictoTransferencia {
  if (i.checkinEm) {
    return {
      pode: false,
      motivo:
        "Esta pessoa já entrou no evento. Transferir apagaria uma presença que aconteceu — se a entrada foi engano, desfaça o check-in antes.",
    };
  }
  switch (i.status) {
    case "pago":
    case "pendente":
      return { pode: true };
    case "cancelado":
      return { pode: false, motivo: "Esta inscrição está cancelada — não há o que transferir." };
    case "expirado":
      return { pode: false, motivo: "Esta inscrição expirou sem pagamento." };
    case "transferido":
      return {
        pode: false,
        motivo: "Esta inscrição já foi transferida. Trabalhe pela inscrição nova, que é a que vale.",
      };
  }
}

export type PedidoDeAcerto = {
  /** O que a inscrição atual vale hoje, e em que situação ela está. */
  inscricao: InscricaoParaTransferir;
  /** Preço de tabela do ingresso de destino. */
  novoValorCentavos: number;
  /** Quanto o operador está recebendo AGORA, neste atendimento. */
  cobradoAgoraCentavos: number;
};

export type Acerto = {
  erros: string[];
  /** O que já tinha sido pago pela inscrição de origem. */
  pagoCentavos: number;
  /** Quanto ainda falta para o ingresso novo, antes do que se cobra agora. */
  diferencaCentavos: number;
  /** Vai em `valor_original_centavos` da inscrição nova. */
  valorOriginalCentavos: number;
  /** Vai em `desconto_centavos` da inscrição nova. */
  descontoCentavos: number;
  /** Quando o destino custa MENOS do que já foi pago: sobra a devolver. */
  estornoCentavos: number;
};

/**
 * A conta da transferência.
 *
 * ⚠️ O "pago" sai de `valorAEstornar`, e não de uma conta própria. É a mesma
 * pergunta — quanto dinheiro entrou por esta linha — e ela já trata os dois
 * casos que mordem: CORTESIA devolve zero mesmo com valor de tabela preenchido
 * (a carga trouxe cortesias com preço), e PENDENTE devolve zero porque não
 * chegou a pagar. Uma segunda conta aqui erraria os dois do mesmo jeito que
 * eles já erraram antes.
 *
 * ⚠️ E a invariante é `valorOriginal − desconto = pago + cobradoAgora`. É ela
 * que faz a arrecadação continuar fechando com o caixa depois da
 * transferência: sem ela, transferir seria uma forma silenciosa de a receita
 * do relatório subir ou descer sem ninguém ter recebido ou devolvido nada.
 */
export function acertarTransferencia({
  inscricao,
  novoValorCentavos,
  cobradoAgoraCentavos,
}: PedidoDeAcerto): Acerto {
  const erros: string[] = [];
  const pago = valorAEstornar(inscricao);
  const diferenca = novoValorCentavos - pago;

  const cobrado = Math.max(0, Math.trunc(cobradoAgoraCentavos));

  // ⚠️ Não se cobra mais do que falta. Cobrar acima da diferença deixaria a
  // pessoa pagando mais que o preço de tabela do ingresso que está levando —
  // e o desconto da linha ficaria NEGATIVO, que o banco recusa com uma
  // mensagem sobre restrição que ninguém no balcão sabe ler.
  if (cobrado > Math.max(diferenca, 0)) {
    erros.push(
      diferenca <= 0
        ? "Não há diferença a cobrar: o ingresso de destino custa o mesmo ou menos do que já foi pago."
        : `A diferença é de no máximo ${(diferenca / 100).toFixed(2).replace(".", ",")} — não dá para cobrar mais que isso.`
    );
  }

  // Inscrição que não pagou nada continua não tendo pago nada: nem desconto
  // fantasma na linha nova, nem cobrança, nem devolução.
  if (inscricao.status === "pendente") {
    if (cobrado > 0) {
      erros.push(
        "Esta inscrição ainda não foi paga. Transfira primeiro e receba o pagamento pelo balcão, para o registro dizer o que de fato aconteceu."
      );
    }
    return {
      erros,
      pagoCentavos: 0,
      diferencaCentavos: novoValorCentavos,
      valorOriginalCentavos: novoValorCentavos,
      descontoCentavos: 0,
      estornoCentavos: 0,
    };
  }

  // ⚠️ Destino mais barato: a sobra é DÍVIDA com quem pagou, e vai para a fila
  // de estorno. Ficar com ela calado faria a arrecadação registrar menos do
  // que entrou no caixa, e a diferença nunca teria dono.
  if (diferenca < 0) {
    return {
      erros,
      pagoCentavos: pago,
      diferencaCentavos: diferenca,
      valorOriginalCentavos: novoValorCentavos,
      descontoCentavos: 0,
      estornoCentavos: -diferenca,
    };
  }

  return {
    erros,
    pagoCentavos: pago,
    diferencaCentavos: diferenca,
    valorOriginalCentavos: novoValorCentavos,
    // O que não foi cobrado vira desconto: é o que mantém
    // `original − desconto` igual ao que entrou de verdade.
    descontoCentavos: Math.max(diferenca - cobrado, 0),
    estornoCentavos: 0,
  };
}
