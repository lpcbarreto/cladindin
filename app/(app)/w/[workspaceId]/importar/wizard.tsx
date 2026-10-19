"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import type { CategoryOption, Option } from "@/lib/transactions";
import { formatBRL } from "@/lib/finance/money";
import { formatDateBR } from "@/lib/finance/dates";
import { commitImport, previewImport } from "./actions";
import type { CommitResult, PreviewFile, PreviewRow, PreviewStatement } from "./types";

type Step = "upload" | "map" | "review" | "done";
type Edits = Record<string, { include: boolean; description: string; categoryId: string | null; reconcile: boolean }>;

const STATUS_BADGE: Record<PreviewRow["status"]["kind"], { label: string; cls: string }> = {
  new: { label: "Nova", cls: "bg-primary/15 text-primary" },
  reconcile: { label: "Conciliar", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  duplicate: { label: "Possível duplicada", cls: "bg-danger/15 text-danger" },
  imported: { label: "Já importada", cls: "bg-border text-muted" },
};

export function ImportWizard({
  workspaceId,
  accounts,
  categories,
}: {
  workspaceId: string;
  accounts: Option[];
  categories: CategoryOption[];
}) {
  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<PreviewFile[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Edits>({});
  const [results, setResults] = useState<{ label: string; result: CommitResult }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const statements = useMemo(() => preview.flatMap((f) => f.statements.map((s) => ({ file: f, s }))), [preview]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 10));
  }

  function runPreview(map: Record<string, string>) {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      files.forEach((f) => fd.append("files", f));
      Object.entries(map).forEach(([k, v]) => v && fd.set(`map:${k}`, v));
      const res = await previewImport(fd);
      if (!res.ok) return setError(res.message);
      setPreview(res.files);
      const e: Edits = {};
      res.files.forEach((f) =>
        f.statements.forEach((s) =>
          s.rows?.forEach((r) => {
            e[`${s.key}:${r.index}`] = {
              include: r.include,
              description: r.description,
              categoryId: r.suggestedCategoryId,
              reconcile: r.status.kind === "reconcile",
            };
          }),
        ),
      );
      setEdits(e);
      const unmapped = res.files.some((f) => f.statements.some((s) => !s.accountId));
      setStep(unmapped ? "map" : "review");
    });
  }

  function confirm() {
    setError(null);
    start(async () => {
      const out: typeof results = [];
      for (const { file, s } of statements) {
        if (!s.accountId || !s.rows) continue;
        const rows = s.rows
          .filter((r) => edits[`${s.key}:${r.index}`]?.include)
          .map((r) => {
            const e = edits[`${s.key}:${r.index}`];
            return {
              date: r.date,
              amountCents: r.amountCents,
              description: e.description.trim() || r.description,
              externalId: r.externalId,
              fingerprint: r.fingerprint,
              categoryId: e.categoryId,
              reconcileTxId: r.status.kind === "reconcile" && e.reconcile ? r.status.txId : null,
            };
          });
        const result = await commitImport({
          workspaceId,
          accountId: s.accountId,
          fileName: file.fileName,
          fileHash: file.fileHash,
          parser: file.parser,
          totalRows: s.rows.length,
          bankId: s.bankId,
          externalAccountId: s.externalAccountId,
          balance: s.balance,
          rows,
        });
        out.push({ label: `${file.fileName} → ${accounts.find((a) => a.id === s.accountId)?.name}`, result });
      }
      setResults(out);
      setStep("done");
    });
  }

  function reset() {
    setFiles([]);
    setPreview([]);
    setMapping({});
    setEdits({});
    setResults([]);
    setStep("upload");
  }

  const selectedCount = Object.values(edits).filter((e) => e.include).length;

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-xs text-muted">
        {["Arquivos", "Conta", "Revisão", "Concluído"].map((label, i) => {
          const active = ["upload", "map", "review", "done"].indexOf(step) >= i;
          return (
            <li key={label} className={`rounded-full border px-3 py-1 ${active ? "border-primary text-foreground" : "border-border"}`}>
              {i + 1}. {label}
            </li>
          );
        })}
      </ol>

      {error && <p className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {step === "upload" && (
        <div className="card space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center text-sm ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <p className="font-medium">Arraste os arquivos OFX aqui ou clique para escolher</p>
            <p className="text-muted">Extratos de conta e faturas de cartão em OFX. Até 10 arquivos, 5 MB cada.</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".ofx,.qfx,application/x-ofx"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>
          {files.length > 0 && (
            <ul className="space-y-1 text-sm">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex justify-between">
                  <span className="truncate">{f.name}</span>
                  <button type="button" className="text-xs text-muted hover:underline" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="btn" disabled={!files.length || pending} onClick={() => runPreview(mapping)}>
            {pending ? "Lendo arquivos..." : "Continuar"}
          </button>
        </div>
      )}

      {(step === "map" || step === "review") && (
        <FileErrors files={preview} />
      )}

      {step === "map" && (
        <div className="card space-y-4">
          <p className="text-sm">
            Não reconhecemos a conta de alguns extratos. Escolha a conta de destino; vamos lembrar da escolha nas próximas importações.
          </p>
          {statements
            .filter(({ s }) => !s.accountId)
            .map(({ file, s }) => (
              <label key={s.key} className="block text-sm">
                <span className="text-muted">
                  {file.fileName} · {s.label}
                </span>
                <select
                  className="input mt-1"
                  value={mapping[s.key] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [s.key]: e.target.value })}
                >
                  <option value="">Escolha a conta</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          {accounts.length < 2 && (
            <p className="text-xs text-muted">
              A conta ainda não existe?{" "}
              <Link href={`/w/${workspaceId}/contas`} className="underline">
                Crie em Contas e cartões
              </Link>{" "}
              e volte aqui.
            </p>
          )}
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={reset}>
              Voltar
            </button>
            <button
              className="btn"
              disabled={pending || statements.some(({ s }) => !s.accountId && !mapping[s.key])}
              onClick={() => runPreview(mapping)}
            >
              {pending ? "Analisando..." : "Analisar lançamentos"}
            </button>
          </div>
        </div>
      )}

      {step === "review" && (
        <>
          {statements.map(({ file, s }) => (
            <StatementReview
              key={s.key}
              fileName={file.fileName}
              warnings={file.warnings}
              statement={s}
              accountName={accounts.find((a) => a.id === s.accountId)?.name ?? ""}
              categories={categories}
              edits={edits}
              setEdits={setEdits}
            />
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-ghost" onClick={reset} disabled={pending}>
              Cancelar
            </button>
            <button className="btn" onClick={confirm} disabled={pending || selectedCount === 0}>
              {pending ? "Importando..." : `Importar ${selectedCount} lançamento(s)`}
            </button>
          </div>
        </>
      )}

      {step === "done" && (
        <div className="card space-y-4">
          <h2 className="font-medium">Resumo da importação</h2>
          <ul className="space-y-3 text-sm">
            {results.map(({ label, result }) => (
              <li key={label}>
                <p className="font-medium">{label}</p>
                {result.ok ? (
                  <>
                    <p>
                      {result.created} nova(s) · {result.reconciled} conciliada(s) · {result.duplicates} duplicada(s) ignorada(s)
                    </p>
                    {result.balanceCheck && <BalanceCheck {...result.balanceCheck} />}
                  </>
                ) : (
                  <p className="text-danger">{result.message}</p>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button className="btn" onClick={reset}>
              Importar outro arquivo
            </button>
            <Link href={`/w/${workspaceId}/lancamentos`} className="btn-ghost">
              Ver lançamentos
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function FileErrors({ files }: { files: PreviewFile[] }) {
  const errs = files.filter((f) => f.error);
  if (!errs.length) return null;
  return (
    <div className="space-y-2">
      {errs.map((f) => (
        <div key={f.fileName} className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="font-medium text-danger">
            {f.fileName}: {f.error!.message}
          </p>
          {f.error!.hint && <p className="text-muted">{f.error!.hint}</p>}
        </div>
      ))}
    </div>
  );
}

function BalanceCheck({ statement, system, date }: { statement: number; system: number; date: string }) {
  const diff = system - statement;
  if (diff === 0) {
    return <p className="text-primary">Saldo conferido: {formatBRL(system)} em {formatDateBR(date)}, igual ao do banco.</p>;
  }
  return (
    <p className="text-danger">
      Saldo diverge em {formatDateBR(date)}: banco {formatBRL(statement)}, sistema {formatBRL(system)} (diferença{" "}
      {formatBRL(diff)}). Confira o saldo inicial da conta ou lançamentos de antes do período importado.
    </p>
  );
}

function StatementReview({
  fileName,
  warnings,
  statement: s,
  accountName,
  categories,
  edits,
  setEdits,
}: {
  fileName: string;
  warnings: string[];
  statement: PreviewStatement;
  accountName: string;
  categories: CategoryOption[];
  edits: Edits;
  setEdits: React.Dispatch<React.SetStateAction<Edits>>;
}) {
  const rows = s.rows ?? [];
  const counts = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status.kind]: (acc[r.status.kind] ?? 0) + 1 }), {});
  const update = (k: string, patch: Partial<Edits[string]>) => setEdits((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));

  return (
    <section className="card space-y-3 p-0">
      <header className="space-y-1 p-4 pb-0">
        <h2 className="font-medium">
          {fileName} → {accountName}
        </h2>
        <p className="text-xs text-muted">
          {s.label}
          {s.startDate && ` · ${formatDateBR(s.startDate)} a ${formatDateBR(s.endDate)}`} · {counts.new ?? 0} nova(s),{" "}
          {counts.reconcile ?? 0} para conciliar, {counts.duplicate ?? 0} possível(is) duplicada(s), {counts.imported ?? 0} já
          importada(s)
        </p>
        {s.sameFileImportedAt && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Este mesmo arquivo já foi importado em {new Date(s.sameFileImportedAt).toLocaleDateString("pt-BR")}. Nada será
            duplicado.
          </p>
        )}
        {warnings.map((w) => (
          <p key={w} className="text-xs text-muted">
            ⚠ {w}
          </p>
        ))}
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-y border-border">
              <th className="w-8 p-2" />
              <th className="p-2 font-normal">Data</th>
              <th className="p-2 font-normal">Descrição</th>
              <th className="p-2 font-normal">Categoria</th>
              <th className="p-2 font-normal">Situação</th>
              <th className="p-2 text-right font-normal">Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const k = `${s.key}:${r.index}`;
              const e = edits[k];
              const disabled = r.status.kind === "imported";
              const kind = r.amountCents > 0 ? "income" : "expense";
              return (
                <tr key={k} className={`border-b border-border last:border-0 ${!e?.include ? "opacity-60" : ""}`}>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={e?.include ?? false}
                      disabled={disabled}
                      onChange={(ev) => update(k, { include: ev.target.checked })}
                      aria-label="Incluir"
                    />
                  </td>
                  <td className="p-2 whitespace-nowrap tabular-nums">{formatDateBR(r.date)}</td>
                  <td className="min-w-56 p-2">
                    <input
                      className="w-full rounded bg-transparent px-1 hover:bg-background focus:bg-background"
                      value={e?.description ?? r.description}
                      disabled={disabled || (r.status.kind === "reconcile" && e?.reconcile)}
                      onChange={(ev) => update(k, { description: ev.target.value })}
                      aria-label="Descrição"
                    />
                    {r.status.kind === "reconcile" && (
                      <label className="mt-1 flex items-center gap-1 text-xs text-muted">
                        <input type="checkbox" checked={e?.reconcile ?? false} onChange={(ev) => update(k, { reconcile: ev.target.checked })} />
                        Baixar o previsto “{r.status.description}” ({formatDateBR(r.status.date)}, {formatBRL(r.status.amountCents)})
                      </label>
                    )}
                    {r.note && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{r.note}</p>}
                  </td>
                  <td className="p-2">
                    {!(r.status.kind === "reconcile" && e?.reconcile) && !disabled && (
                      <select
                        className="input w-44 py-1"
                        value={e?.categoryId ?? ""}
                        onChange={(ev) => update(k, { categoryId: ev.target.value || null })}
                        aria-label="Categoria"
                      >
                        <option value="">Sem categoria</option>
                        {categories
                          .filter((c) => c.kind === kind)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_BADGE[r.status.kind].cls}`}>
                      {STATUS_BADGE[r.status.kind].label}
                    </span>
                  </td>
                  <td className={`p-2 text-right whitespace-nowrap tabular-nums ${r.amountCents < 0 ? "text-danger" : "text-primary"}`}>
                    {formatBRL(r.amountCents)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-muted">
                  Nenhum lançamento neste extrato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
