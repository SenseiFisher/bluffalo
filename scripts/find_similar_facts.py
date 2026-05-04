#!/usr/bin/env python3
"""Find fact pairs with >= 80% Levenshtein similarity."""

import json
import sys
from itertools import combinations


def levenshtein(a: str, b: str) -> int:
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            curr.append(min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = curr
    return prev[-1]


def similarity(a: str, b: str) -> float:
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 1.0
    return 1.0 - levenshtein(a, b) / max_len


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "content/facts.json"
    threshold = float(sys.argv[2]) if len(sys.argv) > 2 else 0.80

    with open(path) as f:
        facts = json.load(f)

    texts = [(f["content_id"], f["fact_template"]) for f in facts]
    found = 0

    for (id_a, text_a), (id_b, text_b) in combinations(texts, 2):
        score = similarity(text_a, text_b)
        if score >= threshold:
            found += 1
            print(f"{score:.1%}  [{id_a}] {text_a}")
            print(f"       [{id_b}] {text_b}")
            print()

    if found == 0:
        print(f"No pairs found with similarity >= {threshold:.0%}")
    else:
        print(f"Total pairs: {found}")


if __name__ == "__main__":
    main()
