import Link from "next/link";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@moneymentor.example";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-10 text-[var(--ink)] sm:px-8">
      <article className="mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
          Beta policy · Version 2026-07-03-beta.1
        </p>
        <h1 className="mt-3 text-4xl font-semibold">MoneyMentor beta privacy policy</h1>
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          This plain-language beta policy is a product draft and must receive legal review before general availability.
        </p>

        <div className="mt-8 space-y-7 text-base leading-7 text-[var(--muted)]">
          <section>
            <h2 className="text-xl font-semibold text-[var(--ink)]">What we store</h2>
            <p className="mt-2">We store your account profile, settings, household memberships and invitations, assistant messages, and the financial records you choose to capture.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-[var(--ink)]">How we use it</h2>
            <p className="mt-2">We use your data to run MoneyMentor, calculate reports deterministically, deliver invitations, secure sessions, diagnose reliability problems, and improve the beta. We do not use AI-generated values as the source of truth for financial totals.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-[var(--ink)]">Households and visibility</h2>
            <p className="mt-2">Private transactions remain visible only to you. Household-visible transactions can be read by active members of that household. Viewer members cannot change financial records.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-[var(--ink)]">Your controls</h2>
            <p className="mt-2">You can export your data, delete accidental captures for 30 days before purge, or delete your account from Settings. Shared household records may be retained only in anonymized form so other members keep accurate totals.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-[var(--ink)]">Contact</h2>
            <p className="mt-2">Questions or support requests: <a className="font-bold text-[var(--accent)] underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
          </section>
        </div>

        <Link className="mt-10 inline-flex rounded-lg bg-[var(--ink)] px-5 py-3 text-sm font-bold text-white" href="/">
          Return to MoneyMentor
        </Link>
      </article>
    </main>
  );
}
