"""
Scrape posts from a Reddit community using Reddit's JSON API (no credentials needed).

Usage:
    python scripts/fetch_reddit_posts.py --subreddit t5_2w7et
    python scripts/fetch_reddit_posts.py --subreddit t5_2w7et --sort new --limit 500
    python scripts/fetch_reddit_posts.py --subreddit t5_2w7et --output scripts/reddit_posts.ndjson
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

SCRIPT_DIR = Path(__file__).parent
OUTPUT_FILE = SCRIPT_DIR / "reddit_posts.ndjson"

# Reddit requires a descriptive User-Agent; plain "python" gets rate-limited
USER_AGENT = "bluffalo-scraper/1.0 (fact-collection bot)"

API_BASE = "https://www.reddit.com/r/{subreddit}/{sort}.json"
API_INFO = "https://www.reddit.com/api/info.json?id={fullname}&raw_json=1"
PAGE_SIZE = 100  # Reddit max per request


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Scrape posts from a Reddit community")
    p.add_argument("--subreddit", type=str, required=True,
                   help="Subreddit name or ID (e.g. t5_2w7et or Python)")
    p.add_argument("--sort", type=str, default="new",
                   choices=["new", "hot", "top", "rising"],
                   help="Sort order (default: new)")
    p.add_argument("--limit", type=int, default=0,
                   help="Max posts to collect, 0 = unlimited (default: 0)")
    p.add_argument("--output", type=str, default=str(OUTPUT_FILE),
                   help="Output NDJSON file path")
    p.add_argument("--delay", type=float, default=1.0,
                   help="Politeness delay in seconds between requests (default: 1.0)")
    p.add_argument("--time-filter", type=str, default="all",
                   choices=["hour", "day", "week", "month", "year", "all"],
                   help="Time filter for 'top' sort (default: all)")
    return p.parse_args()


def load_seen_ids(output: Path) -> set[str]:
    if not output.exists():
        return set()
    ids: set[str] = set()
    with output.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    ids.add(json.loads(line)["id"])
                except (json.JSONDecodeError, KeyError):
                    pass
    return ids


def resolve_display_name(subreddit: str) -> str:
    """If subreddit looks like a fullname (t5_XXXX), resolve to display name via API."""
    if not subreddit.startswith("t5_"):
        return subreddit
    url = API_INFO.format(fullname=subreddit)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        children = data.get("data", {}).get("children", [])
        if children and children[0].get("kind") == "t5":
            name = children[0]["data"].get("display_name", "")
            if name:
                print(f"Resolved {subreddit} -> r/{name}")
                return name
    except Exception as e:
        print(f"[WARN] Could not resolve subreddit fullname: {e}", file=sys.stderr)
    return subreddit


def fetch_page(subreddit: str, sort: str, after: Optional[str], time_filter: str) -> Optional[dict]:
    url = API_BASE.format(subreddit=subreddit, sort=sort)
    params = f"?limit={PAGE_SIZE}&raw_json=1"
    if after:
        params += f"&after={after}"
    if sort == "top":
        params += f"&t={time_filter}"

    req = urllib.request.Request(url + params, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                return None
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"[ERROR] Subreddit not found: r/{subreddit}", file=sys.stderr)
        elif e.code == 403:
            print(f"[ERROR] Subreddit is private or banned: r/{subreddit}", file=sys.stderr)
        elif e.code == 429:
            print("[WARN] Rate limited — waiting 10 seconds before retry ...", file=sys.stderr)
            time.sleep(10)
            return fetch_page(subreddit, sort, after, time_filter)
        else:
            print(f"[WARN] HTTP {e.code} for {url}", file=sys.stderr)
        return None
    except urllib.error.URLError as e:
        print(f"[ERROR] Request failed: {e.reason}", file=sys.stderr)
        return None


def is_promoted(post_data: dict) -> bool:
    return bool(
        post_data.get("promoted")
        or post_data.get("distinguished") == "admin"
        or post_data.get("whitelist_status") == "promo_all"
    )


def extract_text(post_data: dict) -> str:
    title = post_data.get("title", "").strip()
    selftext = post_data.get("selftext", "").strip()
    # Skip removed/deleted body text
    if selftext in ("[removed]", "[deleted]", ""):
        return title
    return f"{title}\n\n{selftext}"


def scrape(subreddit: str, sort: str, limit: int, output: Path, delay: float, time_filter: str) -> None:
    seen_ids = load_seen_ids(output)
    print(f"Loaded {len(seen_ids)} already-seen IDs from {output}")

    after: Optional[str] = None
    total_new = 0
    total_skipped_promoted = 0
    page_num = 0

    with output.open("a", encoding="utf-8") as out:
        while True:
            if limit > 0 and total_new >= limit:
                print(f"Reached limit of {limit} posts.")
                break

            page_num += 1
            print(f"Fetching page {page_num} (after={after or 'start'}) ...")
            data = fetch_page(subreddit, sort, after, time_filter)

            if data is None:
                print("No data returned. Stopping.")
                break

            listing = data.get("data", {})
            children = listing.get("children", [])

            if not children:
                print("No more posts. Done.")
                break

            new_on_page = 0
            for child in children:
                if child.get("kind") != "t3":  # t3 = link/post
                    continue
                post = child["data"]

                if is_promoted(post):
                    total_skipped_promoted += 1
                    continue

                post_id = post.get("id", "")
                if not post_id or post_id in seen_ids:
                    continue

                text = extract_text(post)
                if not text:
                    continue

                record = {
                    "id": post_id,
                    "text": text,
                    "title": post.get("title", "").strip(),
                    "url": f"https://www.reddit.com{post.get('permalink', '')}",
                    "time": post.get("created_utc", ""),
                    "score": post.get("score", 0),
                    "is_self": post.get("is_self", False),
                }

                seen_ids.add(post_id)
                out.write(json.dumps(record, ensure_ascii=False) + "\n")
                out.flush()
                new_on_page += 1
                total_new += 1
                if limit > 0 and total_new >= limit:
                    break

            after = listing.get("after")
            print(f"  Page {page_num}: {len(children)} posts fetched, {new_on_page} new, {total_skipped_promoted} promoted skipped (total new: {total_new})")

            if not after:
                print("No more pages. Done.")
                break

            time.sleep(delay)

    print(f"\nDone. {total_new} new posts written to {output}")
    if total_skipped_promoted:
        print(f"Skipped {total_skipped_promoted} promoted posts.")


def main() -> None:
    args = parse_args()
    output = Path(args.output)
    subreddit = resolve_display_name(args.subreddit)
    scrape(subreddit, args.sort, args.limit, output, args.delay, args.time_filter)


if __name__ == "__main__":
    main()
