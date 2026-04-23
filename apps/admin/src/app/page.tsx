/**
 * Placeholder homepage. The real admin UI (login, driver approval queue,
 * catalog editor, KPIs) lands in A3c+ once the supply backend endpoints
 * exist. This page exists now so the workspace builds, the dev server
 * boots, and CI gates the Next.js build pipeline.
 */
export default function AdminHomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-24">
      <div className="max-w-xl text-center">
        <p className="mb-3 text-sm uppercase tracking-widest text-muted-foreground">
          Event Fleet Platform
        </p>
        <h1 className="mb-4 text-4xl font-bold tracking-tight">Admin Panel</h1>
        <p className="text-base text-muted-foreground">
          Scaffolding checkpoint (A3a). Driver approval, catalog editing and KPIs ship in A3c after
          the supply backend lands. See <code>docs/progress.md</code> for the roadmap.
        </p>
      </div>
    </main>
  );
}
