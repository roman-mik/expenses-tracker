/**
 * Instant navigation shell for Home. Next paints this the moment navigation
 * starts (before the server component's Supabase reads resolve), so moving
 * between pages feels immediate instead of blocking on the network.
 */
export default function HomeLoading() {
  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      <div className="w-full max-w-xl flex flex-col gap-8 animate-pulse">
        <header className="flex items-center justify-between">
          <span className="font-heading text-2xl">Kapa</span>
          <div className="flex items-center gap-3">
            <div className="h-9 w-24 rounded-lg bg-sand-200" />
            <div className="h-9 w-24 rounded-lg bg-sand-200" />
          </div>
        </header>

        <section className="rounded-lg bg-surface shadow-md p-7 flex flex-col gap-5">
          <div className="h-3 w-24 rounded bg-sand-200" />
          <div className="h-12 w-48 rounded bg-sand-200" />
          <div className="h-3 w-full rounded-full bg-sand-200" />
          <div className="flex gap-6">
            <div className="h-4 w-28 rounded bg-sand-200" />
            <div className="h-4 w-28 rounded bg-sand-200" />
          </div>
        </section>

        <div className="h-14 w-full rounded-lg bg-sand-200" />

        <section className="flex flex-col gap-3">
          <div className="h-3 w-16 rounded bg-sand-200" />
          <div className="h-16 w-full rounded-lg bg-sand-200" />
        </section>
      </div>
    </main>
  );
}
