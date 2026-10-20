import { describe, expect, it } from "vitest";
import { categoryNamesForCnae, extractCnpj } from "./cnpj";

describe("CNPJ no histórico", () => {
  it("acha CNPJ formatado ou só dígitos e valida", () => {
    expect(extractCnpj("PIX ENVIADO SUPERMERCADO X 11.222.333/0001-81")).toBe("11222333000181");
    expect(extractCnpj("PAG BOLETO 11222333000181 ENERGIA")).toBe("11222333000181");
    expect(extractCnpj("PIX 11.222.333/0001-82")).toBeNull(); // dígito errado
  });
  it("nunca devolve CPF", () => {
    expect(extractCnpj("PIX MARIA 123.456.789-09")).toBeNull();
  });
  it("mapeia a atividade para categorias", () => {
    expect(categoryNamesForCnae("4711302")).toEqual(["Supermercado", "Alimentação"]);
    expect(categoryNamesForCnae(5611201)).toEqual(["Restaurantes", "Alimentação"]);
    expect(categoryNamesForCnae("8630503")).toEqual(["Consultas", "Saúde"]);
    expect(categoryNamesForCnae("4771701")).toEqual(["Farmácia", "Saúde"]);
    expect(categoryNamesForCnae("0111301")).toEqual([]);
  });
});
