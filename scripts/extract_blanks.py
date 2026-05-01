import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DEFAULT_INPUT_FILE = SCRIPT_DIR / "facebook_posts.ndjson"
DEFAULT_OUTPUT_FILE = SCRIPT_DIR / "extracted_blanks.ndjson"
GUIDELINES_FILE = SCRIPT_DIR.parent / "docs" / "blank_extraction_guidelines.md"

CONCURRENCY = 3
BATCH_SIZE = 5

GUIDELINES = GUIDELINES_FILE.read_text(encoding="utf-8")

def build_system_prompt() -> str:
    return f"""{GUIDELINES}

---

You are processing trivia posts in batches. For each post, identify the single most surprising or unexpected detail and rewrite the key sentence(s) with that detail replaced by [blank].

You will receive a JSON array of posts: [{{"id": "<id>", "text": "<post text>"}}]

Respond ONLY with a valid JSON array, one entry per input post:
- If extractable: {{"id": "<id>", "fact": "<condensed fact with [blank]>", "blank": "<the extracted detail>"}}
- Only skip if the post has absolutely no trivia content — e.g. it is pure site boilerplate, a vague listicle title, or a meta page with no facts at all: {{"id": "<id>", "skip": true}}

Rules:
- Write the fact and blank in the same language as the input
- The "fact" should be a clean, concise version of the post (remove URLs, source citations, conversational openers) focused on the core surprising information with [blank] inserted
- The "blank" should be a short phrase (not a full sentence unless unavoidable)
- Do not include URLs or source links in the fact
- If the post contains multiple stories or surprising details, pick the single best one — never skip because there are too many options
- If the post is long and complex, condense it to the one most surprising sentence and blank the key detail
- Return exactly one array entry per input post
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


def extract_json(text: str) -> dict | list | None:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Handle markdown code blocks
    match = re.search(r'```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    # Bare JSON array or object anywhere in the text
    match = re.search(r'(\[.*\]|\{.*\})', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


async def process_batch(posts: list[dict], semaphore: asyncio.Semaphore, system_prompt: str) -> list[dict]:
    async with semaphore:
        ids = [p["id"] for p in posts]
        try:
            batch_input = json.dumps(
                [{"id": p["id"], "text": p["text"]} for p in posts],
                ensure_ascii=False,
            )
            proc = await asyncio.create_subprocess_exec(
                "claude", "-p",
                "--system-prompt", system_prompt,
                "--output-format", "json",
                "--tools", "",
                "--no-session-persistence",
                "--model", "haiku",
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
                print(f"[WARN] Could not parse JSON for batch {ids}: {outer.get('result', '')[:100]}", file=sys.stderr)
                return []

            if isinstance(parsed, dict):
                parsed = [parsed]

            results = []
            for item in parsed:
                if item.get("skip"):
                    continue
                if "id" not in item or "fact" not in item or "blank" not in item:
                    print(f"[WARN] Missing fields in batch result: {item}", file=sys.stderr)
                    continue
                results.append({"id": item["id"], "fact": item["fact"], "blank": item["blank"]})
            return results
        except Exception as e:
            print(f"[ERROR] Batch {ids}: {e}", file=sys.stderr)
            return []


async def main():
    parser = argparse.ArgumentParser(description="Extract blank-fill facts from posts using Claude")
    parser.add_argument("--input", type=str, default=str(DEFAULT_INPUT_FILE), help="Input NDJSON file")
    parser.add_argument("--output", type=str, default=str(DEFAULT_OUTPUT_FILE), help="Output NDJSON file")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help=f"Number of posts per Claude call (default: {BATCH_SIZE})")
    args = parser.parse_args()

    input_file = Path(args.input)
    output_file = Path(args.output)
    system_prompt = build_system_prompt()

    posts = []
    with input_file.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    posts.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    processed_ids = load_processed_ids(output_file)

    remaining = [p for p in posts if p["id"] not in processed_ids]
    total = len(posts)
    already_done = len(processed_ids)
    print(f"Total posts: {total} | Already processed: {already_done} | Remaining: {len(remaining)}")

    if not remaining:
        print("Nothing to do.")
        return

    batches = [remaining[i:i + args.batch_size] for i in range(0, len(remaining), args.batch_size)]
    semaphore = asyncio.Semaphore(CONCURRENCY)

    with output_file.open("a", encoding="utf-8") as out:
        done = already_done
        for i in range(0, len(batches), CONCURRENCY):
            chunk = batches[i:i + CONCURRENCY]
            all_results = await asyncio.gather(*[process_batch(b, semaphore, system_prompt) for b in chunk])
            for batch_idx, results in enumerate(all_results):
                done += len(chunk[batch_idx])
                for result in results:
                    out.write(json.dumps(result, ensure_ascii=False) + "\n")
                    out.flush()
            if done % 50 == 0 or done >= total:
                print(f"Progress: {done}/{total}")

    written = sum(1 for _ in output_file.open(encoding="utf-8"))
    print(f"Done. {written} entries written to {output_file}")


if __name__ == "__main__":
    asyncio.run(main())
