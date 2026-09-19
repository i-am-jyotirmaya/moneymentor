export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-[var(--border)] ${className}`}
    />
  );
}

export function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <section
      role="status"
      aria-label="Loading content"
      aria-busy="true"
      className="w-full space-y-5 p-4 lg:p-0"
    >
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="space-y-4 rounded-lg border border-[var(--border)] bg-white p-5">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
      <span className="sr-only">Loading content</span>
    </section>
  );
}

export function WorkspaceSkeleton() {
  return (
    <main className="flex min-h-dvh gap-6 p-5" aria-label="Loading workspace">
      <LoadingBar active />
      <Skeleton className="hidden w-64 shrink-0 lg:block" />
      <SectionSkeleton />
    </main>
  );
}

export function LoadingBar({ active }: { active: boolean }) {
  return active ? (
    <div role="progressbar" aria-label="Loading page" className="page-progress">
      <div />
    </div>
  ) : null;
}
