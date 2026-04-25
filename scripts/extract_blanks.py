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

GUIDELINES = GUIDELINES_FILE.read_text(encoding="utf-8")

def build_system_prompt(language: str) -> str:
    return f"""{GUIDELINES}

---

You are processing {language} trivia posts. For each post, identify the single most surprising or unexpected detail and rewrite the key sentence(s) with that detail replaced by [blank].

Respond ONLY with valid JSON:
- If you can extract a blank: {{"fact": "<condensed fact in {language} with [blank]>", "blank": "<the extracted detail in {language}>"}}
- If the post has no clear surprising extractable detail: {{"skip": true}}

Rules:
- ALWAYS write the fact and blank in {language}, even if the input is in a different language — translate as needed
- The "fact" should be a clean, concise version of the post (remove URLs, source citations, conversational openers) focused on the core surprising information with [blank] inserted
- The "blank" should be a short phrase (not a full sentence unless unavoidable)
- Do not include URLs or source links in the fact
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


async def process_post(post: dict, semaphore: asyncio.Semaphore, system_prompt: str) -> dict | None:
    async with semaphore:
        try:
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
    parser = argparse.ArgumentParser(description="Extract blank-fill facts from posts using Claude")
    parser.add_argument("--input", type=str, default=str(DEFAULT_INPUT_FILE), help="Input NDJSON file")
    parser.add_argument("--output", type=str, default=str(DEFAULT_OUTPUT_FILE), help="Output NDJSON file")
    parser.add_argument("--language", type=str, default="Hebrew", help="Language of the posts and output facts (default: Hebrew)")
    args = parser.parse_args()

    input_file = Path(args.input)
    output_file = Path(args.output)
    system_prompt = build_system_prompt(args.language)

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

    semaphore = asyncio.Semaphore(CONCURRENCY)

    with output_file.open("a", encoding="utf-8") as out:
        done = already_done
        for i in range(0, len(remaining), CONCURRENCY):
            chunk = remaining[i:i + CONCURRENCY]
            results = await asyncio.gather(*[process_post(p, semaphore, system_prompt) for p in chunk])
            for result in results:
                done += 1
                if result:
                    out.write(json.dumps(result, ensure_ascii=False) + "\n")
                    out.flush()
            if done % 50 == 0 or done == total:
                print(f"Progress: {done}/{total}")

    written = sum(1 for _ in output_file.open(encoding="utf-8"))
    print(f"Done. {written} entries written to {output_file}")


if __name__ == "__main__":
    asyncio.run(main())
