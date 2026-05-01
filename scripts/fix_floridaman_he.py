import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DEFAULT_INPUT_EN = SCRIPT_DIR / "floridaman_posts.ndjson"
DEFAULT_INPUT_HE = SCRIPT_DIR / "floridaman_posts_he.ndjson"
DEFAULT_OUTPUT = SCRIPT_DIR / "floridaman_posts_he_fixed.ndjson"

CONCURRENCY = 3
DEFAULT_BATCH_SIZE = 10

SYSTEM_PROMPT = """You are a Hebrew language editor. You will receive a JSON array where each entry contains an original English Florida Man headline and its machine-translated Hebrew version.

Your job is to fix the Hebrew translation quality. Common issues to correct:
- Wrong prepositions (e.g. ב instead of על, or ל instead of מ)
- Untranslated English words that have Hebrew equivalents (e.g. "Gator" → "תנין", "Florida Man" → "איש פלורידה")
- Missing verbs (e.g. "קקי על הרצפה" → "עושה קקי על הרצפה")
- Unnatural phrasing — rewrite to sound like natural Hebrew
- Broken grammar or word order

Keep proper nouns in English: store names (Publix, CVS, Dollar General, Walmart), brand names (Fireball, Uber), acronyms (MMA, FBI, K9), and "[VIDEO]" tags.

Input: [{"id": "<id>", "en": "<original English>", "he": "<machine-translated Hebrew>"}]
Output: a valid JSON array, one entry per input:
{"id": "<id>", "text": "<fixed Hebrew>"}

Respond ONLY with the JSON array, no other text.
"""


def load_processed_ids(output_file: Path) -> set[str]:
    if not output_file.exists():
        return set()
    ids = set()
    with output_file.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    ids.add(json.loads(line)["id"])
                except (json.JSONDecodeError, KeyError):
                    pass
    return ids


def extract_json(text: str):
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r'```(?:json)?\s*(\[.*?\])\s*```', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    match = re.search(r'(\[.*\])', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


async def process_batch(posts: list[dict], semaphore: asyncio.Semaphore) -> list[dict]:
    async with semaphore:
        ids = [p["id"] for p in posts]
        try:
            batch_input = json.dumps(
                [{"id": p["id"], "en": p["en"], "he": p["he"]} for p in posts],
                ensure_ascii=False,
            )
            proc = await asyncio.create_subprocess_exec(
                "claude", "-p",
                "--system-prompt", SYSTEM_PROMPT,
                "--output-format", "json",
                "--tools", "",
                "--no-session-persistence",
                "--model", "sonnet",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate(input=batch_input.encode("utf-8"))

            if proc.returncode != 0:
                print(f"[ERROR] Batch {ids}: {stderr.decode()[:200]}", file=sys.stderr)
                return []

            outer = json.loads(stdout.decode("utf-8"))
            if outer.get("is_error") or outer.get("subtype") != "success":
                print(f"[ERROR] Batch {ids}: {outer.get('result', '')[:200]}", file=sys.stderr)
                return []

            parsed = extract_json(outer.get("result", ""))
            if parsed is None:
                print(f"[WARN] Could not parse JSON for batch {ids}", file=sys.stderr)
                return []

            if isinstance(parsed, dict):
                parsed = [parsed]

            results = []
            for item in parsed:
                if "id" not in item or "text" not in item:
                    print(f"[WARN] Missing fields: {item}", file=sys.stderr)
                    continue
                results.append({"id": item["id"], "text": item["text"]})
            return results
        except Exception as e:
            print(f"[ERROR] Batch {ids}: {e}", file=sys.stderr)
            return []


async def main():
    parser = argparse.ArgumentParser(description="Fix Hebrew Florida Man translations using Claude Sonnet")
    parser.add_argument("--input-en", type=str, default=str(DEFAULT_INPUT_EN))
    parser.add_argument("--input-he", type=str, default=str(DEFAULT_INPUT_HE))
    parser.add_argument("--output", type=str, default=str(DEFAULT_OUTPUT))
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE,
                        help=f"Posts per Claude call (default: {DEFAULT_BATCH_SIZE})")
    args = parser.parse_args()

    en_posts = {}
    with Path(args.input_en).open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    p = json.loads(line)
                    en_posts[p["id"]] = p["text"]
                except (json.JSONDecodeError, KeyError):
                    pass

    he_posts = {}
    with Path(args.input_he).open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    p = json.loads(line)
                    he_posts[p["id"]] = p["text"]
                except (json.JSONDecodeError, KeyError):
                    pass

    posts = [
        {"id": id_, "en": en_posts[id_], "he": he_posts[id_]}
        for id_ in he_posts
        if id_ in en_posts
    ]

    output_file = Path(args.output)
    processed_ids = load_processed_ids(output_file)
    remaining = [p for p in posts if p["id"] not in processed_ids]
    print(f"Total: {len(posts)} | Done: {len(processed_ids)} | Remaining: {len(remaining)}")

    if not remaining:
        print("Nothing to do.")
        return

    batches = [remaining[i:i + args.batch_size] for i in range(0, len(remaining), args.batch_size)]
    semaphore = asyncio.Semaphore(CONCURRENCY)

    with output_file.open("a", encoding="utf-8") as out:
        done = len(processed_ids)
        for i in range(0, len(batches), CONCURRENCY):
            chunk = batches[i:i + CONCURRENCY]
            all_results = await asyncio.gather(*[process_batch(b, semaphore) for b in chunk])
            for results in all_results:
                for r in results:
                    out.write(json.dumps(r, ensure_ascii=False) + "\n")
                    out.flush()
            done += sum(len(b) for b in chunk)
            print(f"Progress: {done}/{len(posts)}")

    total_written = sum(1 for _ in output_file.open(encoding="utf-8"))
    print(f"Done. {total_written} entries written to {output_file}")


if __name__ == "__main__":
    asyncio.run(main())
