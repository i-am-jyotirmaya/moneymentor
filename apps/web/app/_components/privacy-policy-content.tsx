const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@spndrr.example";

type PrivacyPolicyContentProps = {
  // The /privacy page owns the document's h1; the in-app sheet nests the policy one level down.
  headingLevel?: 1 | 2;
};

export function PrivacyPolicyContent({ headingLevel = 1 }: PrivacyPolicyContentProps) {
  const Title = headingLevel === 1 ? "h1" : "h2";
  const Heading = headingLevel === 1 ? "h2" : "h3";
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
        Beta policy · Version 2026-07-26-ai-planning.1
      </p>
      <section className="mt-8 space-y-3">
        <Heading className="text-xl font-semibold">AI goal planning</Heading>
        <p>
          When you request an AI goal plan, Spndrr sends a minimized financial
          summary to its configured model provider. The summary contains calculated
          totals and planning constraints, not transaction descriptions, merchant
          names, account identity, email, or raw transaction history.
        </p>
        <p>
          Shared goals use another member&apos;s private aggregates only after that
          member opts in for the specific goal. Members can revoke that consent for
          future planning runs.
        </p>
      </section>
      <Title className="mt-3 text-4xl font-semibold">Spndrr beta privacy policy</Title>
      <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
        This plain-language beta policy is a product draft and must receive legal review before general availability.
      </p>

      <div className="mt-8 space-y-7 text-base leading-7 text-[var(--muted)]">
        <section>
          <Heading className="text-xl font-semibold text-[var(--ink)]">What we store</Heading>
          <p className="mt-2">We store your account profile, settings, household memberships and invitations, assistant messages, and the financial records you choose to capture.</p>
        </section>
        <section>
          <Heading className="text-xl font-semibold text-[var(--ink)]">How we use it</Heading>
          <p className="mt-2">We use your data to run Spndrr, calculate reports deterministically, deliver invitations, secure sessions, diagnose reliability problems, and improve the beta. We do not use AI-generated values as the source of truth for financial totals.</p>
        </section>
        <section>
          <Heading className="text-xl font-semibold text-[var(--ink)]">Households and visibility</Heading>
          <p className="mt-2">Private transactions remain visible only to you. Household-visible transactions can be read by active members of that household. Viewer members cannot change financial records.</p>
        </section>
        <section>
          <Heading className="text-xl font-semibold text-[var(--ink)]">Your controls</Heading>
          <p className="mt-2">You can export your data, delete accidental captures for 30 days before purge, or delete your account from Settings. Shared household records may be retained only in anonymized form so other members keep accurate totals.</p>
        </section>
        <section>
          <Heading className="text-xl font-semibold text-[var(--ink)]">Contact</Heading>
          <p className="mt-2">Questions or support requests: <a className="font-bold text-[var(--accent)] underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
        </section>
      </div>
    </>
  );
}
