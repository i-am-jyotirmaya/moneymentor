# Spndrr entity extraction lab

A standalone Python experiment for English entity extraction. Run **one model at
a time**, save results, let that process exit, then run the next model. Comparing
results never loads a model. No Spndrr API, database, Docker, GPU, or AWS account is
needed for local models. This directory is not part of the production capture flow.

## Start locally (Windows PowerShell)

Use Python **3.12**, 64-bit. From the repository root:

```powershell
cd tools/entity-extraction-lab
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install "torch>=2.1,<3" --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python lab.py serve
```

Open **http://127.0.0.1:8765**. Pick small first, try your own statements, then run
the seed benchmark. After the run exits, select base and repeat. The UI starts a
fresh subprocess for each job; Stop waits for its exit before allowing another.
Ctrl-C in the server terminal also stops its active worker. A forcibly killed
server may leave its worker running; stop that Python worker before restarting.

**Updating an earlier lab checkout:** pull this branch, restart the server, refresh
the browser and rerun both models. Runs marked `shared_guidance_v0` used a shared
classification prompt that caused base to overpredict `mixed`. New local runs use
`task_labels_only_v1`. The UI now separates entity F1, intent accuracy, category
accuracy and all-exact accuracy. Old reports remain readable and keep their
original predictions; they are not silently relabelled or rescored as new runs.

No virtual-environment activation is needed. On Linux/macOS, replace `py -3.12`
with `python3.12` and `.venv\Scripts\python` with `.venv/bin/python`. On macOS,
install PyTorch with `python -m pip install "torch>=2.1,<3"` from normal PyPI
instead of the CPU index. These experiments deliberately use CPU on all platforms.

First inference downloads only the selected checkpoint into Hugging Face's cache.
Both checkpoints can remain on disk; only the selected one is loaded in memory.
The small model's weight size is not its total RAM requirement: Python, PyTorch,
tokenization, and intermediate tensors also consume memory. Measure local RSS.
Use `--threads 2` in the CLI if four CPU threads make the laptop unresponsive.

## Candidates

| CLI model | Checkpoint / runtime | Purpose |
|---|---|---|
| `gliner-small` | `fastino/gliner2.5-small-v1`, 74M, FP32 CPU | First candidate for a laptop / CPU server |
| `gliner-base` | `fastino/gliner2.5-base-v1`, 194M, FP32 CPU | Check whether extra accuracy justifies more RAM and latency |
| `bedrock` | Explicit Converse model/inference-profile ID | Optional managed comparator; no local weights |

The local adapter uses **`AutoExtractor` from `gliner2[local]==2.1.0`**; the legacy
`GLiNER2` loader does not load these boundary checkpoints correctly. We resolve a
Hub snapshot and load its local directory, recording the resolved commit. To pin
a future run, pass `--revision <resolved_revision from previous JSON>`. After the
first successful download, use `--offline` to require cached files. Set `HF_HOME`
before starting Python if you want a different cache location.

GLiNER receives the entity descriptions and each classification task's allowed
labels. `classification_guidance` is still the annotation policy and is sent to
the generative Bedrock adapter, but is no longer repeated as a GLiNER task prompt.
On the 48-case seed set, removing that shared prompt from the base schema changed
intent accuracy from 6/48 to 41/48 while keeping the same checkpoint, labels and
entity threshold. This is a diagnostic result, not a held-out production score.
Do not remove the `mixed` label or alter gold answers to hide incorrect predictions.

Qwen/NuExtract, quantization, fine-tuning, and GPU comparisons are future adapters.
This first experiment intentionally starts with the two small English extractors.

## CLI: run sequentially, then compare

The following commands use `python` from an activated virtual environment. Without
activation, use the full virtual-environment Python path shown above.

```sh
python lab.py validate
python lab.py extract --model gliner-small --text "Bought potatoes for rs 40 using my Kotak upi card."

python lab.py benchmark --model gliner-small --output results/small
# Wait for the command to finish, then:
python lab.py benchmark --model gliner-base --output results/base
python lab.py compare "results/small/*.json" "results/base/*.json" --csv results/comparison.csv
```

