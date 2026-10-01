# Transaction enrichment evaluation seed

`transaction-enrichment-v1.json` is a synthetic, privacy-safe seed set for the
`transaction-enrichment-v1` question schema. It is **not** a claim that Jev has
been evaluated or calibrated. PR 6 will add the executable harness, human
reviewed labels, category accuracy, essentiality error, Brier/calibration
metrics, and model-to-model comparison.

`high`, `low`, and `unknown` describe expected evidence, not exact provider
probabilities. `null` category means the available transaction text does not
justify a specific category; the capture fallback and optional clarification
policy must handle it. Category names should be checked against the live leaf
catalog before running an evaluation; the harness should fail on invalid names.

Keep paired cases (Apollo medicine/consultation/ambiguous; work charger/planned
console) to detect category anchoring and the false equivalence of discretionary
spending with impulse. Add real examples only after removing personal and
payment identifiers and obtaining the appropriate product consent.
