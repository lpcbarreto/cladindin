import Link from "next/link";

/** Estado vazio ilustrado: ícone, título, dica e um próximo passo. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: string;
  title: string;
  hint?: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="space-y-2 py-6 text-center">
      <p className="coin-float inline-block text-4xl" aria-hidden="true">
        {icon}
      </p>
      <p className="font-bold text-foreground">{title}</p>
      {hint && <p className="mx-auto max-w-sm text-sm text-muted">{hint}</p>}
      {action && (
        <Link href={action.href} className="btn-ghost mt-2 inline-flex">
          {action.label}
        </Link>
      )}
    </div>
  );
}