Defaults: CPU, four threads, threshold 0.5, one separate first request, one extra
warmup, three measured passes, sequential requests (concurrency 1). Change these
with `--threads`, `--threshold`, `--warmup`, and `--repeats`. Use identical settings
for model comparisons. The model is loaded once for the entire command; it is not
loaded again per example. Every `extract` command also exits and frees the model,
so starting another playground run includes load overhead again.

An OS lock in the user's temporary directory prevents concurrent inference commands
from this lab, including two terminals or two checkouts on the same OS user. It is
released on process exit/crash. It cannot control models started by other programs.
Do not run Ollama or another model server at the same time on a constrained laptop.

## What is extracted and scored

`schema.json` is the shared experiment contract for both adapters:

- **Entities:** item, amount, account, merchant, payment_channel, date. Values are
  lists of source-text mentions, including duplicates when mentioned twice.
- **Classification:** one intent and one category for the whole statement.
  Categories are an explicit subset of Spndrr's system leaf categories, plus
  `mixed` and `not_applicable`. The file is a snapshot, not a live category lookup.
- Amounts are **mentions**, including stated balances or old values in corrections.
  Dates remain source phrases. This is not yet a transaction-creation contract.
- Mentions are extracted even in questions and negations; intent determines whether
  the statement describes a transaction. Multi-category/intent statements use
  `mixed`. Transfers, queries, corrections, and non-transactions use
  `not_applicable` for category. Explicit category choices take priority.

Each JSON report contains the raw GLiNER spans/confidences or Bedrock response,
prediction, expected labels, errors and timings for every case, plus:

| Metric | Meaning |
|---|---|
| Per-entity precision / recall / F1 | Micro counts of matched, extra and missing mention values |
| Combined entities F1 | Pool TP/FP/FN across all entity fields; excludes classification and does not average field F1 scores |
| Entities-only exact accuracy | All six entity fields match, independent of intent/category |
| Per-entity exact accuracy | All mentions for that field match, including correct absence |
| Intent/category accuracy | Exact allowed-label match |
| All-exact accuracy | All six entity fields AND both classifications are correct |
| Slice accuracy | Separate results for aliases, missing fields, multiple items, etc. |
| Error count | Exceptions, malformed output or unknown classification labels |
| Unstable cases | Prediction changed across repeats, including a successful/failed change |
| p50 / p95 / max latency | Successful measured requests, including parsing/validation; failures separately visible |
| Load / first request | Imports, checkpoint download/load, then first inference, separate from warm latency |
| Sampled peak RSS | Worker process RAM sampled every 50 ms, including loading; not VRAM or exact peak |

Quality scores use the **first measured pass** so repeats do not multiply the
effective dataset size. Errors always fail all-exact and field-exact scoring;
missing gold mentions become false negatives. Entity F1 is undefined (`null`)
when both gold and predicted counts are zero. Case-folding and whitespace are
normalized; money uses `Decimal`, recognizes numeric Indian/Western grouping and
`k`/`lakh`/`crore`, and preserves explicit currency. Bare `40` is deliberately not
equated to `₹40`. No fuzzy matching hides boundary mistakes. Position offsets are
retained for inspection but the metric matches mention values, not span offsets.

Report provenance includes schema, dataset and lab-code hashes, resolved model
revision, threshold, machine, Python version, dependency versions and thread count.
`compare` refuses incompatible dataset/schema/code hashes, partial runs and manual
extracts. Check matching hardware/settings yourself before comparing latency. Save
`python -m pip freeze > environment.lock.txt` to reproduce the full local environment.

The extraction `--threshold` controls entity decoding. Single-label intent and
category choose the highest-scoring label; changing the entity threshold does not
repair a classification collapse. Investigate task/schema construction separately.

Reports and model inputs are plain local JSON, ignored by Git. Do not publish your
real account details accidentally. The UI shows the latest 50 reports and serves
only on loopback, with host checking and a per-session token for run/stop actions.
It is a local development tool, not a production HTTP service.

## Extend the benchmark

`data/english.seed.jsonl` contains **48 hand-labelled synthetic English cases**. It
is a diagnostic seed set, not evidence of production quality. Each line has:

