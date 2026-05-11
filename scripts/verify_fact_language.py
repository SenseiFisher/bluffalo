#!/usr/bin/env python3
"""
Verify that each fact in a facts JSON file is in the correct language.
A fact passes if ≥80% of its letter characters belong to the expected script.

Usage:
  python scripts/verify_fact_language.py --file content/facts.json --lang en
  python scripts/verify_fact_language.py --file content/facts.he.json --lang he
  python scripts/verify_fact_language.py --file content/facts.he.json --lang he --threshold 0.75
"""

import argparse
import json
import sys
import unicodedata
from pathlib import Path

LANG_RANGES = {
    "en": [("A", "Z"), ("a", "z")],  # Basic Latin A-Z a-z
    "he": [("א", "ת")],                         # Hebrew aleph–tav
    "ar": [("؀", "ۿ")],                         # Arabic block
    "ru": [("Ѐ", "ӿ")],                         # Cyrillic block
    "zh": [("一", "鿿"), ("㐀", "䶿")],   # CJK Unified Ideographs
    "ja": [("぀", "ヿ"), ("一", "鿿")],   # Hiragana + Katakana + CJK
    "es": [("A", "Z"), ("a", "z"),    # Latin + Spanish accents
           ("À", "ÿ")],
    "fr": [("A", "Z"), ("a", "z"),    # Latin + French accents
           ("À", "ÿ")],
    "de": [("A", "Z"), ("a", "z"),    # Latin + German umlauts
           ("À", "ÿ")],
}


def in_script(char: str, lang: str) -> bool:
    ranges = LANG_RANGES.get(lang)
    if not ranges:
        return False
    return any(lo <= char <= hi for lo, hi in ranges)


def lang_ratio(text: str, lang: str) -> float:
    letters = [c for c in text if unicodedata.category(c).startswith("L")]
    if not letters:
        return 1.0  # no letters → vacuously pass
    in_lang = sum(1 for c in letters if in_script(c, lang))
    return in_lang / len(letters)


def check_fact(fact: dict, lang: str, threshold: float) -> tuple[bool, float]:
    combined = fact.get("fact_template", "") + " " + fact.get("truth_keyword", "")
    ratio = lang_ratio(combined, lang)
    return ratio >= threshold, ratio


def main():
    parser = argparse.ArgumentParser(description="Verify fact language correctness")
    parser.add_argument("--file", required=True, help="Path to facts JSON file")
    parser.add_argument("--lang", required=True, choices=list(LANG_RANGES), help="Expected language code")
    parser.add_argument("--threshold", type=float, default=0.8, help="Minimum ratio of in-language letters (default: 0.8)")
    parser.add_argument("--show-passing", action="store_true", help="Also print passing facts")
    args = parser.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"Error: file not found: {path}", file=sys.stderr)
        sys.exit(1)

    facts = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(facts, list):
        print("Error: expected a JSON array at the top level", file=sys.stderr)
        sys.exit(1)

    failing = []
    for fact in facts:
        passed, ratio = check_fact(fact, args.lang, args.threshold)
        if not passed:
            failing.append((fact, ratio))
        elif args.show_passing:
            cid = fact.get("content_id", "?")
            print(f"  OK  [{ratio:.0%}] {cid}: {fact.get('fact_template', '')[:80]}")

    print(f"\n{'='*60}")
    print(f"File   : {args.file}")
    print(f"Lang   : {args.lang}  |  Threshold: {args.threshold:.0%}")
    print(f"Total  : {len(facts)}  |  Failing: {len(failing)}")
    print(f"{'='*60}")

    if failing:
        print(f"\nFailing facts ({len(failing)}):\n")
        for fact, ratio in failing:
            cid = fact.get("content_id", "?")
            template = fact.get("fact_template", "")
            keyword = fact.get("truth_keyword", "")
            print(f"  FAIL [{ratio:.0%}] {cid}")
            print(f"       template : {template[:100]}")
            print(f"       keyword  : {keyword}")
            print()
        sys.exit(1)
    else:
        print("\nAll facts passed.")


if __name__ == "__main__":
    main()
