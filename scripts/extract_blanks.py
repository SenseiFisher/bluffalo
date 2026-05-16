import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DEFAULT_INPUT_FILE = SCRIPT_DIR / "facebook_posts.ndjson"
DEFAULT_OUTPUT_FILE = SCRIPT_DIR / "extracted_blanks.ndjson"
DEFAULT_GUIDELINES_FILE = SCRIPT_DIR.parent / "docs" / "blank_extraction_guidelines_he.md"
DEFAULT_GEMINI_KEY_FILE = Path.home() / "dev" / "gemini-api.key"
DEFAULT_OPENROUTER_KEY_FILE = Path.home() / "dev" / "openrouter-api.key"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

CONCURRENCY = 1
BATCH_SIZE = 5

def build_system_prompt(guidelines: str) -> str:
    return f"""{guidelines}

---

You will receive a JSON array of posts: [{{"id": "<id>", "text": "<post text>"}}]

Respond ONLY with a valid JSON array, one entry per input post:
- If extractable: {{"id": "<id>", "fact": "<rewritten fact with [blank]>", "blank": "<the extracted detail>"}}
- If the post has no extractable content: {{"id": "<id>", "skip": true}}

Return exactly one array entry per input post. Do not include URLs or source links in the fact. The placeholder in the fact must be exactly `[blank]` — the literal word "blank" in single square brackets, never the actual answer text.
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


def _parse_batch_results(parsed, ids: list) -> list[dict]:
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


async def process_batch_openrouter(posts: list[dict], semaphore: asyncio.Semaphore, system_prompt: str, model: str, api_key: str) -> list[dict]:
    from openai import AsyncOpenAI

    async with semaphore:
        ids = [p["id"] for p in posts]
        try:
            batch_input = json.dumps(
                [{"id": p["id"], "text": p["text"]} for p in posts],
                ensure_ascii=False,
            )
            client = AsyncOpenAI(api_key=api_key, base_url=OPENROUTER_BASE_URL)
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": batch_input},
                ],
            )
            text = response.choices[0].message.content or ""
            parsed = extract_json(text)
            if parsed is None:
                print(f"[WARN] Could not parse JSON for batch {ids}: {text[:100]}", file=sys.stderr)
                return []

            return _parse_batch_results(parsed, ids)
        except Exception as e:
            print(f"[ERROR] Batch {ids}: {e}", file=sys.stderr)
            return []


async def process_batch_gemini(posts: list[dict], semaphore: asyncio.Semaphore, system_prompt: str, model: str, api_key: str) -> list[dict]:
    import google.genai as genai
    import google.genai.types as genai_types

    async with semaphore:
        ids = [p["id"] for p in posts]
        try:
            batch_input = json.dumps(
                [{"id": p["id"], "text": p["text"]} for p in posts],
                ensure_ascii=False,
            )
            client = genai.Client(api_key=api_key)
            response = await client.aio.models.generate_content(
                model=model,
                contents=batch_input,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system_prompt,
                ),
            )
            text = response.text
            parsed = extract_json(text)
            if parsed is None:
                print(f"[WARN] Could not parse JSON for batch {ids}: {text[:100]}", file=sys.stderr)
                return []

            return _parse_batch_results(parsed, ids)
        except Exception as e:
            print(f"[ERROR] Batch {ids}: {e}", file=sys.stderr)
            return []


async def main():
    parser = argparse.ArgumentParser(description="Extract blank-fill facts from posts using Claude or Gemini")
    parser.add_argument("--input", type=str, default=str(DEFAULT_INPUT_FILE), help="Input NDJSON file")
    parser.add_argument("--output", type=str, default=str(DEFAULT_OUTPUT_FILE), help="Output NDJSON file")
    parser.add_argument("--guidelines", type=str, default=str(DEFAULT_GUIDELINES_FILE), help="Guidelines markdown file")
    parser.add_argument("--provider", choices=["gemini", "openrouter"], default="gemini", help="LLM provider (default: gemini)")
    parser.add_argument("--model", type=str, default=None, help="Model name (default: haiku for claude, gemini-2.0-flash for gemini, google/gemini-2.0-flash-001 for openrouter)")
    parser.add_argument("--limit", type=int, default=None, help="Stop after processing this many posts")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help=f"Number of posts per batch (default: {BATCH_SIZE})")
    args = parser.parse_args()

    provider = args.provider
    default_models = {"gemini": "gemini-2.0-flash", "openrouter": "google/gemini-2.0-flash-001"}
    model = args.model or default_models[provider]

    gemini_api_key = None
    if provider == "gemini":
        gemini_api_key = os.environ.get("GEMINI_API_KEY")
        if not gemini_api_key and DEFAULT_GEMINI_KEY_FILE.exists():
            gemini_api_key = DEFAULT_GEMINI_KEY_FILE.read_text(encoding="utf-8").strip()
        if not gemini_api_key:
            sys.exit("Error: set GEMINI_API_KEY env var or create ~/dev/gemini-api.key")

    openrouter_api_key = None
    if provider == "openrouter":
        openrouter_api_key = os.environ.get("OPENROUTER_API_KEY")
        if not openrouter_api_key and DEFAULT_OPENROUTER_KEY_FILE.exists():
            openrouter_api_key = DEFAULT_OPENROUTER_KEY_FILE.read_text(encoding="utf-8").strip()
        if not openrouter_api_key:
            sys.exit("Error: set OPENROUTER_API_KEY env var or create ~/dev/openrouter-api.key")

    input_file = Path(args.input)
    output_file = Path(args.output)
    guidelines = Path(args.guidelines).read_text(encoding="utf-8")
    system_prompt = build_system_prompt(guidelines)

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
    if args.limit is not None:
        remaining = remaining[:args.limit]
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
            if provider == "gemini":
                tasks = [process_batch_gemini(b, semaphore, system_prompt, model, gemini_api_key) for b in chunk]
            else:
                tasks = [process_batch_openrouter(b, semaphore, system_prompt, model, openrouter_api_key) for b in chunk]
            all_results = await asyncio.gather(*tasks)
            for batch_idx, results in enumerate(all_results):
                done += len(chunk[batch_idx])
                for result in results:
                    out.write(json.dumps(result, ensure_ascii=False) + "\n")
                    out.flush()
            if done % 50 == 0 or done >= total:
                print(f"Progress: {done}/{total}")
            if provider == "openrouter" and i + CONCURRENCY < len(batches):
                await asyncio.sleep(4)

    written = sum(1 for _ in output_file.open(encoding="utf-8"))
    print(f"Done. {written} entries written to {output_file}")


if __name__ == "__main__":
    asyncio.run(main())
