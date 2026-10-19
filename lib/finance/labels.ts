export const ACCOUNT_TYPE_LABEL = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro / carteira",
  investment: "Investimento",
  credit_card: "Cartão de crédito",
} as const;
export type AccountType = keyof typeof ACCOUNT_TYPE_LABEL;

export const TX_TYPE_LABEL = { income: "Receita", expense: "Despesa", transfer: "Transferência" } as const;
export type TxType = keyof typeof TX_TYPE_LABEL;

export const TX_STATUS_LABEL = {
  planned: "Previsto",
  paid: "Pago",
  overdue: "Atrasado",
  cancelled: "Cancelado",
} as const;
export type TxStatus = "planned" | "paid" | "cancelled";

/** Status exibido: "previsto" com vencimento passado vira "atrasado". */
export function displayStatus(status: TxStatus, dueDate: string, today: string): keyof typeof TX_STATUS_LABEL {
  return status === "planned" && dueDate < today ? "overdue" : status;
}
