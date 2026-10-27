import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";

/** Estado vazio: ícone de traço, título, dica e um próximo passo. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: IconName;
  title: string;
  hint?: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="space-y-2 py-8 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface-2 text-muted">
        <Icon name={icon} size={20} />
      </span>
      <p className="pt-1 font-semibold text-foreground">{title}</p>
      {hint && <p className="mx-auto max-w-sm text-sm text-muted">{hint}</p>}
      {action && (
        <Link href={action.href} className="btn-ghost mt-2 inline-flex">
          {action.label}
        </Link>
      )}
    </div>
  );
}
