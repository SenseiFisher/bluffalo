import asyncio
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
INPUT_FILE = SCRIPT_DIR / "facebook_posts.json"
OUTPUT_FILE = SCRIPT_DIR / "extracted_blanks.ndjson"
GUIDELINES_FILE = SCRIPT_DIR.parent / "docs" / "blank_extraction_guidelines.md"

CONCURRENCY = 3

GUIDELINES = GUIDELINES_FILE.read_text(encoding="utf-8")

SYSTEM_PROMPT = f"""{GUIDELINES}

---

You are processing Hebrew trivia posts. For each post, identify the single most surprising or unexpected detail and rewrite the key sentence(s) with that detail replaced by [blank].

Respond ONLY with valid JSON:
- If you can extract a blank: {{"fact": "<condensed fact in Hebrew with [blank]>", "blank": "<the extracted detail in Hebrew>"}}
- If the post has no clear surprising extractable detail: {{"skip": true}}

Rules:
- Keep the fact in Hebrew
- The "fact" should be a clean, concise version of the post (remove URLs, source citations, conversational openers) focused on the core surprising information with [blank] inserted
- The "blank" should be a short phrase (not a full sentence unless unavoidable)
- Do not include URLs or source links in the fact
"""


def load_processed_ids() -> set[str]:
    if not OUTPUT_FILE.exists():
        return set()
    ids = set()
    with OUTPUT_FILE.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    ids.add(json.loads(line)["id"])
                except (json.JSONDecodeError, KeyError):
                    pass
    return ids


def extract_json(text: str) -> dict | None:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Handle markdown code blocks
    match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    # Bare JSON object anywhere in the text
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


async def process_post(post: dict, semaphore: asyncio.Semaphore) -> dict | None:
    async with semaphore:
        try:
            proc = await asyncio.create_subprocess_exec(
                "claude", "-p",
                "--system-prompt", SYSTEM_PROMPT,
                "--output-format", "json",
                "--tools", "",
                "--no-session-persistence",
                "--model", "haiku",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate(input=post["text"].encode("utf-8"))

            if proc.returncode != 0:
                print(f"[ERROR] Post {post['id']}: {stderr.decode()[:200]}", file=sys.stderr)
                return None

            outer = json.loads(stdout.decode("utf-8"))
            if outer.get("is_error") or outer.get("subtype") != "success":
                print(f"[ERROR] Post {post['id']}: {outer.get('result', '')[:200]}", file=sys.stderr)
                return None

            parsed = extract_json(outer.get("result", ""))
            if parsed is None:
                print(f"[WARN] Could not parse JSON for post {post['id']}: {outer.get('result', '')[:100]}", file=sys.stderr)
                return None
            if parsed.get("skip"):
                return None
            if "fact" not in parsed or "blank" not in parsed:
                print(f"[WARN] Missing fields for post {post['id']}: {parsed}", file=sys.stderr)
                return None

            return {"id": post["id"], "fact": parsed["fact"], "blank": parsed["blank"]}
        except Exception as e:
            print(f"[ERROR] Post {post['id']}: {e}", file=sys.stderr)
            return None


async def main():
    posts = json.loads(INPUT_FILE.read_text(encoding="utf-8"))
    processed_ids = load_processed_ids()

    remaining = [p for p in posts if p["id"] not in processed_ids]
    total = len(posts)
    already_done = len(processed_ids)
    print(f"Total posts: {total} | Already processed: {already_done} | Remaining: {len(remaining)}")

    if not remaining:
        print("Nothing to do.")
        return

    semaphore = asyncio.Semaphore(CONCURRENCY)

    with OUTPUT_FILE.open("a", encoding="utf-8") as out:
        tasks = [process_post(post, semaphore) for post in remaining]
        done = already_done
        for coro in asyncio.as_completed(tasks):
            result = await coro
            done += 1
            if result:
                out.write(json.dumps(result, ensure_ascii=False) + "\n")
                out.flush()
            if done % 50 == 0 or done == total:
                print(f"Progress: {done}/{total}")

    written = sum(1 for _ in OUTPUT_FILE.open(encoding="utf-8"))
    print(f"Done. {written} entries written to {OUTPUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
