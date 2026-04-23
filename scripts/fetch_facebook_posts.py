"""
Scrape posts from a Facebook group using Playwright (real browser).
Install: pip install playwright && python -m playwright install chromium
Usage:   python fetch_facebook_posts.py
         python fetch_facebook_posts.py --pages 5 --cookies cookies.txt
"""

import argparse
import json
import sys
import time
from http.cookiejar import MozillaCookieJar
from pathlib import Path
from typing import List, Optional

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("Missing dependency. Run: pip install playwright && python -m playwright install chromium")

"""
Usage: python scripts/fetch_facebook_posts.py --cookies "C:/Users/Aviv/Downloads/cookies.txt" --pages 10
"""

GROUP_URL = "https://www.facebook.com/groups/unimportant.facts/"
OUTPUT_FILE = Path(__file__).parent / "facebook_posts.json"


def parse_args():
    p = argparse.ArgumentParser(description="Scrape Facebook group posts")
    p.add_argument("--pages", type=int, default=5, help="Number of scroll pages (default: 5)")
    p.add_argument("--cookies", type=str, default=None,
                   help="Path to a Netscape-format cookies.txt file")
    p.add_argument("--output", type=str, default=str(OUTPUT_FILE),
                   help="Output JSON file path")
    p.add_argument("--headless", action="store_true", default=True,
                   help="Run browser in headless mode (default: True)")
    p.add_argument("--restart-every", type=int, default=50,
                   help="Restart browser context every N scroll pages to free memory (default: 50)")
    p.add_argument("--save-every", type=int, default=10,
                   help="Write JSON to disk every N scrolls (default: 10)")
    return p.parse_args()


def load_netscape_cookies(path: str) -> List[dict]:
    """Convert Netscape cookies.txt to Playwright cookie dicts."""
    jar = MozillaCookieJar()
    jar.load(path, ignore_discard=True, ignore_expires=True)
    cookies = []
    for c in jar:
        cookies.append({
            "name": c.name,
            "value": c.value,
            "domain": c.domain,
            "path": c.path,
            "secure": bool(c.secure),
            "httpOnly": False,
            "sameSite": "None",
        })
    return cookies


def extract_posts(page) -> List[dict]:
    """Extract post text and metadata from current page DOM."""
    return page.evaluate("""
        () => {
            const posts = [];
            const seen = new Set();

            // Facebook posts live in <div role="article"> or <div data-pagelet^="FeedUnit">
            const articles = document.querySelectorAll('[role="article"]');
            articles.forEach(article => {
                // Skip nested articles (comments)
                if (article.closest('[role="article"] [role="article"]')) return;

                const textEl = article.querySelector('[data-ad-comet-preview="message"], [dir="auto"]');
                const text = textEl ? textEl.innerText.trim() : '';
                const timeEl = article.querySelector('abbr, time');
                const time = timeEl ? (timeEl.getAttribute('data-utime') || timeEl.getAttribute('datetime') || timeEl.innerText) : '';
                const linkEl = article.querySelector('a[href*="/permalink/"], a[href*="/posts/"]');
                const url = linkEl ? linkEl.href : '';

                const idMatch = url.match(/\/posts\/(\d+)/);
                const id = idMatch ? idMatch[1] : null;

                const key = id || text.slice(0, 50);
                if (!key || seen.has(key)) return;
                seen.add(key);

                if (text) posts.push({ id, text, time, url });
            });
            return posts;
        }
    """)


def save_posts(all_posts: dict, output: Path):
    output.write_text(json.dumps(list(all_posts.values()), ensure_ascii=False, indent=2), encoding="utf-8")


def scrape(group_url: str, pages: int, cookies_path: Optional[str], headless: bool, output: Path, restart_every: int, save_every: int) -> List[dict]:
    all_posts = {}
    if output.exists():
        try:
            existing = json.loads(output.read_text(encoding="utf-8"))
            for post in existing:
                key = post.get("id") or post["text"][:60]
                all_posts[key] = post
            print(f"Resumed from existing file — {len(all_posts)} posts already collected")
        except (json.JSONDecodeError, KeyError):
            print("Could not read existing output file, starting fresh")

    def expand_posts(pg):
        pg.evaluate("""
            () => {
                document.querySelectorAll('[role="article"]').forEach(article => {
                    article.querySelectorAll('div[role="button"], span[role="button"]').forEach(btn => {
                        if (btn.innerText && btn.innerText.trim().startsWith('עוד')) btn.click();
                    });
                });
            }
        """)
        pg.wait_for_timeout(500)

    def run_session(pw, start_scroll, end_scroll):
        browser = pw.chromium.launch(headless=headless)
        context = browser.new_context(
            locale="he-IL",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        )
        if cookies_path:
            pw_cookies = load_netscape_cookies(cookies_path)
            context.add_cookies(pw_cookies)
            print(f"[Session] Loaded {len(pw_cookies)} cookies")

        page = context.new_page()
        print(f"[Session] Opening {group_url} (scrolls {start_scroll+1}–{end_scroll}) ...")
        page.goto(group_url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)

        if start_scroll > 0:
            print(f"[Session] Fast-scrolling through {start_scroll} previous scrolls to resume position ...")
            for _ in range(start_scroll):
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(300)
            print(f"[Session] Resuming at scroll {start_scroll+1}")

        for i in range(start_scroll, end_scroll):
            expand_posts(page)
            batch = extract_posts(page)
            new = 0
            for post in batch:
                key = post.get("id") or post["text"][:60]
                if key not in all_posts:
                    all_posts[key] = post
                    new += 1
            print(f"Scroll {i+1}/{pages} — {new} new posts (total: {len(all_posts)})")
            if (i + 1) % save_every == 0:
                save_posts(all_posts, output)

            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(2500)

        browser.close()
        save_posts(all_posts, output)

    with sync_playwright() as pw:
        for chunk_start in range(0, pages, restart_every):
            chunk_end = min(chunk_start + restart_every, pages)
            print(f"--- Starting browser session for scrolls {chunk_start+1}–{chunk_end} ---")
            run_session(pw, chunk_start, chunk_end)
            if chunk_end < pages:
                print(f"--- Restarting browser to free memory (total so far: {len(all_posts)}) ---")

    return list(all_posts.values())


def main():
    args = parse_args()
    output = Path(args.output)
    posts = scrape(GROUP_URL, args.pages, args.cookies, args.headless, output, args.restart_every, args.save_every)
    print(f"\nSaved {len(posts)} posts -> {output}")


if __name__ == "__main__":
    main()
