#!/usr/bin/env python3
"""
Search Spotify for playlists named "פלייליסט", classify with OpenRouter,
and fetch tracks for interesting ones.

Credentials:
  ~/dev/spotify.key        — CLIENT_ID=... / CLIENT_SECRET=...
  ~/dev/openrouter-api.key — plain text OpenRouter API key
"""

import base64
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUTPUT_FILE = SCRIPT_DIR / "spotify_playlists.ndjson"

SPOTIFY_KEY_FILE = Path.home() / "dev" / "spotify.key"
SPOTIFY_OAUTH_FILE = Path.home() / "dev" / "spotify-oauth.json"
SPOTIFY_BEARER_FILE = Path.home() / "dev" / "spotify-bearer.key"
OPENROUTER_KEY_FILE = Path.home() / "dev" / "openrouter-api.key"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODEL = "openai/gpt-oss-20b:free"

TOKEN_URL = "https://accounts.spotify.com/api/token"
AUTH_URL = "https://accounts.spotify.com/authorize"
REDIRECT_URI = "http://127.0.0.1:8888/callback"
SCOPES = "playlist-read-private"
SEARCH_URL = "https://api.spotify.com/v1/search"
TRACKS_URL = "https://api.spotify.com/v1/playlists/{id}/tracks"
PARTNER_URL = "https://api-partner.spotify.com/pathfinder/v2/query"
CLIENT_TOKEN_URL = "https://clienttoken.spotify.com/v1/clienttoken"
PARTNER_HASH = "a65e12194ed5fc443a1cdebed5fabe33ca5b07b987185d63c72483867ad13cb4"
WEB_PLAYER_VERSION = "1.2.50.435.g9a862b4d"
WEB_PLAYER_CLIENT_ID = "d8a5ed958d274c2e8ee717e6a4b0971d"

BATCH_SIZE = 20
BATCH_DELAY = 2

EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F700-\U0001F77F"
    "\U0001F780-\U0001F7FF"
    "\U0001F800-\U0001F8FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FA6F"
    "\U0001FA70-\U0001FAFF"
    "\U00002600-\U000026FF"
    "\U00002700-\U000027BF"
    "\U0000FE00-\U0000FE0F"
    "\U0001F1E0-\U0001F1FF"
    "\U0000200D"
    "\U000020E3"
    "]+",
    flags=re.UNICODE,
)

# Hebrew letters/marks + digits + spaces + apostrophe only (no English)
VALID_NAME_RE = re.compile(r"^[֐-׿יִ-ﭏ0-9 ']+$")


def strip_emoji(text: str) -> str:
    return EMOJI_RE.sub("", text).strip()


def is_valid_name(name: str) -> bool:
    return bool(name) and bool(VALID_NAME_RE.match(name))


# ── Spotify ────────────────────────────────────────────────────────────────────

def load_spotify_creds() -> tuple[str, str]:
    if not SPOTIFY_KEY_FILE.exists():
        sys.exit(f"Error: {SPOTIFY_KEY_FILE} not found")
    creds = {}
    for line in SPOTIFY_KEY_FILE.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            creds[k.strip()] = v.strip()
    cid = creds.get("CLIENT_ID", "")
    secret = creds.get("CLIENT_SECRET", "")
    if not cid or not secret:
        sys.exit("Error: CLIENT_ID and CLIENT_SECRET required in spotify.key")
    return cid, secret


def get_token(client_id: str, client_secret: str) -> str:
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    data = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
    req = urllib.request.Request(
        TOKEN_URL,
        data=data,
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())["access_token"]