```json
{"id":"custom-001","slice":"simple","text":"Coffee 80","expected":{"entities":{"item":["Coffee"],"amount":["80"],"account":[],"merchant":[],"payment_channel":[],"date":[]},"classifications":{"intent":"expense","category":"Cafes / Coffee"}}}
```

Copy it to `data/private.eval.jsonl`, add anonymized real examples, review the labels,
and run `python lab.py validate --dataset data/private.eval.jsonl` before inference.
Every expected entity must occur verbatim in the text. All fields must be labelled,
including empty lists; omitted fields are errors. Input length is limited to 1,000
characters to keep this first experiment focused on short assistant statements.

```sh
python lab.py benchmark --model gliner-small --dataset data/private.eval.jsonl --output results/private-small
```

Keep development examples separate from a frozen, manually reviewed holdout. Tune
schema wording and confidence thresholds on development examples only; run both
models against the unchanged holdout. Expand to 500–1,000 diverse real examples
before making a production decision. Inspect amount/account errors individually
and report abstention/clarification behavior in the next integration phase.

**Scope limits:** no user account-ID resolution, account catalog, date resolution,
item-to-amount association, per-transaction category, follow-up conversation state,
or production C# parser baseline is implemented here. In particular, extracting
`Kotak upi card` does not prove it resolves to the right stored card. Multiple
amounts and balances require role/record extraction plus deterministic validation
before any app integration. GLiNER confidence is not calibrated financial certainty.

## Optional AWS comparator / later EC2 test

Bedrock is CLI-only and requires a separate explicit opt-in. It sends the dataset
to AWS and incurs model charges. Use the standard AWS credential chain/profile;
the app does not collect or store credentials. Select a model/profile supported by
your account and region (for example Nova 2 Lite); do not assume an inference profile
keeps data in the selected region. The runtime records the selected model ID/region.

```sh
python -m pip install -r requirements-bedrock.txt
python lab.py benchmark --model bedrock --allow-cloud --region YOUR_AWS_REGION --bedrock-model-id YOUR_MODEL_OR_PROFILE_ID --output results/bedrock
```

The adapter uses Converse, temperature 0, bounded output and no SDK retries. Response
token usage is stored per measured request. Warmup/first calls also incur charges;
these are not included in measured-request token totals. No exact cost is fabricated.
Set `--warmup 0 --repeats 1` for the first managed comparison. Some model families
have different inference-parameter requirements; this adapter targets Converse
text models supporting `temperature` and `maxTokens`, such as Nova.

After picking a local candidate, run the same CLI and frozen dataset on a CPU EC2
instance to measure that hardware. No infrastructure is provisioned by this branch.
Compare warm p95, load time, RSS, accuracy, and cost at actual traffic, including
EC2 idle time and Bedrock retries/fallbacks. Laptop timing does not establish EC2
performance or a production SLA. Concurrent server-load testing comes after this
single-model quality and resource comparison.

## Tests and troubleshooting

```sh
python -m unittest discover -s tests -v
python lab.py validate
```

Unit/integration tests use fakes, never download models or call AWS. They cover
decimal normalization, currency mismatches, missing/extra/duplicate mentions,
invalid output, repeat scoring, lock contention/crash release, sequential worker
cancellation and incompatible-report rejection. A real model smoke test is:

```sh
python lab.py extract --model gliner-small --text "Coffee 80" --warmup 0
```

- Missing `torch`/`gliner2`: use the same virtual-environment Python for install/run.
- First run slow: inspect the worker log; checkpoint download and import time are
  separate from warm inference. Keep the model cached and rerun for warm results.
- Offline load fails: complete one online run first, including tokenizer files.
- Memory metric is `null`: the environment blocked process inspection; the report
  contains `memory_sampling_error`, and accuracy/timing can still be measured.
- Stop/Ctrl-C: interrupted CLI runs save partial reports. Forcefully terminated UI
  workers may leave only the log; they are never included as completed benchmarks.
- Accuracy seems high: check amount/account F1 and slice failures, not just field
  exact accuracy (which can be inflated by absent optional entities).

Implementation references: [GLiNER2 documentation](https://github.com/fastino-ai/GLiNER2),
[small model](https://huggingface.co/fastino/gliner2.5-small-v1),
[base model](https://huggingface.co/fastino/gliner2.5-base-v1),
[Bedrock Converse](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html).
