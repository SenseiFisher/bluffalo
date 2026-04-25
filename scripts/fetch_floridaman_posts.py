"""
Scrape post titles from floridaman.com and write to NDJSON.

Usage:
    python scripts/fetch_floridaman_posts.py
    python scripts/fetch_floridaman_posts.py --output scripts/floridaman_posts.ndjson
    python scripts/fetch_floridaman_posts.py --start-page 5 --delay 2
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Optional

SCRIPT_DIR = Path(__file__).parent
OUTPUT_FILE = SCRIPT_DIR / "floridaman_posts.ndjson"
BASE_URL = "https://floridaman.com/page/{n}/?s=+"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Scrape post titles from floridaman.com")
    p.add_argument("--output", type=str, default=str(OUTPUT_FILE),
                   help="Output NDJSON file path")
    p.add_argument("--start-page", type=int, default=1,
                   help="Page number to start from (default: 1)")
    p.add_argument("--delay", type=float, default=1.0,
                   help="Politeness delay in seconds between requests (default: 1.0)")
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


def slug_from_url(url: str) -> str:
    return url.rstrip("/").rsplit("/", 1)[-1]


def fetch_page(url: str) -> Optional[str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                return None
            final_url = resp.url
            # Guard against WordPress redirecting out-of-range pages to the homepage
            if "floridaman.com/page/" not in final_url and "?s=" not in final_url:
                return None
            return resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        print(f"[WARN] HTTP {e.code} for {url}", file=sys.stderr)
        return None
    except urllib.error.URLError as e:
        print(f"[ERROR] Request failed for {url}: {e.reason}", file=sys.stderr)
        return None


class EntryTitleParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.results: list[dict] = []
        self._in_entry_title = False
        self._entry_title_depth = 0
        self._current_depth = 0
        self._current_href: Optional[str] = None
        self._capture_text = False
        self._current_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        self._current_depth += 1
        attr_dict = dict(attrs)

        if tag in ("h1", "h2", "h3"):
            classes = attr_dict.get("class", "")
            if "entry-title" in classes:
                self._in_entry_title = True
                self._entry_title_depth = self._current_depth
                self._current_href = None
                self._current_text = []
                self._capture_text = False
            return

        if self._in_entry_title and tag == "a":
            href = attr_dict.get("href", "")
            if "floridaman.com/" in href:
                self._current_href = href
                self._capture_text = True

    def handle_endtag(self, tag: str) -> None:
        if self._capture_text and tag == "a":
            self._capture_text = False

        if self._in_entry_title and tag in ("h1", "h2", "h3"):
            if self._current_depth == self._entry_title_depth:
                if self._current_href and self._current_text:
                    title = "".join(self._current_text).strip()
                    slug = slug_from_url(self._current_href)
                    if slug and title:
                        self.results.append({"id": slug, "post": title})
                self._in_entry_title = False
                self._current_href = None
                self._current_text = []

        self._current_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._capture_text:
            self._current_text.append(data)


def parse_posts(html: str) -> list[dict]:
    parser = EntryTitleParser()
    parser.feed(html)
    return parser.results


def scrape(output: Path, start_page: int, delay: float) -> None:
    seen_ids = load_seen_ids(output)
    print(f"Loaded {len(seen_ids)} already-seen IDs from {output}")

    page_num = start_page
    total_new = 0

    with output.open("a", encoding="utf-8") as out:
        while True:
            url = BASE_URL.format(n=page_num)
            print(f"Fetching page {page_num}: {url}")
            html = fetch_page(url)

            if html is None:
                print(f"No response or redirect at page {page_num}. Stopping.")
                break

            posts = parse_posts(html)

            if not posts:
                print(f"No posts found on page {page_num}. Stopping.")
                break

            new_on_page = 0
            for post in posts:
                if post["id"] in seen_ids:
                    continue
                seen_ids.add(post["id"])
                out.write(json.dumps(post, ensure_ascii=False) + "\n")
                out.flush()
                new_on_page += 1
                total_new += 1

            print(f"  Page {page_num}: {len(posts)} posts found, {new_on_page} new")
            page_num += 1
            time.sleep(delay)

    print(f"\nDone. {total_new} new posts written to {output}")


def main() -> None:
    args = parse_args()
    output = Path(args.output)
    scrape(output, args.start_page, args.delay)


if __name__ == "__main__":
    main()
