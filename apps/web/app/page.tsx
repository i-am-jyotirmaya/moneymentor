const expenseDraft = [
  { label: "Amount", value: "Rs 18,000" },
  { label: "Category", value: "Housing" },
  { label: "Confidence", value: "0.94" },
];

const assistantFragments = [
  {
    label: "User",
    value: "paid rent 18000",
  },
  {
    label: "MoneyMentor",
    value: "I found rent for Rs 18,000. Keep it under Housing for this month?",
  },
  {
    label: "Next",
    value: "Clarify merchant or save as a household expense.",
  },
];

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function MarkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M4.5 14.5c3.8-7.7 11.2-7.7 15 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path
        d="M7 15.5c2.3-4.2 7.7-4.2 10 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path
        d="M10 16.5h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="money-shell min-h-screen w-full overflow-hidden text-white">
      <div className="relative z-10 grid min-h-screen w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(390px,0.95fr)]">
        <section className="hidden min-h-[52vh] min-w-0 flex-col justify-between overflow-hidden px-5 py-6 sm:px-8 lg:flex lg:min-h-screen lg:px-14 lg:py-10 xl:px-20">
          <header className="flex items-center justify-between gap-4">
            <a
              href="#login"
              className="inline-flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-teal-200/80"
              aria-label="MoneyMentor login"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg border border-teal-100/20 bg-teal-100/10 text-teal-100 shadow-[0_0_38px_rgba(45,212,191,0.18)]">
                <MarkIcon />
              </span>
              <span className="text-lg font-semibold tracking-normal text-white">
                MoneyMentor
              </span>
            </a>
            <span className="hidden h-2 w-2 rounded-full bg-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.8)] sm:block" />
          </header>

          <div className="my-10 grid w-full min-w-0 max-w-5xl gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.84fr)]">
            <div className="assistant-panel relative w-full min-w-0 max-w-full overflow-hidden border border-white/12 bg-white/[0.055] p-4 shadow-2xl shadow-black/25 backdrop-blur-2xl sm:p-5">
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-teal-200/70 to-transparent" />
              <div className="flex min-h-14 items-center justify-between gap-4 border-b border-white/10 pb-4">
                <p className="min-w-0 break-words text-base font-semibold text-teal-50 sm:text-lg">
                  Ask or track anything: paid rent 18000
                </p>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-200 text-xs font-bold text-[#04110f] shadow-[0_0_26px_rgba(45,212,191,0.45)]">
                  AI
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {assistantFragments.map((item) => (
                  <div
                    className="grid gap-2 border border-white/10 bg-[#050908]/72 p-3 backdrop-blur-xl sm:grid-cols-[7rem_1fr]"
                    key={item.label}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-100/48">
                      {item.label}
                    </p>
                    <p className="min-w-0 break-words text-sm font-medium leading-6 text-white/82">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="finance-radar relative min-h-72 w-full min-w-0 max-w-full overflow-hidden border border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl sm:p-5">
              <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-teal-100/15 sm:h-56 sm:w-56" />
              <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100/15 sm:h-36 sm:w-36" />
              <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-200 shadow-[0_0_36px_rgba(45,212,191,0.8)]" />
              <div className="relative flex h-full flex-col justify-between gap-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                    Expense draft
                  </p>
                  <div className="mt-4 grid gap-3">
                    {expenseDraft.map((item) => (
                      <div
                        className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-center gap-3 border-b border-white/10 pb-3"
                        key={item.label}
                      >
                        <span className="min-w-0 break-words text-sm font-medium text-white/48">
                          {item.label}
                        </span>
                        <span className="min-w-0 break-words text-right text-sm font-semibold text-white">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border border-amber-100/14 bg-amber-100/[0.06] p-3">
                  <p className="break-words text-sm font-medium leading-6 text-amber-50/82">
                    Food delivery is up this week. Rent is on schedule.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden h-px w-full bg-gradient-to-r from-teal-100/0 via-teal-100/22 to-amber-100/0 lg:block" />
        </section>

        <section
          className="flex min-h-screen min-w-0 items-center justify-center overflow-hidden px-5 py-8 sm:px-8 lg:min-h-0 lg:px-12 lg:py-12"
          id="login"
        >
          <div className="login-panel w-full min-w-0 max-w-md overflow-hidden border border-white/14 bg-[#07100e]/84 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-8">
            <div className="mb-8">
              <p className="text-sm font-semibold text-teal-100/62">
                MoneyMentor
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-normal text-white">
                Welcome back
              </h1>
              <p className="mt-3 text-base font-medium leading-7 text-white/58">
                Continue to your finance copilot
              </p>
            </div>

            <form className="space-y-5">
              <div className="space-y-2">
                <label
                  className="block text-sm font-semibold text-white/82"
                  htmlFor="email"
                >
                  Email
                </label>
                <input
                  className="h-[3.25rem] w-full rounded-lg border border-white/12 bg-white/[0.07] px-4 text-[0.95rem] font-medium text-white outline-none transition placeholder:text-white/28 focus:border-teal-200/70 focus:bg-teal-100/[0.08] focus:ring-4 focus:ring-teal-200/10"
                  id="email"
                  name="email"
                  placeholder="name@example.com"
                  type="email"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <label
                  className="block text-sm font-semibold text-white/82"
                  htmlFor="password"
                >
                  Password
                </label>
                <input
                  className="h-[3.25rem] w-full rounded-lg border border-white/12 bg-white/[0.07] px-4 text-[0.95rem] font-medium text-white outline-none transition placeholder:text-white/28 focus:border-teal-200/70 focus:bg-teal-100/[0.08] focus:ring-4 focus:ring-teal-200/10"
                  id="password"
                  name="password"
                  placeholder="Enter your password"
                  type="password"
                  autoComplete="current-password"
                />
              </div>

              <button
                className="group relative flex h-[3.25rem] w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-teal-200 px-5 text-sm font-bold text-[#03110f] shadow-[0_18px_50px_rgba(45,212,191,0.26)] transition hover:-translate-y-0.5 hover:bg-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-100"
                type="submit"
              >
                <span className="absolute inset-y-0 left-0 w-1/3 -translate-x-full bg-gradient-to-r from-transparent via-white/55 to-transparent transition duration-700 group-hover:translate-x-[220%]" />
                <span className="relative">Sign in</span>
                <span className="relative">
                  <ArrowIcon />
                </span>
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center">
              <a
                className="rounded-lg px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-100/10 hover:text-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-100"
                href="#create-account"
              >
                Create account
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
