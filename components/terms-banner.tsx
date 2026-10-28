import Link from "next/link";
import { acceptCurrentTerms } from "@/app/(app)/w/[workspaceId]/configuracoes/account-actions";

/** Mostrado quando os Termos/Política mudaram desde o último aceite da pessoa. */
export function TermsBanner({ firstTime }: { firstTime: boolean }) {
  return (
    <div role="region" aria-label="Atualização dos termos" className="mb-6 flex flex-col gap-3 rounded-[14px] border border-border bg-surface-2 p-4 text-sm sm:flex-row sm:items-center">
      <p className="flex-1">
        {firstTime ? "Publicamos nossos " : "Atualizamos nossos "}
        <Link href="/termos" target="_blank" className="font-medium text-primary underline-offset-2 hover:underline">
          Termos de Serviço
        </Link>{" "}
        e a{" "}
        <Link href="/privacidade" target="_blank" className="font-medium text-primary underline-offset-2 hover:underline">
          Política de Privacidade
        </Link>
        . Leia e confirme para continuar usando o Cladindin.
      </p>
      <form action={acceptCurrentTerms}>
        <button className="btn shrink-0">Li e aceito</button>
      </form>
    </div>
  );
}
