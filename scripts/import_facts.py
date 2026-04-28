import argparse
import json
import re
from pathlib import Path


def fix_template(fact_template: str, truth_keyword: str) -> str:
    if "_______" in fact_template:
        return fact_template
    # Model wrote [answer] instead of [blank] — replace it
    fixed = re.sub(r"\[" + re.escape(truth_keyword) + r"\]", "_______", fact_template)
    if "_______" not in fixed:
        # Fallback: replace any remaining [...] bracket
        fixed = re.sub(r"\[.+?\]", "_______", fact_template)
    return fixed


def main():
    parser = argparse.ArgumentParser(description="Import extracted blanks into a game facts JSON file")
    parser.add_argument("--input", required=True, help="Extracted blanks NDJSON file")
    parser.add_argument("--output", required=True, help="Target facts JSON file (will be created if absent)")
    parser.add_argument("--category", default="ידע כללי", help="Default category for all imported facts")
    args = parser.parse_args()

    input_file = Path(args.input)
    output_file = Path(args.output)

    facts = json.loads(output_file.read_text(encoding="utf-8")) if output_file.exists() else []
    existing_ids = {f["content_id"] for f in facts}

    new_facts = []
    with input_file.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            if d["id"] in existing_ids:
                continue
            fact_template = fix_template(d["fact"].replace("[blank]", "_______"), d["blank"])
            new_facts.append({
                "content_id": d["id"],
                "fact_template": fact_template,
                "truth_keyword": d["blank"],
                "metadata": {
                    "difficulty": "Hard",
                    "category": args.category,
                },
            })

    print(f"Existing facts: {len(facts)} | New to import: {len(new_facts)}")
    if not new_facts:
        print("Nothing to do.")
        return

    facts.extend(new_facts)
    output_file.write_text(json.dumps(facts, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Done. {len(new_facts)} facts added → {output_file} ({len(facts)} total)")


if __name__ == "__main__":
    main()
