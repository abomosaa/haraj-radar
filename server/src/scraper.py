from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import asdict

from playwright.async_api import BrowserContext, Page, TimeoutError as PlaywrightTimeoutError, async_playwright

from .config import (
    DETAIL_SCRAPE_LIMIT,
    NAVIGATION_TIMEOUT_MS,
    RESPECTFUL_DELAY_SECONDS,
    SELECTORS,
    USER_AGENT,
    build_search_url,
)
from .extractors import build_listing, build_listings, merge_listing_detail
from .models import Listing


async def _wait_for_results(page: Page) -> None:
    """Wait for likely result anchors instead of brittle container selectors."""

    await page.wait_for_load_state("domcontentloaded")
    await page.wait_for_selector(SELECTORS.listing_link_selector)
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(RESPECTFUL_DELAY_SECONDS)


async def _extract_raw_items(page: Page) -> list[dict[str, str | None]]:
    """Read visible result-level data from the search page."""

    script = r"""
    ({ listingSelector, citySelector, rootCandidates }) => {
      const toAbsolute = (href) => {
        try {
          return new URL(href, window.location.origin).href;
        } catch {
          return null;
        }
      };

      const isListingUrl = (href) => {
        if (!href) return false;
        return /^https:\/\/haraj\.com\.sa\/\d{8,}\//i.test(href);
      };

      const normalize = (value) => value ? value.replace(/\s+/g, ' ').trim() : null;
      const pricePattern = /^(?:(?:\d[\d,.]{2,})\s*(?:ريال|ر\.س|SAR)?|(?:ريال|ر\.س|SAR)\s*\d[\d,.]*)$/i;
      const results = [];
      const seen = new Set();

      for (const anchor of document.querySelectorAll(listingSelector)) {
        const href = toAbsolute(anchor.getAttribute('href'));
        if (!isListingUrl(href) || seen.has(href)) continue;

        const title = normalize(anchor.textContent);
        if (!title) continue;

        let root = anchor;
        while (root.parentElement) {
          const parent = root.parentElement;
          if (rootCandidates.includes(parent.tagName.toLowerCase()) && parent.querySelector(citySelector)) {
            root = parent;
            break;
          }
          root = parent;
        }

        const cityElement = root.querySelector(citySelector);
        const lines = (root.innerText || '')
          .split('\n')
          .map((line) => normalize(line))
          .filter(Boolean);

        let priceLine = null;
        for (let index = lines.length - 1; index >= 0; index -= 1) {
          if (pricePattern.test(lines[index])) {
            priceLine = lines[index];
            break;
          }
        }

        results.push({
          title,
          url: href,
          city: normalize(cityElement ? cityElement.textContent : null),
          price: priceLine || normalize(root.getAttribute('aria-label')),
          date: null,
          description: null,
          context_text: normalize(root.innerText),
        });

        seen.add(href);
      }

      return results;
    }
    """

    return await page.evaluate(
        script,
        {
            "listingSelector": SELECTORS.listing_link_selector,
            "citySelector": SELECTORS.city_link_selector,
            "rootCandidates": list(SELECTORS.root_container_candidates),
        },
    )


async def _create_context() -> tuple[BrowserContext, object, object]:
    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch(headless=True)
    context = await browser.new_context(user_agent=USER_AGENT, locale="ar-SA")

    async def route_handler(route, request):
        if request.resource_type in {"image", "media", "font"}:
            await route.abort()
            return
        await route.continue_()

    await context.route("**/*", route_handler)
    context.set_default_timeout(NAVIGATION_TIMEOUT_MS)
    return context, browser, playwright