def get_oauth_token(client_id: str, client_secret: str) -> str:
    """Return a user OAuth token, refreshing or doing the browser flow as needed."""
    auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

    def exchange(code: str) -> dict:
        data = urllib.parse.urlencode({
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
        }).encode()
        req = urllib.request.Request(TOKEN_URL, data=data, headers={
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/x-www-form-urlencoded",
        })
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())

    def refresh(refresh_token: str) -> dict:
        data = urllib.parse.urlencode({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }).encode()
        req = urllib.request.Request(TOKEN_URL, data=data, headers={
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/x-www-form-urlencoded",
        })
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())

    # Try saved refresh token first
    if SPOTIFY_OAUTH_FILE.exists():
        saved = json.loads(SPOTIFY_OAUTH_FILE.read_text())
        try:
            tokens = refresh(saved["refresh_token"])
            # refresh response may not include a new refresh_token — keep old one
            if "refresh_token" not in tokens:
                tokens["refresh_token"] = saved["refresh_token"]
            SPOTIFY_OAUTH_FILE.write_text(json.dumps(tokens))
            print("OAuth token refreshed.")
            return tokens["access_token"]
        except Exception as e:
            print(f"Refresh failed ({e}), re-authorizing…")

    # Browser flow — manual paste (shell-only access)
    auth_params = urllib.parse.urlencode({
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
    })
    auth_link = f"{AUTH_URL}?{auth_params}"

    print("\nOpen this URL in your browser:")
    print(f"\n  {auth_link}\n")
    print("After approving, your browser will redirect to localhost:8888 (which will fail to load).")
    print("Copy the full URL from your browser's address bar and paste it here.\n")

    redirected = input("Paste redirect URL: ").strip()
    parsed = urllib.parse.urlparse(redirected)
    code = urllib.parse.parse_qs(parsed.query).get("code", [None])[0]
    if not code:
        sys.exit("Error: could not find 'code' in the pasted URL")

    tokens = exchange(code)
    SPOTIFY_OAUTH_FILE.write_text(json.dumps(tokens))
    SPOTIFY_OAUTH_FILE.chmod(0o600)
    print("OAuth token saved.")
    return tokens["access_token"]


def spotify_get(token: str, url: str, _retries: int = 3) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 429 and _retries > 0:
            wait = int(e.headers.get("Retry-After", 10))
            if wait > 120:
                raise RuntimeError(f"Rate limit too long ({wait}s) — skipping")
            print(f"  Rate limited, waiting {wait}s…")
            time.sleep(wait)
            return spotify_get(token, url, _retries - 1)
        raise


# ── Phase 1: Fetch ─────────────────────────────────────────────────────────────

PAGE_SIZE = 10

def fetch_playlists(token: str, existing_ids: set[str], max_results: int = 1000) -> list[dict]:
    results = []
    for offset in range(0, min(max_results, 1000), PAGE_SIZE):
        params = urllib.parse.urlencode({
            "q": "פלייליסט",
            "type": "playlist",
            "limit": PAGE_SIZE,
            "offset": offset,
        })
        data = spotify_get(token, f"{SEARCH_URL}?{params}")
        items = (data.get("playlists") or {}).get("items") or []
        if not items:
            break

        new_count = 0
        for pl in items:
            if not pl:
                continue
            pid = pl.get("id", "")
            if not pid or pid in existing_ids:
                continue
            name = strip_emoji(pl.get("name", ""))
            if not is_valid_name(name):
                continue
            existing_ids.add(pid)
            results.append({"id": pid, "name": name, "status": "unverified"})
            new_count += 1

        print(f"  offset={offset:4d}: {len(items)} returned, {new_count} new valid")
        time.sleep(0.1)

        if not items:
            break

    return results


# ── Phase 2: Classify ──────────────────────────────────────────────────────────

CLASSIFY_SYSTEM = """You will receive a JSON array of Hebrew playlist names: [{"id": "...", "name": "..."}]

Classify each name:
- "ok" if it is either (1) weird/funny — something that makes you smile or raises an eyebrow, OR (2) specific enough that you can clearly guess what music is in it (e.g. a specific activity, mood, or occasion with enough detail)
- "skip" if it is generic, boring, standard, or just a personal label with no real character

Always "skip":
- Numbered personal playlists: פלייליסט מס' X שלי, הפלייליסט שלי מס' 1, פלייליסט שלי 1, etc.
- Artist-name playlists: פלייליסט עדן בן זקן, יעקב שוואקי פלייליסט, etc.
- Name + car/vehicle: פלייליסט רכב מאיה, פלייליסט לאוטו של דני, etc.
- Generic occasion: פלייליסט של שבת, פלייליסט קיץ, פלייליסט חתונה, פלייליסט לים, etc.
- Generic workout/morning/sleep without a twist: פלייליסט בוקר, פלייליסט ריצה, פלייליסט אימון

Always "ok":
- Specific funny or weird context: פלייליסט קיץ לצרוח באוטו, פלייליסט צ׳יל ולחיטוט באף, פלייליסט של דפוקים
- Unexpectedly specific occasion: פלייליסט מקפיץ ניקיון יום שישי, פלייליסט שישי בישולים, פלייליסט אפוקליפסה
- Funny or absurd name: מגדליסט, פלייליסט לקופיף, פלייליסט חישגוזים

When in doubt, choose "skip".

Respond ONLY with a valid JSON array: [{"id": "...", "status": "ok" or "skip"}]"""


