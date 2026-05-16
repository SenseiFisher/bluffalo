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
    facts_by_id = {f["content_id"]: f for f in facts}

    added = updated = 0
    with input_file.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            fact_template = fix_template(d["fact"].replace("[blank]", "_______"), d["blank"])
            if "_______" not in fact_template:
                continue
            new_entry = {
                "content_id": d["id"],
                "fact_template": fact_template,
                "truth_keyword": d["blank"],
                "metadata": {
                    "difficulty": "Hard",
                    "category": args.category,
                },
            }
            if d["id"] not in facts_by_id:
                facts_by_id[d["id"]] = new_entry
                added += 1
            elif facts_by_id[d["id"]]["fact_template"] != fact_template or facts_by_id[d["id"]]["truth_keyword"] != d["blank"]:
                facts_by_id[d["id"]].update(new_entry)
                updated += 1

    print(f"Existing facts: {len(facts)} | Added: {added} | Updated: {updated}")
    if not added and not updated:
        print("Nothing to do.")
        return

    result = list(facts_by_id.values())
    output_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Done. {len(result)} total facts → {output_file}")


if __name__ == "__main__":
    main()
