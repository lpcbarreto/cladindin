# Importadores

Todos os formatos convergem para o mesmo fluxo: **arquivo → lançamentos normalizados → deduplicação/conciliação → revisão → `commit_import`**.

```
lib/importers/
  index.ts          loadBankFile(): escolhe o importador pelo conteúdo
  types.ts          ParsedTransaction / ParsedStatement / ImportError
  encoding.ts       UTF-8, Windows-1252, BOM
  normalize.ts      normalizeDescription(), fingerprint, withFingerprints()
  match.ts          classifyRows(): já importado / conciliar / duplicado / novo
  ofx/parse.ts      OFX 1.x (SGML) e 2.x (XML), conta e cartão
  csv/parse.ts      leitura, detecção de separador/cabeçalho, presets, mapeamento
  pdf/parse.ts      fatura em PDF (melhor esforço)
lib/finance/installments.ts   detecção de parcelas, divisão de valores, datas da fatura
```

## Regras que todo importador deve seguir

- `amountCents` com sinal: **negativo = saída/compra**, positivo = entrada/crédito/estorno.
- `date` em `AAAA-MM-DD`. Para cartão, é a data da compra.
- `externalId` só se o arquivo tiver um identificador estável. Se não tiver, use `null`: a deduplicação cai no fingerprint (conta + data + valor + descrição normalizada + ordem entre iguais).
- Erros que o usuário pode resolver lançam `ImportError(mensagem, dica)`. A dica diz o que fazer (ex.: "baixe em OFX").
- Nunca envie conteúdo de arquivo para serviços externos.

## Adicionar um layout de CSV de um emissor

1. Crie uma fixture **sintética** em `fixtures/csv/` (nomes e valores fictícios).
2. Em `lib/importers/csv/parse.ts`, adicione um item em `PRESETS`:
   - `match(h)`: recebe os cabeçalhos normalizados (minúsculas, sem acento) e diz se o layout é dele.
   - `mapping(h)`: índices de `date`, `description`, `amount` (ou `debit`/`credit`), `installment`, `cardholder`, além de `dateFormat` e `invert` (faturas que trazem compras positivas usam `invert: true`).
3. Adicione um teste em `csv/parse.test.ts` usando a fixture.

Se o layout não casar com nenhum preset, o `guessMapping` tenta pelo nome e pelo conteúdo das colunas, e o usuário ajusta no **mapeador**. Ao marcar "Salvar como modelo", o mapeamento fica gravado em `import_templates`, identificado pela assinatura do cabeçalho, e é aplicado sozinho nas próximas vezes.

## Adicionar um formato novo

1. Crie `lib/importers/<formato>/parse.ts` devolvendo `ParsedTransaction[]`.
2. Detecte o formato em `loadBankFile()` e devolva um novo `kind`.
3. Trate o `kind` em `previewImport()` (`app/(app)/w/[workspaceId]/importar/actions.ts`), montando o `StatementInput`.

Para um futuro **Open Finance** ou API bancária, a ideia é a mesma: um provedor que produz `ParsedStatement` e reaproveita deduplicação, conciliação e `commit_import`.

## Cartão de crédito

- A conta de destino do tipo **cartão** define o comportamento. Cada lançamento entra na **fatura** do vencimento escolhido na revisão (sugerido pelo PDF ou pelo dia de fechamento do cartão).
- **Parcelas** (`03/10`, `PARC 3/10`, `3 de 10` ou coluna "Parcela") geram um `installment_group_id`. As parcelas seguintes são **projetadas como previstas** nas próximas faturas e confirmadas quando aquela fatura for importada (casamento por `installment_key` + número + valor).
- **Pagamento da fatura** dentro do arquivo do cartão vem desmarcado. No extrato do banco, "pagamento de fatura" também vem desmarcado. O pagamento deve ser registrado com **Pagar fatura**, que cria uma transferência conta → cartão e evita contar a despesa duas vezes.
- **Estornos e créditos** são despesas com sinal positivo e reduzem o gasto, não viram receita.
- IOF, juros, multa e anuidade recebem sugestão de categoria por palavra-chave.

## PDF

A leitura usa `unpdf` (texto do PDF) e um parser de linhas `data descrição valor`, que lê também o vencimento e o "total desta fatura". PDFs escaneados ou protegidos por senha não são suportados: a mensagem orienta a baixar CSV ou OFX. A estrutura permite plugar extração por LLM no futuro, **somente com opt-in explícito** do usuário.

## PDF (extrato, fatura e comprovante)

`loadPdf` (lib/importers/index.ts) extrai o texto com unpdf e escolhe o leitor:

- **Comprovante** (Pix, boleto, transferência): `pdf/receipt.ts`. Vira um lançamento e o PDF é anexado a ele; se o lançamento já existe, só anexa.
- **Fatura de cartão** (tem "fatura" e "vencimento"): `pdf/parse.ts`.
- **Extrato bancário**: `pdf/statement.ts`, padrão "data descrição valor [D/C] [saldo]"; linhas sem data herdam a data anterior.

PDF escaneado (imagem, sem texto) não é suportado: o usuário recebe uma mensagem explicando. Exemplos em `fixtures/pdf` (gere com `node fixtures/gerar-pdfs.mjs`).

## CNPJ no histórico

Ao pré-visualizar, `extractCnpj` (lib/finance/cnpj.ts) procura um CNPJ válido na descrição (nunca CPF). `lookupCompanies` (lib/cnpj-server.ts) consulta a BrasilAPI (dados públicos da Receita, cache de 30 dias) e a atividade principal (CNAE) vira a categoria sugerida via `categoryNamesForCnae`. Prioridade: regra do usuário > histórico > atividade do CNPJ > palavras-chave. Ao gravar, o contato da empresa é criado (com o CNPJ) e ligado aos lançamentos.
