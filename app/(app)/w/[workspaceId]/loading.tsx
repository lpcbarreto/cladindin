export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Carregando">
      <div className="h-9 w-56 rounded-xl bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-[1.25rem] bg-surface-2" />
        ))}
      </div>
      <div className="h-64 rounded-[1.25rem] bg-surface-2" />
    </div>
  );
}
