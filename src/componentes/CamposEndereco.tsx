"use client";

import { useState } from "react";
import { Campo, Input } from "@/componentes/ui";
import { mascararCep } from "@/lib/dominio/endereco-formato";

/**
 * Endereço, com o CEP preenchendo o resto (decisão 0014).
 *
 * ⚠️ Um componente cliente para os SEIS campos, e não só para o CEP. Preencher
 * campo irmão a partir de outro exige que alguém seja dono do estado dos dois;
 * mexer no DOM por `document.querySelector` funcionaria hoje e quebraria calado
 * na primeira vez que o React re-renderizasse a página.
 *
 * ⚠️ O CEP AJUDA, NÃO MANDA. Depois de preencher, tudo continua editável, e o
 * que a pessoa escrever por cima é o que fica. Falha de rede, CEP que a base
 * não conhece, servidor fora: nada disso bloqueia o cadastro. Endereço sem CEP
 * encontrado continua sendo endereço — zona rural, condomínio novo, exterior.
 */
export default function CamposEndereco({
  valores,
  titulo,
}: {
  valores?: {
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
  };
  titulo?: string;
}) {
  const [cep, setCep] = useState(mascararCep(valores?.cep ?? ""));
  const [logradouro, setLogradouro] = useState(valores?.logradouro ?? "");
  const [bairro, setBairro] = useState(valores?.bairro ?? "");
  const [cidade, setCidade] = useState(valores?.cidade ?? "");
  const [uf, setUf] = useState(valores?.uf ?? "");
  const [buscando, setBuscando] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  async function buscar(valor: string) {
    const digitos = valor.replace(/\D/g, "");
    if (digitos.length !== 8) return;

    setBuscando(true);
    setRecado(null);
    try {
      const r = await fetch(`/api/cep/${digitos}`);
      const { achado } = (await r.json()) as {
        achado: { logradouro: string | null; bairro: string | null; cidade: string; uf: string } | null;
      };
      if (!achado) {
        setRecado("Não achamos esse CEP. Preencha o endereço à mão — o cadastro segue normalmente.");
        return;
      }
      // ⚠️ Só preenche o que está VAZIO. Quem já digitou a rua e depois corrigiu
      // o CEP não perde o que escreveu — é o oposto de ajudar.
      setLogradouro((v) => v || (achado.logradouro ?? ""));
      setBairro((v) => v || (achado.bairro ?? ""));
      setCidade((v) => v || achado.cidade);
      setUf((v) => v || achado.uf);
    } catch {
      setRecado("A consulta de CEP não respondeu. Preencha à mão — nada se perde.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <>
      {titulo && <h3 className="sni-section-eyebrow">{titulo}</h3>}
      <div className="form-grid">
        {/* ⚠️ Sem texto de apoio fixo, mas COM o aviso de que está procurando:
            um é explicação, o outro é o estado da busca. Tirar o segundo junto
            faria o CEP preencher os campos de baixo sem nada dizer que houve
            uma consulta — e quem digita rápido veria o endereço mudar sozinho. */}
        <Campo
          label="CEP"
          dica={buscando ? "Procurando o endereço…" : undefined}
          erro={recado ?? undefined}
        >
          <Input
            name="cep"
            value={cep}
            onChange={(e) => {
              const m = mascararCep(e.target.value);
              setCep(m);
              // Busca assim que o CEP fica completo: esperar o `blur` faz a
              // pessoa sair do campo sem entender que faltava algo.
              if (m.replace(/\D/g, "").length === 8) void buscar(m);
            }}
            onBlur={(e) => void buscar(e.target.value)}
            maxLength={9}
            className="num"
            inputMode="numeric"
            placeholder="00000-000"
          />
        </Campo>
      </div>
      {/* ⚠️ A ORDEM é a do envelope: CEP, rua, número, complemento, bairro,
          cidade, UF. É a sequência em que se lê e se dita um endereço, e o CEP
          vem sozinho porque é ele que preenche o resto — emparelhá-lo com um
          campo que ele mesmo vai escrever confunde quem está digitando. */}
      <div className="form-grid">
        <Campo label="Logradouro">
          <Input name="logradouro" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} maxLength={150} />
        </Campo>
        <Campo label="Número">
          <Input name="numero" defaultValue={valores?.numero ?? ""} maxLength={20} />
        </Campo>
      </div>
      <div className="form-grid">
        <Campo label="Complemento">
          <Input name="complemento" defaultValue={valores?.complemento ?? ""} maxLength={80} />
        </Campo>
        <Campo label="Bairro">
          <Input name="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} maxLength={80} />
        </Campo>
      </div>
      <div className="form-grid">
        <Campo label="Cidade">
          <Input name="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={100} />
        </Campo>
        <Campo label="UF">
          <Input
            name="uf"
            value={uf}
            onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
            maxLength={2}
            autoCapitalize="characters"
          />
        </Campo>
      </div>
    </>
  );
}
