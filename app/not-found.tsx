import Link from "next/link";
import { LogoMark } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card max-w-sm space-y-4 text-center">
        <div className="flex justify-center">
          <LogoMark size={48} />
        </div>
        <h1 className="text-xl font-extrabold">Página não encontrada</h1>
        <p className="text-sm text-muted">O endereço não existe ou você não tem acesso a este workspace.</p>
        <Link href="/" className="btn">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
