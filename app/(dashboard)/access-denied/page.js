export default function AccessDeniedPage() {
  return (
    <section className="mx-auto max-w-lg rounded-2xl border border-border bg-surface p-6">
      <h1 className="text-xl font-semibold text-foreground">Section access denied</h1>
      <p className="mt-2 text-sm text-muted">
        Open an available section from the menu or ask your administrator to update your access.
      </p>
    </section>
  );
}
