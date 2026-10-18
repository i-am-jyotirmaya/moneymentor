"""Explicit, reproducible ablations; no gold labels or model imports here."""
from copy import deepcopy
import json
import re

from .scoring import fingerprint

PROFILES = ("labels", "descriptions", "split")
SUITES = ("seed", "challenge", "all")

# Task-specific descriptions, not a shared cross-task prompt. Keys remain the
# same evaluation labels, including mixed and not_applicable.
DESCRIPTIONS = {
    "intent": {
        "expense": "A purchase or payment for goods or services, including purchases made with a credit card.",
        "income": "Money earned or received as income, such as wages or salary.",
        "refund": "A merchant returning money for an earlier purchase.",
        "transfer": "Moving money between accounts without purchasing anything.",
        "card_payment": "Repaying an outstanding credit card balance or credit card bill.",
        "query": "A question or request to look up financial information, including affordability questions.",
        "correction": "A request to change, fix, or delete an existing transaction.",
        "not_transaction": "A greeting, negated transaction, hypothetical statement, or plan that records no completed transaction.",
        "mixed": "Multiple distinct financial intents in one statement, such as receiving salary and paying rent.",
    },
    "category": {
        "Groceries": "Food ingredients and household groceries, such as produce, rice, milk, and bread.",
        "Snacks": "Snacks, sweets, chips, or ice cream bought as snacks.",
        "Food Delivery": "Prepared meals ordered for delivery through a food delivery service.",
        "Restaurants": "Meals eaten at a restaurant or dining out.",
        "Cafes / Coffee": "Coffee, tea, or drinks at a cafe.",
        "Rent": "Housing rent payments.",
        "Fuel": "Petrol, diesel, or vehicle fuel.",
        "Ride-Sharing / Taxi": "Taxi or ride-hailing fares.",
        "Public Transit": "Bus, metro, or other public transit fares.",
        "Electricity": "Electricity utility bills.",
        "Internet": "Home broadband or internet service bills.",
        "Mobile / Phone": "Mobile phone service, recharge, or phone bills.",
        "Pharmacy / Medication": "Medicines or pharmacy purchases.",
        "Clothing & Apparel": "Clothes, shoes, or apparel.",
        "Electronics & Gadgets": "Electronic devices, phones, headphones, or computer accessories.",
        "General Merchandise": "General retail goods outside the more specific listed categories.",
        "Streaming Subscriptions": "Subscriptions to music or video streaming services.",
        "Fitness": "Gym, fitness services, or fitness supplements.",
        "Salary / Wages": "Salary or wages received as income.",
        "Refunds / Reimbursements": "Money returned for an earlier purchase or reimbursed expense.",
        "Credit Card Payment": "Repayment of an existing credit card bill or balance.",
        "Miscellaneous / Uncategorized": "An expense with an unknown purpose or outside the listed categories.",
        "mixed": "Multiple different purchase categories or financial intents in one statement.",
        "not_applicable": "Transfers, financial queries, corrections, greetings, or negated or hypothetical purchases.",
    },
}


def compile_schemas(model, schema, profile):
    """Split still uses ONE model; only the task calls are separated."""
    if profile not in PROFILES:
        raise ValueError(f"Unknown experiment profile: {profile}")
    compiled = [model.create_schema().entities(schema["entities"])]
    for task, labels in schema["classifications"].items():
        if profile != "labels":
            if set(labels) != set(DESCRIPTIONS.get(task, {})):
                raise ValueError("Description experiments require the bundled classification labels")
            labels = {label: DESCRIPTIONS[task][label] for label in labels}
        target = model.create_schema() if profile == "split" else compiled[0]
        target.classification(task, labels)
        if profile == "split":
            compiled.append(target)
    return compiled


def load_catalog(path):
    catalog = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(catalog, list) or not catalog:
        raise ValueError("Account catalog must be a nonempty list")
    ids = set()
    for entry in catalog:
        if not isinstance(entry, dict) or set(entry) != {"id", "aliases"}:
            raise ValueError("Each catalog entry needs exactly id and aliases")
        if not isinstance(entry["id"], str) or not entry["id"] or entry["id"] in ids:
            raise ValueError("Catalog account IDs must be unique nonempty strings")
        aliases = entry["aliases"]
        if not isinstance(aliases, list) or not aliases or any(
                not isinstance(a, str) or not a.strip() for a in aliases):
            raise ValueError("Account aliases must be nonempty strings")
        ids.add(entry["id"])
    return catalog


def catalog_mentions(text, catalog):
    """Exact aliases, word boundaries, longest overlap first, ambiguous IDs skipped.

    Catalogs should contain distinctive account phrases (not bare bank names).
    A match does not imply that money moved or that this is the payment account.
    """
    aliases = {}
    for entry in catalog:
        for alias in entry["aliases"]:
            aliases.setdefault(alias.casefold(), set()).add(entry["id"])
    candidates = []
    for alias, ids in aliases.items():
        # Keep ambiguous aliases as blockers so a shorter unique alias inside an
        # ambiguous full name cannot accidentally resolve the wrong account.
        for match in re.finditer(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", text, re.IGNORECASE):
            candidates.append({"text": match.group(), "start": match.start(), "end": match.end(),
                               "account_id": next(iter(ids)) if len(ids) == 1 else None})
    selected = []
    for candidate in sorted(candidates, key=lambda m: (-(m["end"] - m["start"]), m["start"])):
        if not any(candidate["start"] < m["end"] and m["start"] < candidate["end"] for m in selected):
            selected.append(candidate)
    return [m for m in sorted(selected, key=lambda m: m["start"]) if m["account_id"] is not None]


class CatalogProvider:
    """Optional deterministic mention recovery; retains model false positives."""
    def __init__(self, provider, catalog):
        self.provider, self.catalog = provider, catalog
        self.metadata = {**provider.metadata, "account_catalog_hash": fingerprint(catalog),
                         "account_assistance": "literal_alias_union_v1"}

    def extract(self, text):
        prediction, raw, usage = self.provider.extract(text)
        prediction = deepcopy(prediction)
        matches = catalog_mentions(text, self.catalog)
        # Union as multisets: do not add duplicates already emitted by the model.
        # Keep partial/wrong model spans visible; this is not a gold-aware repair.
        from collections import Counter
        available = Counter(v.casefold() for v in prediction["entities"]["account"])
        for match in matches:
            key = match["text"].casefold()
            if available[key]:
                available[key] -= 1
            else:
                prediction["entities"]["account"].append(match["text"])
        return prediction, {"model": raw, "catalog_matches": matches}, usage