async def _extract_listing_detail(page: Page, url: str) -> Listing | None:
    script = r"""
    ({ selectors }) => {
      const normalize = (value) => value ? value.replace(/\s+/g, ' ').trim() : null;

      const pickText = (selectorList) => {
        for (const selector of selectorList) {
          const node = document.querySelector(selector);
          if (!node) continue;

          if (node.tagName.toLowerCase() === 'meta') {
            const content = normalize(node.getAttribute('content'));
            if (content) return content;
          }

          const text = normalize(node.textContent || node.innerText);
          if (text) return text;
        }
        return null;
      };

      const readDate = () => {
        const timeNode = document.querySelector('time[datetime]');
        if (timeNode) {
          const attr = normalize(timeNode.getAttribute('datetime'));
          if (attr) return attr;
        }

        for (const selector of selectors.listing_date_selectors) {
          const node = document.querySelector(selector);
          const text = normalize(node ? (node.textContent || node.innerText) : null);
          if (text) return text;
        }

        const body = normalize(document.body ? document.body.innerText : null) || '';
        const dateMatch = body.match(/\b\d{4}[-\/]\d{2}[-\/]\d{2}\b|\b\d{2}\/\d{2}\/\d{4}\b/);
        return dateMatch ? dateMatch[0] : null;
      };

      const readDescription = () => {
        let best = null;

        for (const selector of selectors.listing_description_selectors) {
          const nodes = Array.from(document.querySelectorAll(selector));
          for (const node of nodes) {
            const text = normalize(node.textContent || node.innerText);
            if (!text) continue;
            if (!best || text.length > best.length) best = text;
          }
        }

        if (best) return best;

        const allParagraphs = Array.from(document.querySelectorAll('p, li, div'))
          .map((node) => normalize(node.textContent || node.innerText))
          .filter(Boolean)
          .filter((line) => line.length > 20)
          .sort((a, b) => b.length - a.length);

        return allParagraphs.length ? allParagraphs[0] : null;
      };

      return {
        title: pickText(selectors.listing_title_selectors),
        price: pickText(selectors.listing_price_selectors),
        city: pickText(selectors.listing_city_selectors),
        date: readDate(),
        description: readDescription(),
        url: window.location.href,
        context_text: normalize(document.body ? document.body.innerText : null),
      };
    }
    """

    await page.goto(url, wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(RESPECTFUL_DELAY_SECONDS)
    raw_item = await page.evaluate(script, {"selectors": asdict(SELECTORS)})
    return build_listing(raw_item)


async def _enrich_listings_with_details(
    context: BrowserContext,
    listings: list[Listing],
    detail_limit: int,
    status_callback: Callable[[str], None] | None = None,
) -> list[Listing]:
    if detail_limit <= 0:
        return listings

    enriched = list(listings)
    limit = min(detail_limit, len(listings))
    page = await context.new_page()

    try:
        for index in range(limit):
            current = enriched[index]
            if not current.url:
                continue

            if status_callback is not None:
                status_callback(f"جاري قراءة تفاصيل الإعلان {index + 1}/{limit}...")

            try:
                detailed = await _extract_listing_detail(page, current.url)
            except PlaywrightTimeoutError:
                continue
            except Exception:
                continue

            if detailed is not None:
                enriched[index] = merge_listing_detail(current, detailed)
    finally:
        await page.close()

    return enriched


async def scrape_search_results(
    keyword: str,
    detail_limit: int = DETAIL_SCRAPE_LIMIT,
    status_callback: Callable[[str], None] | None = None,
) -> list[Listing]:
    """Scrape first-page search results, then enrich first N rows from listing pages."""

    search_url = build_search_url(keyword)
    context, browser, playwright = await _create_context()
    page = await context.new_page()

    try:
        if status_callback is not None:
            status_callback("جاري تحميل صفحة البحث...")

        await page.goto(search_url, wait_until="domcontentloaded")
        await _wait_for_results(page)
        raw_items = await _extract_raw_items(page)
        listings = build_listings(raw_items)

        return await _enrich_listings_with_details(
            context=context,
            listings=listings,
            detail_limit=detail_limit,
            status_callback=status_callback,
        )
    except PlaywrightTimeoutError as exc:
        raise RuntimeError("Timed out while loading Haraj search results.") from exc
    finally:
        await context.close()
        await browser.close()
        await playwright.stop()
