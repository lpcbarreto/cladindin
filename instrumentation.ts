import type { Instrumentation } from "next";

/**
 * Erros do servidor vão para os logs da Vercel em JSON (fácil de filtrar por "erro_servidor").
 * Só metadados: rota, tipo e o código (digest) que aparece na tela de erro. Nada de dados financeiros.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error as Error & { digest?: string };
  console.error(
    JSON.stringify({
      evento: "erro_servidor",
      digest: err.digest,
      tipo: err.name,
      mensagem: String(err.message ?? "").slice(0, 200),
      metodo: request.method,
      rota: context.routePath,
      origem: context.routerKind + "/" + context.routeType,
    }),
  );
};
