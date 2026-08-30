# Goal planning operations

MoneyMentor calculates all amounts locally. The OpenAI model receives a minimized
JSON snapshot containing currency, aggregate income and spending categories,
commitments, conservative capacity, the goal balance, candidate contribution
amounts, and non-identifying warnings. It does not receive names, email addresses,
auth subjects, household names, merchant names, descriptions, source text,
transaction rows, or database identifiers.

The API uses the OpenAI Responses API with strict Structured Outputs and
`store: false`. `gpt-5.6-terra` is the default because it balances planning quality
and cost. Validate model choice and reasoning effort against representative goal
planning evaluations before changing it.

## Required production secrets

- `OPENAI_API_KEY`: OpenAI project API key.
- `OPENAI_SAFETY_IDENTIFIER_KEY`: at least 32 random bytes used to HMAC the local
  user identifier into a stable, non-reversible safety identifier.
- `RESEND_API_KEY`: transactional email key.

Keep these values in the deployment secret manager. Never put them in
`appsettings*.json`, container images, frontend variables, logs, traces, or support
exports. Rotate the previously committed Resend key before deployment.

For eligible OpenAI accounts, enable Zero Data Retention. API inputs and outputs
are not used for training by default, but deployment owners must confirm the
retention controls and data residency appropriate to their users.

## Data retention and consent

Users must accept the current general privacy policy before starting an AI run.
For a shared goal, another member's private aggregates are included only while that
member has active consent for that specific goal. Revocation prevents future runs
from using those aggregates. Existing completed planning runs retain their
minimized snapshot for reproducibility and are included in privacy export/deletion.

Planning jobs are durable PostgreSQL records. The background worker atomically
claims pending jobs, retries transient provider failures twice, validates the
structured response against deterministic candidates, and persists immutable plan
versions. Missing OpenAI configuration produces a visible failed run without
inventing advice.
