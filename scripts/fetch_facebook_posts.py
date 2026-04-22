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

                const id = article.getAttribute('aria-label') || '';
                const textEl = article.querySelector('[data-ad-comet-preview="message"], [dir="auto"]');
                const text = textEl ? textEl.innerText.trim() : '';
                const timeEl = article.querySelector('abbr, time');
                const time = timeEl ? (timeEl.getAttribute('data-utime') || timeEl.getAttribute('datetime') || timeEl.innerText) : '';
                const linkEl = article.querySelector('a[href*="/permalink/"], a[href*="/posts/"]');
                const url = linkEl ? linkEl.href : '';

                const key = url || text.slice(0, 50);
                if (!key || seen.has(key)) return;
                seen.add(key);

                if (text) posts.push({ text, time, url });
            });
            return posts;
        }
    """)


def scrape(group_url: str, pages: int, cookies_path: Optional[str], headless: bool, output: Path) -> List[dict]:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(
            locale="he-IL",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        )

        if cookies_path:
            pw_cookies = load_netscape_cookies(cookies_path)
            context.add_cookies(pw_cookies)
            print(f"Loaded {len(pw_cookies)} cookies")

        page = context.new_page()
        print(f"Opening {group_url} ...")
        page.goto(group_url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)

        all_posts = {}
        if output.exists():
            try:
                existing = json.loads(output.read_text(encoding="utf-8"))
                for post in existing:
                    key = post.get("url") or post["text"][:60]
                    all_posts[key] = post
                print(f"Resumed from existing file — {len(all_posts)} posts already collected")
            except (json.JSONDecodeError, KeyError):
                print("Could not read existing output file, starting fresh")

        for i in range(pages):
            batch = extract_posts(page)
            new = 0
            for post in batch:
                key = post.get("url") or post["text"][:60]
                if key not in all_posts:
                    all_posts[key] = post
                    new += 1
            print(f"Scroll {i+1}/{pages} — {new} new posts (total: {len(all_posts)})")
            output.write_text(json.dumps(list(all_posts.values()), ensure_ascii=False, indent=2), encoding="utf-8")
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(2500)

        browser.close()
        return list(all_posts.values())


def main():
    args = parse_args()
    output = Path(args.output)
    posts = scrape(GROUP_URL, args.pages, args.cookies, args.headless, output)
    print(f"\nSaved {len(posts)} posts -> {output}")


if __name__ == "__main__":
    main()
