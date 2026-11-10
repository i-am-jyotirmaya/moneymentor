import Link from "next/link";
import { PrivacyPolicyContent } from "../_components/privacy-policy-content";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-10 text-[var(--ink)] sm:px-8">
      <article className="mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-10">
        <PrivacyPolicyContent />

        <Link className="mt-10 inline-flex rounded-lg bg-[var(--ink)] px-5 py-3 text-sm font-bold text-white" href="/">
          Return to Spndrr
        </Link>
      </article>
    </main>
  );
}
