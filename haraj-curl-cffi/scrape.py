"""Variant 3: browserless Haraj search via TLS impersonation (curl_cffi).
Usage: python scrape.py "غسالة" [--limit 20]   → JSON on stdout
"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone

from curl_cffi import requests

GRAPHQL_URL = "https://graphql.haraj.com.sa/?queryName=search"
SEARCH_QUERY = """query Search($search: String!, $city: String, $page: Int, $limit: Int) {
  search(search: $search, city: $city, page: $page, limit: $limit) {
    items {
      id title postDate updateDate authorUsername URL bodyTEXT
      thumbURL city geoCity geoNeighborhood tags
      price { formattedPrice inputPrice }
    }
    pageInfo { hasNextPage }
  }
}"""


def map_item(g):
    epoch = g.get("postDate") or g.get("updateDate") or 0
    try:
        date = datetime.fromtimestamp(float(epoch), tz=timezone.utc).strftime("%Y-%m-%d") if epoch else None
    except (TypeError, ValueError):
        date = None
    price = (g.get("price") or {})
    url = g.get("URL") or ""
    return {
        "id": g.get("id"),
        "title": g.get("title"),
        "price": price.get("formattedPrice") or (str(price.get("inputPrice")) if price.get("inputPrice") is not None else None),
        "city": g.get("city") or g.get("geoCity"),
        "date": date,
        "seller": g.get("authorUsername"),
        "url": url if url.startswith("http") else "https://haraj.com.sa/" + url.lstrip("/"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("keyword", nargs="?", default="غسالة")
    ap.add_argument("--limit", type=int, default=20)
    args = ap.parse_args()

    t0 = time.perf_counter()
    s = requests.Session(impersonate="chrome")
    r = s.post(
        GRAPHQL_URL,
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "Origin": "https://haraj.com.sa", "Referer": "https://haraj.com.sa/"},
        json={"query": SEARCH_QUERY, "variables": {"search": args.keyword, "page": 1, "limit": args.limit}},
        timeout=20,
    )
    r.raise_for_status()
    # Haraj answers HTTP 200 with a literal "..." body for rejected shapes.
    if r.text.strip() == "...":
        raise SystemExit("GraphQL rejected query shape")
    data = r.json()
    items = ((data.get("data") or {}).get("search") or {}).get("items")
    if not isinstance(items, list):
        raise SystemExit("GraphQL unexpected shape")
    mapped = [m for m in (map_item(g) for g in items) if m["url"] and m["title"]][: args.limit]
    print(json.dumps({"source": "curl-cffi", "keyword": args.keyword,
                      "ms": int((time.perf_counter() - t0) * 1000),
                      "count": len(mapped), "items": mapped}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": str(e)[:200]}, ensure_ascii=False))
        sys.exit(1)
