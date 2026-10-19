import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const { next, erro } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">Cladindin</h1>
        <p className="mb-6 text-sm text-muted">Entre para acessar suas finanças.</p>
        {erro && <p className="mb-4 text-sm text-danger">{erro}</p>}
        <LoginForm next={safeNext} />
      </div>
    </main>
  );
}
