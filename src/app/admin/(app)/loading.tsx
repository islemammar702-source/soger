/**
 * État de chargement commun au back-office : affiché immédiatement à chaque
 * navigation entre modules, pendant que la page lit ses données (toujours à jour).
 */
export default function AdminLoading() {
  return (
    <div aria-busy aria-label="Chargement" className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-64 animate-pulse rounded-md bg-line" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-line/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-white" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl border border-line bg-white" />
    </div>
  );
}