def load_openrouter_key() -> str:
    if not OPENROUTER_KEY_FILE.exists():
        sys.exit(f"Error: {OPENROUTER_KEY_FILE} not found")
    return OPENROUTER_KEY_FILE.read_text(encoding="utf-8").strip()


def classify_batch(playlists: list[dict], api_key: str, retries: int = 3) -> list[dict]:
    from openai import OpenAI, RateLimitError
    client = OpenAI(api_key=api_key, base_url=OPENROUTER_BASE_URL)

    payload = json.dumps(
        [{"id": p["id"], "name": p["name"]} for p in playlists],
        ensure_ascii=False,
    )
    for attempt in range(retries):
        try:
            resp = client.chat.completions.create(
                model=OPENROUTER_MODEL,
                messages=[
                    {"role": "system", "content": CLASSIFY_SYSTEM},
                    {"role": "user", "content": payload},
                ],
            )
            text = resp.choices[0].message.content or ""
            match = re.search(r"\[.*\]", text, re.DOTALL)
            if not match:
                print(f"  [WARN] Unparseable response: {text[:120]}", file=sys.stderr)
                return []
            return json.loads(match.group())
        except RateLimitError as e:
            wait = 30 * (attempt + 1)
            print(f"  Rate limited, waiting {wait}s… (attempt {attempt + 1}/{retries})")
            time.sleep(wait)
        except Exception as e:
            print(f"  [ERROR] classify_batch: {e}", file=sys.stderr)
            return []
    return []


def classify_all(records: list[dict], api_key: str) -> None:
    to_classify = [r for r in records if r.get("status") == "unverified"]
    if not to_classify:
        print("No unverified playlists to classify.")
        return

    print(f"Classifying {len(to_classify)} playlists in batches of {BATCH_SIZE}…")
    status_map: dict[str, str] = {}

    for i in range(0, len(to_classify), BATCH_SIZE):
        batch = to_classify[i:i + BATCH_SIZE]
        results = classify_batch(batch, api_key)
        for r in results:
            if "id" in r and "status" in r:
                status_map[r["id"]] = r["status"]
        print(f"  Batch {i // BATCH_SIZE + 1}/{-(-len(to_classify) // BATCH_SIZE)}: {len(results)} classified")
        if i + BATCH_SIZE < len(to_classify):
            time.sleep(BATCH_DELAY)

    for r in records:
        if r["id"] in status_map:
            r["status"] = status_map[r["id"]]


# ── Phase 3: Fetch tracks (partner API) ───────────────────────────────────────

