// O template remonta a cada navegação: cada página entra com um leve deslize.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
