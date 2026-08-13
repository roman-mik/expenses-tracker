export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl flex flex-col gap-8">
        <span className="font-heading text-2xl">Kapa</span>

        <div className="flex flex-col gap-4">
          <h1 className="text-4xl md:text-5xl leading-[1.05] max-w-[15em]">
            One cap. Every expense in two taps. Always know what&rsquo;s left.
          </h1>
          <p className="text-ink/70 text-base leading-relaxed max-w-[40em]">
            A warm monthly spending-cap tracker. Set a number you&rsquo;d be glad
            to land under, log expenses in seconds, and always see the days left
            and what&rsquo;s safe to spend today.
          </p>
        </div>

        <div className="rounded-lg bg-surface shadow-md p-7 flex flex-col gap-5">
          <span className="text-xs font-semibold tracking-wider uppercase text-ink/50">
            Left to spend
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-5xl">65.000</span>
            <span className="font-semibold text-ink/55">RSD</span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-4 rounded-full bg-sand-300 overflow-hidden">
              <div className="h-full w-[35%] rounded-full bg-accent" />
            </div>
            <div className="flex justify-between text-sm text-ink/60">
              <span>
                <strong className="text-accent-700">35.000</strong> spent
              </span>
              <span>of 100.000</span>
            </div>
          </div>
          <p className="text-sm text-sage-700">
            Nicely paced — you&rsquo;re under an even month. Nothing to fix today.
          </p>
        </div>

        <p className="text-sm text-ink/45">
          Phase 0 scaffold — design system wired up. Real features next.
        </p>
      </div>
    </main>
  );
}
