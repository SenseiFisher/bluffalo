import argparse
import asyncio
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DEFAULT_GEMINI_KEY_FILE = Path.home() / "dev" / "gemini-api.key"
DEFAULT_OPENROUTER_KEY_FILE = Path.home() / "dev" / "openrouter-api.key"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

CONCURRENCY = 1
BATCH_SIZE = 5

LANG_RANGES = {
    "he": [("א", "ת")],
    "en": [("A", "Z"), ("a", "z")],
}

LANG_NAMES = {
    "he": "Hebrew",
    "en": "English",
}


def lang_ratio(text: str, lang: str) -> float:
    ranges = LANG_RANGES.get(lang, [])
    letters = [c for c in text if unicodedata.category(c).startswith("L")]
    if not letters:
        return 1.0
    return sum(1 for c in letters if any(lo <= c <= hi for lo, hi in ranges)) / len(letters)


def build_system_prompt(guidelines: str, lang: str) -> str:
    lang_name = LANG_NAMES.get(lang, lang)
    return f"""{guidelines}

---

You are verifying already-extracted blank-fill facts. You will receive a JSON array:
[{{"id": "<id>", "fact": "<fact with [blank]>", "blank": "<answer>"}}]

For each entry check:
1. Is the fact written in {lang_name}? (ignore proper nouns and numbers)
2. Does `[blank]` appear literally in the fact text?
3. Is the blank the most surprising/specific detail — not too vague, not too long?
4. Does the blank correctly answer the [blank] in the fact?

Respond ONLY with a valid JSON array, one entry per input:
- If correct: {{"id": "<id>", "status": "ok"}}
- If fixable: {{"id": "<id>", "status": "fix", "fact": "<corrected fact>", "blank": "<corrected blank>", "issue": "<one line describing what was wrong>"}}
- If unfixable (no extractable content, purely boilerplate): {{"id": "<id>", "status": "skip", "issue": "<reason>"}}

The placeholder in any fixed fact must be exactly `[blank]`. Output language must be {lang_name}.
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
    match = re.search(r'```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    match = re.search(r'(\[.*\]|\{.*\})', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def _parse_verify_results(parsed, originals: list[dict]) -> list[dict]:
    if isinstance(parsed, dict):
        parsed = [parsed]
    originals_by_id = {e["id"]: e for e in originals}
    results = []
    for item in parsed:
        if "id" not in item or "status" not in item:
            print(f"[WARN] Missing fields in result: {item}", file=sys.stderr)
            continue
        status = item["status"]
        original = originals_by_id.get(item["id"], {})
        if status == "ok":
            results.append({
                "id": item["id"],
                "status": "ok",
                "fact": original.get("fact", ""),
                "blank": original.get("blank", ""),
            })
        elif status == "fix":
            if "fact" not in item or "blank" not in item:
                print(f"[WARN] Fix entry missing fact/blank: {item}", file=sys.stderr)
                continue
            results.append({
                "id": item["id"],
                "status": "fix",
                "fact": item["fact"],
                "blank": item["blank"],
                "issue": item.get("issue", ""),
            })
        elif status == "skip":
            results.append({"id": item["id"], "status": "skip", "issue": item.get("issue", "")})
    return results


async def verify_batch_claude(entries: list[dict], semaphore: asyncio.Semaphore, system_prompt: str, model: str) -> list[dict]:
    async with semaphore:
        ids = [e["id"] for e in entries]
        try:
            batch_input = json.dumps(entries, ensure_ascii=False)
            proc = await asyncio.create_subprocess_exec(
                "claude", "-p",
                "--system-prompt", system_prompt,
                "--output-format", "json",
                "--tools", "",
                "--no-session-persistence",
                "--model", model,
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
            return _parse_verify_results(parsed, entries)
        except Exception as e:
            print(f"[ERROR] Batch {ids}: {e}", file=sys.stderr)
            return []


async def verify_batch_openrouter(entries: list[dict], semaphore: asyncio.Semaphore, system_prompt: str, model: str, api_key: str) -> list[dict]:
    from openai import AsyncOpenAI

    async with semaphore:
        ids = [e["id"] for e in entries]
        try:
            batch_input = json.dumps(entries, ensure_ascii=False)
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
            return _parse_verify_results(parsed, entries)
        except Exception as e:
            print(f"[ERROR] Batch {ids}: {e}", file=sys.stderr)
            return []


async def verify_batch_gemini(entries: list[dict], semaphore: asyncio.Semaphore, system_prompt: str, model: str, api_key: str) -> list[dict]:
    import google.genai as genai
    import google.genai.types as genai_types

    async with semaphore:
        ids = [e["id"] for e in entries]
        try:
            batch_input = json.dumps(entries, ensure_ascii=False)
            client = genai.Client(api_key=api_key)
            response = await client.aio.models.generate_content(
                model=model,
                contents=batch_input,
                config=genai_types.GenerateContentConfig(system_instruction=system_prompt),
            )
            parsed = extract_json(response.text)
            if parsed is None:
                print(f"[WARN] Could not parse JSON for batch {ids}: {response.text[:100]}", file=sys.stderr)
                return []
            return _parse_verify_results(parsed, entries)
        except Exception as e:
            print(f"[ERROR] Batch {ids}: {e}", file=sys.stderr)
            return []


async def main():
    parser = argparse.ArgumentParser(description="Verify and fix extracted blank-fill facts")
    parser.add_argument("--input", required=True, help="Input NDJSON file (id, fact, blank)")
    parser.add_argument("--output", required=True, help="Output NDJSON file (id, status, [fact, blank, issue])")
    parser.add_argument("--guidelines", type=str, default=str(SCRIPT_DIR.parent / "docs" / "blank_extraction_guidelines.md"), help="Guidelines markdown file")
    parser.add_argument("--lang", choices=list(LANG_RANGES), default="he", help="Expected language (default: he)")
    parser.add_argument("--provider", choices=["claude", "gemini", "openrouter"], default="openrouter", help="LLM provider (default: openrouter)")
    parser.add_argument("--model", type=str, default=None, help="Model name (default: haiku / gemini-2.0-flash / openrouter/free)")
    parser.add_argument("--limit", type=int, default=None, help="Stop after processing this many entries")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help=f"Entries per batch (default: {BATCH_SIZE})")
    parser.add_argument("--lang-threshold", type=float, default=0.0, help="Skip entries already above this Hebrew ratio (default: 0.0 = only reprocess 0%%)")
    args = parser.parse_args()

    provider = args.provider
    default_models = {"claude": "haiku", "gemini": "gemini-2.0-flash", "openrouter": "openrouter/free"}
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

    guidelines = Path(args.guidelines).read_text(encoding="utf-8")
    system_prompt = build_system_prompt(guidelines, args.lang)

    input_file = Path(args.input)
    output_file = Path(args.output)

    entries = []
    with input_file.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass

    processed_ids = load_processed_ids(output_file)
    remaining = [e for e in entries if e["id"] not in processed_ids]
    if args.limit is not None:
        remaining = remaining[:args.limit]

    total = len(entries)
    already_done = len(processed_ids)
    print(f"Total: {total} | Already verified: {already_done} | Remaining: {len(remaining)}")

    if not remaining:
        print("Nothing to do.")
        return

    batches = [remaining[i:i + args.batch_size] for i in range(0, len(remaining), args.batch_size)]
    semaphore = asyncio.Semaphore(CONCURRENCY)

    ok = fix = skip = 0
    with output_file.open("a", encoding="utf-8") as out:
        done = already_done
        for i in range(0, len(batches), CONCURRENCY):
            chunk = batches[i:i + CONCURRENCY]
            if provider == "gemini":
                tasks = [verify_batch_gemini(b, semaphore, system_prompt, model, gemini_api_key) for b in chunk]
            elif provider == "openrouter":
                tasks = [verify_batch_openrouter(b, semaphore, system_prompt, model, openrouter_api_key) for b in chunk]
            else:
                tasks = [verify_batch_claude(b, semaphore, system_prompt, model) for b in chunk]
            all_results = await asyncio.gather(*tasks)
            for batch_idx, results in enumerate(all_results):
                done += len(chunk[batch_idx])
                for result in results:
                    out.write(json.dumps(result, ensure_ascii=False) + "\n")
                    out.flush()
                    s = result["status"]
                    if s == "ok": ok += 1
                    elif s == "fix": fix += 1
                    elif s == "skip": skip += 1
            if done % 50 == 0 or done >= total:
                print(f"Progress: {done}/{total}  (ok={ok} fix={fix} skip={skip})")

    print(f"Done. ok={ok} fix={fix} skip={skip} — results in {output_file}")


if __name__ == "__main__":
    asyncio.run(main())