def get_client_token() -> str:
    import uuid
    payload = json.dumps({
        "client_data": {
            "client_version": WEB_PLAYER_VERSION,
            "client_id": WEB_PLAYER_CLIENT_ID,
            "js_sdk_data": {
                "device_brand": "unknown", "device_model": "unknown",
                "os": "windows", "os_version": "NT 10.0",
                "device_id": str(uuid.uuid4()), "device_type": "computer",
            },
        }
    }).encode()
    req = urllib.request.Request(CLIENT_TOKEN_URL, data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["granted_token"]["token"]


def partner_get_tracks(bearer: str, client_token: str, playlist_id: str, limit: int = 10) -> list[dict]:
    body = json.dumps({
        "variables": {
            "uri": f"spotify:playlist:{playlist_id}",
            "offset": 0,
            "limit": limit,
            "includeEpisodeContentRatingsV2": False,
        },
        "operationName": "fetchPlaylistContents",
        "extensions": {"persistedQuery": {"version": 1, "sha256Hash": PARTNER_HASH}},
    }).encode()
    req = urllib.request.Request(PARTNER_URL, data=body, headers={
        "Authorization": f"Bearer {bearer}",
        "Client-Token": client_token,
        "app-platform": "WebPlayer",
        "spotify-app-version": WEB_PLAYER_VERSION,
        "Origin": "https://open.spotify.com",
        "Referer": "https://open.spotify.com/",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    })
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    tracks = []
    for item in (data.get("data", {}).get("playlistV2", {}).get("content", {}).get("items") or []):
        track_data = (item.get("itemV2") or {}).get("data") or {}
        if track_data.get("__typename") != "Track":
            continue
        artists = track_data.get("artists", {}).get("items") or []
        uri = track_data.get("uri", "")
        tracks.append({
            "id": uri.split(":")[-1] if uri else "",
            "name": track_data.get("name", ""),
            "artist": artists[0]["profile"]["name"] if artists else "",
        })
    return tracks


def fetch_tracks(records: list[dict], bearer: str) -> None:
    targets = [r for r in records if r.get("status") == "ok" and "tracks" not in r]
    if not targets:
        print("No 'ok' playlists without tracks.")
        return

    print(f"Fetching client token…")
    client_token = get_client_token()

    print(f"Fetching tracks for {len(targets)} playlists…")
    for pl in targets:
        try:
            tracks = partner_get_tracks(bearer, client_token, pl["id"])
            pl["tracks"] = tracks
            print(f"  {pl['name']}: {len(tracks)} tracks")
        except Exception as e:
            print(f"  [ERROR] {pl['name']}: {e}", file=sys.stderr)
        time.sleep(0.5)


# ── I/O ────────────────────────────────────────────────────────────────────────

def load_records() -> list[dict]:
    if not OUTPUT_FILE.exists():
        return []
    records = []
    for line in OUTPUT_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return records


def save_records(records: list[dict]) -> None:
    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


# ── main ───────────────────────────────────────────────────────────────────────

def run_fetch(args):
    cid, secret = load_spotify_creds()
    token = get_oauth_token(cid, secret)

    print("=== Phase 1: Fetching from Spotify ===")
    records = load_records()
    existing_ids = {r["id"] for r in records}
    print(f"Loaded {len(records)} existing records.")
    new_records = fetch_playlists(token, existing_ids, max_results=args.max)
    print(f"Found {len(new_records)} new playlists.")
    records.extend(new_records)
    save_records(records)
    print(f"Saved {len(records)} total to {OUTPUT_FILE}\n")

    print("=== Phase 2: Classifying with OpenRouter ===")
    or_key = load_openrouter_key()
    classify_all(records, or_key)
    save_records(records)
    ok_count = sum(1 for r in records if r.get("status") == "ok")
    print(f"Classification done. {ok_count} 'ok' playlists.")


def run_tracks(args):
    if not SPOTIFY_BEARER_FILE.exists():
        sys.exit(f"Error: {SPOTIFY_BEARER_FILE} not found — save your bearer token there first")
    bearer = SPOTIFY_BEARER_FILE.read_text().strip()

    print("=== Fetching tracks for 'ok' playlists ===")
    records = load_records()
    ok_count = sum(1 for r in records if r.get("status") == "ok")
    print(f"Loaded {len(records)} records, {ok_count} 'ok'.")
    fetch_tracks(records, bearer)
    save_records(records)
    fetched = sum(1 for r in records if r.get("tracks"))
    print(f"Done. {fetched} playlists have tracks.")


def main():
    import argparse
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="phase", required=True)

    p_fetch = sub.add_parser("fetch", help="Fetch playlist names from Spotify and classify them")
    p_fetch.add_argument("--max", type=int, default=1000, help="Max playlists to fetch (default: 1000)")

    sub.add_parser("tracks", help="Fetch tracks for all 'ok' playlists using bearer token")

    args = parser.parse_args()

    if args.phase == "fetch":
        run_fetch(args)
    elif args.phase == "tracks":
        run_tracks(args)


if __name__ == "__main__":
    main()
