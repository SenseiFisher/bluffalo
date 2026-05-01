import json
import sys
import time
from pathlib import Path

from deep_translator import GoogleTranslator

SCRIPT_DIR = Path(__file__).parent
INPUT_FILE = SCRIPT_DIR / "floridaman_posts.ndjson"
OUTPUT_FILE = SCRIPT_DIR / "floridaman_posts_he.ndjson"

translator = GoogleTranslator(source="en", target="iw")


def load_translated_ids(output_file: Path) -> set[str]:
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


def main():
    posts = []
    with INPUT_FILE.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    posts.append(json.loads(line))
                except json.JSONDecodeError:
                    pass

    translated_ids = load_translated_ids(OUTPUT_FILE)
    remaining = [p for p in posts if p["id"] not in translated_ids]
    print(f"Total: {len(posts)} | Done: {len(translated_ids)} | Remaining: {len(remaining)}")

    if not remaining:
        print("Nothing to do.")
        return

    with OUTPUT_FILE.open("a", encoding="utf-8") as out:
        for i, post in enumerate(remaining):
            try:
                translated = translator.translate(post["text"])
                entry = {"id": post["id"], "text": translated}
                out.write(json.dumps(entry, ensure_ascii=False) + "\n")
                out.flush()
                print(f"[{len(translated_ids) + i + 1}/{len(posts)}] {post['text'][:60]}")
            except Exception as e:
                print(f"[ERROR] {post['id']}: {e}", file=sys.stderr)
            time.sleep(0.1)

    total_written = sum(1 for _ in OUTPUT_FILE.open(encoding="utf-8"))
    print(f"Done. {total_written} entries written to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
