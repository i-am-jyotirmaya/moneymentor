// Runs before the workspace paints. Only allow known appearance values.
const initializeAppearance = `(() => {
  let preference;
  try { preference = localStorage.getItem("spndrr-appearance"); } catch {}
  const root = document.documentElement;
  if (preference === "dark" || preference === "light") {
    root.dataset.appearance = preference;
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = preference;
  } else {
    preference = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  if (!CSS.supports("color", "light-dark(white, black)")) root.dataset.theme = preference;
})();`;

export function AppearanceInit() {
  return (
    <>
      <meta name="color-scheme" content="light dark" suppressHydrationWarning />
      <script dangerouslySetInnerHTML={{ __html: initializeAppearance }} />
    </>
  );
}
