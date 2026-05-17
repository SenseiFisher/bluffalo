#!/usr/bin/env python3
import json, sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
INPUT_FILE = SCRIPT_DIR / "spotify_playlists.ndjson"
OUTPUT_FILE = REPO_ROOT / "content" / "playlists.he.json"
MAX_TRACKS = 10

def format_track(t):
    name = t.get("name", "").strip()
    artist = t.get("artist", "").strip()
    return f"{name} - {artist}" if artist else name

def main():
    if not INPUT_FILE.exists():
        sys.exit(f"Error: {INPUT_FILE} not found")
    records = []
    for line in INPUT_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            records.append(json.loads(line))
    playlists = []
    skipped = 0
    for r in records:
        if r.get("status") != "ok" or not r.get("tracks"):
            skipped += 1
            continue
        playlists.append({
            "content_id": f"PLAYLIST_{len(playlists) + 1:03d}",
            "name": r["name"],
            "tracks": [format_track(t) for t in r["tracks"][:MAX_TRACKS]],
        })
    if not playlists:
        sys.exit("Error: No valid playlists found.")
    OUTPUT_FILE.write_text(json.dumps(playlists, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {OUTPUT_FILE}\n  Written: {len(playlists)}, Skipped: {skipped}")

if __name__ == "__main__":
    main()
