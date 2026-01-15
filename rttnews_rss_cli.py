#!/usr/bin/env python3
import sys
import urllib.request
import urllib.error
import urllib.parse
import xml.etree.ElementTree as ET
import html
import time
import os
import json
import datetime as dt
import curses
import io
import threading
import contextlib
import tkinter as tk
from tkinter import scrolledtext
import re
import webbrowser
from email.utils import parsedate_to_datetime
from typing import List, Dict, Optional, Tuple

FINNHUB_API_KEY_DEFAULT = "cr59shhr01qrns9mpm20cr59shhr01qrns9mpm2g"

def build_feeds() -> List[Dict[str, str]]:
	"""
	Return a list of feeds with abbreviation, title, and url.
	Source: https://www.rttnews.com/rss/rssarticlelist.aspx
	"""
	return [
		{"abbr": "TS", "title": "Top Stories", "url": "https://www.rttnews.com/RSS/Todaystop.xml"},
		{"abbr": "BN", "title": "Breaking News", "url": "https://www.rttnews.com/RSS/breakingnews.xml"},
		{"abbr": "ERN", "title": "Earnings News", "url": "https://www.rttnews.com/RSS/Earnings.xml"},
		{"abbr": "POL", "title": "Political News", "url": "https://www.rttnews.com/RSS/Political.xml"},
		{"abbr": "ECO", "title": "Economic News", "url": "https://www.rttnews.com/RSS/EconomicNews.xml"},
		{"abbr": "IPO", "title": "IPO News/Alerts", "url": "https://www.rttnews.com/RSS/IPO.xml"},
		{"abbr": "MA", "title": "Market Analysis", "url": "https://www.rttnews.com/RSS/MarketAnalysis.xml"},
		{"abbr": "CMT", "title": "Commentary", "url": "https://www.rttnews.com/RSS/commentary.xml"},
		{"abbr": "USMU", "title": "US Market Updates", "url": "https://www.rttnews.com/RSS/USMarketUpdate.xml"},
		{"abbr": "EUMU", "title": "European Market Updates", "url": "https://www.rttnews.com/RSS/EuropeMarketUpdate.xml"},
		{"abbr": "ASMU", "title": "Asian Market Updates", "url": "https://www.rttnews.com/RSS/AsiaMarketUpdate.xml"},
		{"abbr": "PMTA", "title": "Pre-Market Trading Alerts", "url": "https://www.rttnews.com/RSS/stockalerts.xml"},
		{"abbr": "STSA", "title": "Short-Term Stock Alerts", "url": "https://www.rttnews.com/RSS/momentum.xml"},
		{"abbr": "HOT", "title": "Hot Stocks", "url": "https://www.rttnews.com/RSS/HotStocks.xml"},
		{"abbr": "CAN", "title": "Canadian News", "url": "https://www.rttnews.com/RSS/canadiannews.xml"},
		{"abbr": "SECT", "title": "Market/Sector Trends", "url": "https://www.rttnews.com/RSS/SectorTrends.xml"},
		{"abbr": "ENTTOP", "title": "Entertainment Top Story", "url": "https://www.rttnews.com/RSS/EntTopStory.xml"},
		{"abbr": "MUSIC", "title": "Music News", "url": "https://www.rttnews.com/RSS/MusicNews.xml"},
		{"abbr": "MOVREV", "title": "Movie Reviews", "url": "https://www.rttnews.com/RSS/MovieReviews.xml"},
		{"abbr": "DVD", "title": "DVD Releases", "url": "https://www.rttnews.com/RSS/DVDReleases.xml"},
		{"abbr": "FXTOP", "title": "Forex Top Story", "url": "https://www.rttnews.com/RSS/ForexTopStory.xml"},
		{"abbr": "CURR", "title": "Currency Market", "url": "https://www.rttnews.com/RSS/CurrencyAlerts.xml"},
		{"abbr": "HEALTH", "title": "Health News", "url": "https://www.rttnews.com/RSS/HealthNews.xml"},
		{"abbr": "BIO", "title": "Biotech", "url": "https://www.rttnews.com/RSS/Biotech.xml"},
		{"abbr": "TECH", "title": "Technology", "url": "https://www.rttnews.com/RSS/Technology.xml"},
		# Duplicates on the page with different titles/casing:
		{"abbr": "MOM", "title": "Momentum", "url": "https://www.rttnews.com/RSS/Momentum.xml"},
		{"abbr": "BELL", "title": "Before The Bell", "url": "https://www.rttnews.com/RSS/StockAlerts.xml"},
		# Additional mainstream news sources (28+)
		{"abbr": "NYT", "title": "The New York Times - Home Page", "url": "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"},
		{"abbr": "WP", "title": "The Washington Post - Politics", "url": "https://feeds.washingtonpost.com/rss/politics"},
		{"abbr": "GDNME", "title": "The Guardian - Middle East", "url": "https://www.theguardian.com/world/middleeast/rss"},
		{"abbr": "PLCO", "title": "Politico - Congress", "url": "https://rss.politico.com/congress.xml"},
		{"abbr": "PLDEF", "title": "Politico - Defense", "url": "https://rss.politico.com/defense.xml"},
		{"abbr": "PLPOL", "title": "Politico - Politics", "url": "https://rss.politico.com/politics-news.xml"},
		{"abbr": "BBC", "title": "BBC News - Top Stories", "url": "https://feeds.bbci.co.uk/news/rss.xml"},
		# Special utility
		{"abbr": "STOCK", "title": "Stock Lookup (price, fundamentals, news) - use: 35 TICKER", "url": ""},
		# Extra utility
		{"abbr": "LM", "title": "LiveUAMap", "url": "https://liveuamap.com"},
		{"abbr": "CMDTY", "title": "Commodities Snapshot (price, 1w, 1m change)", "url": ""},
		# WSJ corrected feeds (appended at end)
		{"abbr": "WSJMK", "title": "WSJ - Markets", "url": "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain"},
		{"abbr": "WSJWR", "title": "WSJ - World News", "url": "https://feeds.content.dowjones.io/public/rss/RSSWorldNews"},
		{"abbr": "WSJECO", "title": "WSJ - Economy", "url": "https://feeds.content.dowjones.io/public/rss/socialeconomyfeed"},
		# Guardian World section
		{"abbr": "GDNWR", "title": "The Guardian - World", "url": "https://www.theguardian.com/world/rss"},
	]


def print_feed_list(feeds: List[Dict[str, str]]) -> None:
	print("RTTNews RSS Feeds")
	print("------------------")
	for index, feed in enumerate(feeds, start=1):
		print(f"{index:2d}. {feed['abbr']:<6} {feed['title']}")
	print()
	print("Select a feed by number, abbreviation, or title (case-insensitive).")


def normalize_text(value: Optional[str]) -> str:
	if value is None:
		return ""
	return " ".join(html.unescape(value).split())


def strip_namespace(tag: str) -> str:
	if "}" in tag:
		return tag.split("}", 1)[1]
	return tag


def fetch_xml(url: str, timeout_seconds: int = 15) -> bytes:
	# Add a cache-busting query param to avoid stale CDN-cached RSS feeds
	try:
		parsed = urllib.parse.urlparse(url)
		q = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
		q.append(("_ts", str(int(time.time()))))
		new_query = urllib.parse.urlencode(q)
		url = urllib.parse.urlunparse(parsed._replace(query=new_query))
	except Exception:
		pass
	req = urllib.request.Request(
		url,
		headers={
			"User-Agent": "Mozilla/5.0 (CLI RSS Reader)",
			"Cache-Control": "no-cache",
			"Pragma": "no-cache",
			"Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
		},
	)
	with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
		return resp.read()

def fetch_json_dict(url: str, timeout_seconds: int = 15, retries: int = 3) -> Optional[Dict[str, object]]:
	delay = 0.8
	for _ in range(max(1, retries)):
		try:
			raw = fetch_json(url, timeout_seconds=timeout_seconds)
			return json.loads(raw.decode("utf-8", errors="ignore"))
		except Exception:
			time.sleep(delay)
			delay *= 2
	return None

def fetch_json_dict(url: str, timeout_seconds: int = 15, retries: int = 3) -> Optional[Dict[str, object]]:
	delay = 0.8
	for _ in range(max(1, retries)):
		try:
			raw = fetch_json(url, timeout_seconds=timeout_seconds)
			return json.loads(raw.decode("utf-8", errors="ignore"))
		except Exception:
			time.sleep(delay)
			delay *= 2
	return None


def find_items(root: ET.Element) -> List[ET.Element]:
	# Most RSS 2.0 feeds place items under channel/item
	items = root.findall(".//item")
	if items:
		return items
	# Atom feeds may use entry
	entries = root.findall(".//{http://www.w3.org/2005/Atom}entry")
	return entries


def extract_known_fields(item: ET.Element) -> Dict[str, str]:
	"""
	Extract common item fields when available; fallback handled elsewhere.
	"""
	field_map = {
		"title": "",
		"link": "",
		"description": "",
		"pubDate": "",
		"author": "",
		"category": "",
		"guid": "",
	}

	# RSS 2.0 common tags
	for child in item:
		name = strip_namespace(child.tag)
		text = normalize_text(child.text or "")
		if name in field_map and not field_map[name]:
			field_map[name] = text
		# Some feeds use dc:creator or other author-like fields
		if name.lower() in ("creator", "dc:creator") and not field_map["author"]:
			field_map["author"] = text
		# Atom alternate link handling
		if name == "link" and not text:
			href = child.attrib.get("href", "")
			if href and not field_map["link"]:
				field_map["link"] = href

	# Clean up empties
	return {k: v for k, v in field_map.items() if v}


def extract_additional_fields(item: ET.Element, known_keys: List[str]) -> List[Tuple[str, str]]:
	"""
	Collect any other child fields not captured in the known set.
	"""
	known_set = set(known_keys)
	seen_pairs: List[Tuple[str, str]] = []

	for child in item:
		name = strip_namespace(child.tag)
		if name in known_set:
			continue
		text = normalize_text(child.text or "")
		if not text and child.attrib:
			# Represent attributes if no direct text is present
			attr_repr = " ".join(f'{k}="{v}"' for k, v in child.attrib.items())
			text = attr_repr
		if text:
			seen_pairs.append((name, text))
	return seen_pairs


def print_article(index: int, item: ET.Element) -> None:
	known = extract_known_fields(item)
	extra = extract_additional_fields(item, list(known.keys()))

	print(f"--- Article {index} ---")
	for key in ("title", "link", "pubDate", "author", "category", "guid"):
		if key in known and known[key]:
			print(f"{key}: {known[key]}")
	if "description" in known and known["description"]:
		print()
		print("description:")
		print(known["description"])

	for name, value in extra:
		print(f"{name}: {value}")
	print()


def resolve_selection(user_input: str, feeds: List[Dict[str, str]]) -> Optional[Dict[str, str]]:
	text = user_input.strip()
	if not text:
		return None

	# Try numeric index
	if text.isdigit():
		index = int(text)
		if 1 <= index <= len(feeds):
			return feeds[index - 1]
		return None

	lower = text.lower()

	# Try abbreviation
	for feed in feeds:
		if feed["abbr"].lower() == lower:
			return feed

	# Try title (case-insensitive full match)
	for feed in feeds:
		if feed["title"].lower() == lower:
			return feed

	# Try partial title contains
	for feed in feeds:
		if lower in feed["title"].lower():
			return feed

	return None


def parse_selection_with_args(user_input: str, feeds: List[Dict[str, str]]) -> Tuple[str, Optional[Dict[str, str]], Optional[str]]:
	"""
	Returns a tuple of (mode, feed, ticker)
	- mode 'feed': feed is set, ticker is None
	- mode 'stock': ticker is set (uppercase), feed may reference the STOCK entry
	- mode 'invalid': both None
	"""
	text = user_input.strip()
	if not text:
		return ("invalid", None, None)

	parts = text.split()
	first = parts[0]

	# Numeric index, possibly with ticker for STOCK (index == 34)
	if first.isdigit():
		index = int(first)
		if 1 <= index <= len(feeds):
			selected_feed = feeds[index - 1]
			# Special LiveUAMap mode
			if selected_feed["abbr"].upper() == "LM":
				return ("liveuamap", selected_feed, None)
			if selected_feed["abbr"].upper() == "CMDTY":
				return ("commodities", selected_feed, None)
			if selected_feed["abbr"].upper() == "STOCK":
				if len(parts) < 2:
					return ("invalid", None, None)
				ticker = parts[1].upper()
				return ("stock", selected_feed, ticker)
			return ("feed", selected_feed, None)
		return ("invalid", None, None)

	# Abbreviation or title path; support "STOCK TICKER"
	lower = first.lower()
	for feed in feeds:
		if feed["abbr"].lower() == lower or feed["title"].lower() == text.lower():
			# Exact title match implies no args
			if feed["abbr"].upper() == "LM":
				return ("liveuamap", feed, None)
			if feed["abbr"].upper() == "CMDTY":
				return ("commodities", feed, None)
			if feed["abbr"].upper() == "STOCK":
				if len(parts) < 2:
					return ("invalid", None, None)
				ticker = parts[1].upper()
				return ("stock", feed, ticker)
			return ("feed", feed, None)

	# Partial title then args?
	for feed in feeds:
		if lower in feed["title"].lower():
			if feed["abbr"].upper() == "LM":
				return ("liveuamap", feed, None)
			if feed["abbr"].upper() == "CMDTY":
				return ("commodities", feed, None)
			if feed["abbr"].upper() == "STOCK":
				if len(parts) < 2:
					return ("invalid", None, None)
				ticker = parts[1].upper()
				return ("stock", feed, ticker)
			return ("feed", feed, None)

	return ("invalid", None, None)


def fetch_json(url: str, timeout_seconds: int = 15) -> bytes:
	req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (CLI RSS Reader)"})
	with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
		return resp.read()


def try_yahoo_quote_summary(ticker: str) -> Optional[Dict[str, object]]:
	"""
	Attempt to fetch detailed quote summary from Yahoo Finance.
	"""
	modules = ",".join([
		"price",
		"summaryDetail",
		"defaultKeyStatistics",
		"financialData",
		"assetProfile",
		"calendarEvents",
	])
	url = f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{urllib.parse.quote(ticker)}?modules={modules}"
	try:
		data_bytes = fetch_json(url)
		import json
		data = json.loads(data_bytes.decode("utf-8", errors="ignore"))
		result = data.get("quoteSummary", {}).get("result")
		if not result:
			return None
		return result[0]
	except Exception:
		return None


def try_yahoo_quote_v7(ticker: str) -> Optional[Dict[str, object]]:
	"""
	Fallback to Yahoo v7 quote endpoint for core price/metrics.
	"""
	url = f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={urllib.parse.quote(ticker)}"
	try:
		data_bytes = fetch_json(url)
		import json
		data = json.loads(data_bytes.decode("utf-8", errors="ignore"))
		results = data.get("quoteResponse", {}).get("result", [])
		if not results:
			return None
		return results[0]
	except Exception:
		return None


def human_number(value: Optional[float]) -> str:
	try:
		num = float(value)
	except Exception:
		return ""
	abs_num = abs(num)
	units = [("T", 1e12), ("B", 1e9), ("M", 1e6), ("K", 1e3)]
	for suffix, factor in units:
		if abs_num >= factor:
			return f"{num / factor:.2f}{suffix}"
	return f"{num:.2f}"

def format_change(current: Optional[float], past: Optional[float]) -> str:
	if current is None or past is None or past == 0 or current != current or past != past:
		return ""
	diff = current - past
	pct = (diff / past) * 100.0
	sign = "+" if diff >= 0 else ""
	return f"{sign}{diff:.2f} ({sign}{pct:.2f}%)"

def format_percent(value: Optional[float]) -> Optional[str]:
	"""
	Format numeric values as percentages with correct scaling.
	If the absolute value is <= 1, treat as a ratio and scale by 100.
	Otherwise, assume it's already a percent value.
	"""
	if value is None:
		return None
	try:
		num = float(value)
	except Exception:
		return None
	if abs(num) <= 1:
		num *= 100.0
	return f"{num:.2f}%"


def process_feed(selected_feed: Dict[str, str]) -> int:
	print()
	print(f"Fetching: {selected_feed['title']} ({selected_feed['abbr']})")
	print(selected_feed["url"])
	print()

	try:
		xml_bytes = fetch_xml(selected_feed["url"])
	except urllib.error.HTTPError as e:
		print(f"HTTP error {e.code}: {e.reason}")
		return 2
	except urllib.error.URLError as e:
		print(f"Network error: {e.reason}")
		return 2
	except Exception as e:
		print(f"Unexpected error while fetching: {e}")
		return 2

	try:
		root = ET.fromstring(xml_bytes)
	except ET.ParseError as e:
		print(f"XML parse error: {e}")
		return 3

	items = find_items(root)
	if not items:
		print("No articles found in this feed.")
		return 0
	# Sort by pubDate descending if available
	def item_ts(it: ET.Element) -> float:
		try:
			for child in it:
				if strip_namespace(child.tag).lower() in ("pubdate", "updated"):
					text = child.text or ""
					dt_obj = parsedate_to_datetime(text)
					return dt_obj.timestamp()
		except Exception:
			return 0.0
		return 0.0
	items_sorted = sorted(items, key=item_ts, reverse=True)

	for idx, item in enumerate(items_sorted, start=1):
		print_article(idx, item)

	print(f"Total articles: {len(items)}")
	return 0


def print_stock_info(ticker: str) -> int:
	print(f"Fetching stock data for: {ticker}")
	print()

	finn_key = os.environ.get("FINNHUB_API_KEY") or FINNHUB_API_KEY_DEFAULT

	def maybe_print(label: str, val: Optional[object], transform=None) -> None:
		if val is None:
			return
		if transform:
			try:
				val = transform(val)
			except Exception:
				return
		print(f"{label}: {val}")

	def use_finnhub(symbol: str, api_key: str) -> bool:
		quote_url = f"https://finnhub.io/api/v1/quote?symbol={urllib.parse.quote(symbol)}&token={api_key}"
		quote = fetch_json_dict(quote_url)
		if not quote or "c" not in quote:
			return False
		profile_url = f"https://finnhub.io/api/v1/stock/profile2?symbol={urllib.parse.quote(symbol)}&token={api_key}"
		profile = fetch_json_dict(profile_url) or {}
		metric_url = f"https://finnhub.io/api/v1/stock/metric?symbol={urllib.parse.quote(symbol)}&metric=all&token={api_key}"
		metric_wrapped = fetch_json_dict(metric_url) or {}
		metrics = metric_wrapped.get("metric", {}) if isinstance(metric_wrapped, dict) else {}

		name = profile.get("name") or profile.get("ticker") or symbol
		currency = profile.get("currency") or ""
		price = quote.get("c")
		change = quote.get("d")
		change_pct = quote.get("dp")
		day_low = quote.get("l")
		day_high = quote.get("h")
		market_cap = profile.get("marketCapitalization")

		print(f"{name} ({symbol})")
		if price is not None:
			print(f"Price: {price} {currency}")
		if change is not None and change_pct is not None:
			try:
				print(f"Change: {change} ({float(change_pct):.2f}%)")
			except Exception:
				print(f"Change: {change}")
		if market_cap is not None:
			print(f"Market Cap: {human_number(market_cap * 1e6 if isinstance(market_cap, (int, float)) and market_cap < 1e12 else market_cap)}")

		print()
		print("Fundamentals")
		print("------------")
		yr_low = metrics.get("52WeekLow") or metrics.get("fiftyTwoWeekLow")
		yr_high = metrics.get("52WeekHigh") or metrics.get("fiftyTwoWeekHigh")
		if day_low is not None and day_high is not None:
			print(f"Day Range: {day_low} - {day_high}")
		if yr_low is not None and yr_high is not None:
			print(f"52W Range: {yr_low} - {yr_high}")
		maybe_print("PE (TTM)", metrics.get("peBasicExclExtraTTM") or metrics.get("peNormalizedAnnual"), lambda v: f"{float(v):.2f}")
		maybe_print("EPS (TTM)", metrics.get("epsExclExtraItemsTTM") or metrics.get("epsBasicExclExtraItemsTTM"), lambda v: f"{float(v):.2f}")
		# Dividend yield: compute from dividend per share when available to avoid scaling ambiguities
		def first_numeric(d: Dict[str, object], keys: List[str]) -> Optional[float]:
			for k in keys:
				if k in d:
					try:
						return float(d[k])  # type: ignore[arg-type]
					except Exception:
						continue
			return None
		div_ps = first_numeric(metrics, [
			"dividendPerShareTTM",
			"dividendPerShareAnnual",
			"dividendTTM",
			"dividendPerShareTrailing12Months",
		])
		div_yield_pct: Optional[float] = None
		if isinstance(price, (int, float)) and price:
			if isinstance(div_ps, float) and div_ps is not None:
				try:
					div_yield_pct = (div_ps / float(price)) * 100.0
				except Exception:
					div_yield_pct = None
		if div_yield_pct is None:
			raw_yield = first_numeric(metrics, [
				"dividendYieldTTM",
				"dividendYieldIndicatedAnnual",
				"dividendYieldAnnual",
			])
			if isinstance(raw_yield, float):
				# If looks like a ratio, scale to percent; if already a small percent (<20), assume percent
				if 0 < raw_yield <= 1.0:
					div_yield_pct = raw_yield * 100.0
				elif 1.0 < raw_yield < 20.0:
					div_yield_pct = raw_yield
		if div_yield_pct is not None:
			print(f"Dividend Yield: {div_yield_pct:.2f}%")
		maybe_print("Gross Margins", metrics.get("grossMarginTTM"), format_percent)
		maybe_print("Operating Margin", metrics.get("operatingMarginTTM"), format_percent)
		maybe_print("Profit Margin", metrics.get("netProfitMarginTTM"), format_percent)
		sector = profile.get("finnhubIndustry")
		if sector:
			print(f"Sector/Industry: {sector}")

		print()
		print("Latest News")
		print("-----------")
		to_date = dt.date.today()
		from_date = to_date - dt.timedelta(days=10)
		news_url = f"https://finnhub.io/api/v1/company-news?symbol={urllib.parse.quote(symbol)}&from={from_date.isoformat()}&to={to_date.isoformat()}&token={api_key}"
		news = fetch_json_dict(news_url)
		if not news or not isinstance(news, list) or len(news) == 0:
			print("No news found.")
		else:
			max_items = 10
			for idx, item in enumerate(news[:max_items], start=1):
				title = item.get("headline", "")
				link = item.get("url", "")
				source = item.get("source", "")
				dtime = item.get("datetime")
				try:
					date_str = dt.datetime.utcfromtimestamp(int(dtime)).strftime("%Y-%m-%d %H:%M UTC") if dtime else ""
				except Exception:
					date_str = ""
				print(f"{idx:2d}. {title}")
				if source or date_str:
					print(f"    {source} {date_str}".strip())
				if link:
					print(f"    {link}")
		return True

	used = use_finnhub(ticker, finn_key)
	if not used:
		print("Failed to fetch data from Finnhub. You may be rate-limited or the symbol is invalid.")
		return 2
	return 0

def print_commodities_snapshot() -> int:
	print("Commodities Snapshot")
	print("--------------------")
	# Yahoo Finance continuous futures symbols
	commodities = [
		("Gold (COMEX)", "GC=F"),
		("Silver (COMEX)", "SI=F"),
		("WTI Crude Oil", "CL=F"),
		("Brent Crude Oil", "BZ=F"),
		("Natural Gas (NYMEX)", "NG=F"),
		("Copper (COMEX)", "HG=F"),
		("Corn (CBOT)", "ZC=F"),
		("Wheat (CBOT)", "ZW=F"),
		("Soybeans (CBOT)", "ZS=F"),
	]

	def fetch_yahoo_closes(symbol: str) -> List[float]:
		# Retrieve up to 3 months of daily data
		url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range=3mo&interval=1d"
		try:
			raw = fetch_json(url)
			data = json.loads(raw.decode("utf-8", errors="ignore"))
			result = data.get("chart", {}).get("result", [])
			if not result:
				return []
			quote = result[0].get("indicators", {}).get("quote", [])
			if not quote:
				return []
			closes = quote[0].get("close", [])
			return [float(v) for v in closes if v is not None]
		except Exception:
			return []

	for name, sym in commodities:
		closes = fetch_yahoo_closes(sym)
		if not closes:
			print(f"{name}: unavailable")
			continue
		cur = closes[-1]
		one_week_idx = -6 if len(closes) >= 6 else 0
		one_month_idx = -22 if len(closes) >= 22 else 0
		week_val = closes[one_week_idx]
		month_val = closes[one_month_idx]
		print(f"{name}: {cur:.2f}  |  1w {format_change(cur, week_val)}  |  1m {format_change(cur, month_val)}")
	print()
	print("Note: Uses Yahoo continuous futures; 1w≈5 trading days, 1m≈21 trading days.")
	return 0


def capture_output(func, *args, **kwargs) -> str:
	buffer = io.StringIO()
	with contextlib.redirect_stdout(buffer):
		func(*args, **kwargs)
	return buffer.getvalue()


def get_feed_list_string(feeds: List[Dict[str, str]]) -> str:
	return capture_output(print_feed_list, feeds)


def execute_selection(selection: str, feeds: List[Dict[str, str]]) -> str:
	if not selection.strip():
		return ""
	if selection.strip().lower() in ("guide", "help", "list", "options"):
		return get_feed_list_string(feeds)
	mode, feed, ticker = parse_selection_with_args(selection, feeds)
	if mode == "invalid":
		return "Invalid selection.\n"
	if mode == "stock":
		if not ticker:
			return "Usage: 34 TICKER (e.g., 34 AAPL)\n"
		return capture_output(print_stock_info, ticker)
	if mode == "liveuamap":
		assert feed is not None
		url = feed.get("url") or "https://liveuamap.com"
		capture_output(open_in_webview, url, "LiveUAMap")
		return "Opened LiveUAMap in a browser window.\n"
	if mode == "commodities":
		return capture_output(print_commodities_snapshot)
	assert mode == "feed" and feed is not None
	return capture_output(process_feed, feed)


def run_tui() -> int:
	feeds = build_feeds()

	def tui(stdscr):
		curses.curs_set(1)
		curses.noecho()
		stdscr.keypad(True)

		entries: List[str] = []
		# Preload guide
		entries.insert(0, get_feed_list_string(feeds))
		scroll = 0
		input_buf = ""

		def render():
			nonlocal scroll
			stdscr.erase()
			h, w = stdscr.getmaxyx()
			out_h = max(1, h - 2)
			separator_y = h - 2
			# Build combined text: newest first
			combined = ""
			for idx, block in enumerate(entries):
				if idx > 0:
					combined += "\n"
				combined += block.rstrip() + "\n"
			lines = combined.splitlines()
			max_scroll = max(0, len(lines) - out_h)
			if scroll > max_scroll:
				scroll = max_scroll
			if scroll < 0:
				scroll = 0
			# Draw output area
			for i in range(out_h):
				src_idx = scroll + i
				if 0 <= src_idx < len(lines):
					line = lines[src_idx]
					stdscr.addnstr(i, 0, line, w - 1)
			# Draw separator
			if h >= 2:
				stdscr.hline(separator_y, 0, curses.ACS_HLINE, w)
			# Draw input prompt
			prompt = "> "
			input_y = h - 1
			stdscr.addnstr(input_y, 0, prompt + input_buf, w - 1)
			stdscr.move(input_y, min(w - 1, len(prompt) + len(input_buf)))
			stdscr.refresh()

		render()
		while True:
			try:
				ch = stdscr.getch()
			except KeyboardInterrupt:
				return 0
			if ch in (curses.KEY_RESIZE,):
				render()
				continue
			if ch in (curses.KEY_UP,):
				scroll = max(0, scroll - 1)
				render()
				continue
			if ch in (curses.KEY_DOWN,):
				scroll += 1
				render()
				continue
			if ch in (curses.KEY_NPAGE,):  # PageDown
				h, w = stdscr.getmaxyx()
				scroll += max(1, h - 2)
				render()
				continue
			if ch in (curses.KEY_PPAGE,):  # PageUp
				h, w = stdscr.getmaxyx()
				scroll = max(0, scroll - max(1, h - 2))
				render()
				continue
			if ch in (ord('g'),):
				scroll = 0
				render()
				continue
			if ch in (ord('G'),):
				# Jump to bottom
				h, w = stdscr.getmaxyx()
				combined = ""
				for idx, block in enumerate(entries):
					if idx > 0:
						combined += "\n"
					combined += block.rstrip() + "\n"
				lines = combined.splitlines()
				scroll = max(0, len(lines) - max(1, h - 2))
				render()
				continue
			# Enter key
			if ch in (10, 13):
				cmd = input_buf.strip()
				if cmd.lower() in ("quit", "q", "exit"):
					return 0
				if cmd:
					result = execute_selection(cmd, feeds)
					entries.insert(0, result if result.endswith("\n") else result + "\n")
					scroll = 0
				input_buf = ""
				render()
				continue
			# Backspace
			if ch in (curses.KEY_BACKSPACE, 127, 8):
				if input_buf:
					input_buf = input_buf[:-1]
				render()
				continue
			# Printable text
			if 32 <= ch <= 126:
				input_buf += chr(ch)
				render()
				continue
			# Ignore others
			render()
		return 0

	return curses.wrapper(tui) or 0


# --- Scrolling ticker and data helpers for GUI ---
class TickerTape:
	def __init__(self, parent: tk.Misc, height: int = 26, bg: str = "#111111", fg: str = "#EEEEEE", speed_px_per_step: int = 2, step_ms: int = 20):
		self.canvas = tk.Canvas(parent, height=height, bg=bg, highlightthickness=0)
		self.fg = fg
		self.speed = max(1, int(speed_px_per_step))
		self.step_ms = max(10, int(step_ms))
		self.text_id = self.canvas.create_text(0, height // 2, text="", anchor="w", fill=self.fg)
		self.text_width = 0  # total width of content
		self.items: List[int] = []  # for segmented colored items
		self.offsets: List[int] = []  # x-offsets for each item when laid out from right edge
		self.started = False
		self.canvas.bind("<Configure>", self._on_resize)

	def widget(self) -> tk.Canvas:
		return self.canvas

	def _on_resize(self, event):
		canvas_w = int(self.canvas.winfo_width())
		canvas_h = int(self.canvas.winfo_height())
		if self.text_id is not None:
			try:
				x, y = self.canvas.coords(self.text_id)
			except Exception:
				return
			if x + self.text_width <= 0 or x > canvas_w:
				self.canvas.coords(self.text_id, canvas_w, canvas_h // 2)
		elif self.items:
			# If content goes out of range on resize, snap group back to right edge
			try:
				min_x = min(self.canvas.coords(i)[0] for i in self.items)
			except Exception:
				return
			if min_x + self.text_width <= 0 or min_x > canvas_w:
				self._layout_from_right(canvas_w, canvas_h // 2)

	def set_text(self, text: str) -> None:
		# Clear segmented items
		for it in self.items:
			try:
				self.canvas.delete(it)
			except Exception:
				pass
		self.items = []
		self.offsets = []
		if self.text_id is None:
			self.text_id = self.canvas.create_text(0, int(self.canvas.winfo_height()) // 2, text="", anchor="w", fill=self.fg)
		self.canvas.itemconfig(self.text_id, text=text)
		self.canvas.update_idletasks()
		bbox = self.canvas.bbox(self.text_id)
		if bbox:
			self.text_width = bbox[2] - bbox[0]
		self.canvas.coords(self.text_id, int(self.canvas.winfo_width()), int(self.canvas.winfo_height()) // 2)
		if not self.started:
			self.started = True
			self._scroll_step()

	def set_segments(self, segments: List[Tuple[str, str]]) -> None:
		# Remove single text path if present
		if self.text_id is not None:
			try:
				self.canvas.delete(self.text_id)
			except Exception:
				pass
			self.text_id = None
		# Clear previous items
		for it in self.items:
			try:
				self.canvas.delete(it)
			except Exception:
				pass
		self.items = []
		self.offsets = []
		y = int(self.canvas.winfo_height()) // 2
		x = int(self.canvas.winfo_width())
		total_w = 0
		# Create items sequentially, measure widths
		for text, color in segments:
			item_id = self.canvas.create_text(x + total_w, y, text=text, anchor="w", fill=color)
			self.canvas.update_idletasks()
			bbox = self.canvas.bbox(item_id)
			w = (bbox[2] - bbox[0]) if bbox else 0
			self.items.append(item_id)
			self.offsets.append(total_w)
			total_w += w
		self.text_width = total_w
		if not self.started:
			self.started = True
			self._scroll_step()

	def _layout_from_right(self, right_edge_x: int, baseline_y: int) -> None:
		# Lay items starting at right edge using stored offsets
		for idx, item_id in enumerate(self.items):
			self.canvas.coords(item_id, right_edge_x + self.offsets[idx], baseline_y)

	def _scroll_step(self) -> None:
		if self.text_id is not None:
			try:
				self.canvas.move(self.text_id, -self.speed, 0)
				x, y = self.canvas.coords(self.text_id)
				if x + self.text_width <= 0:
					self.canvas.coords(self.text_id, int(self.canvas.winfo_width()), y)
			except Exception:
				pass
		elif self.items:
			try:
				for it in self.items:
					self.canvas.move(it, -self.speed, 0)
				min_x = min(self.canvas.coords(i)[0] for i in self.items)
				if min_x + self.text_width <= 0:
					self._layout_from_right(int(self.canvas.winfo_width()), int(self.canvas.winfo_height()) // 2)
			except Exception:
				pass
		self.canvas.after(self.step_ms, self._scroll_step)


def yahoo_multi_quote(symbols: List[str]) -> Dict[str, Dict[str, object]]:
	if not symbols:
		return {}
	# Try multiple URL variants and hosts with a realistic User-Agent; Yahoo can be picky
	encoded = ",".join(urllib.parse.quote(s) for s in symbols)
	plain = ",".join(symbols)
	urls = [
		f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={encoded}&lang=en-US&region=US",
		f"https://query2.finance.yahoo.com/v7/finance/quote?symbols={encoded}&lang=en-US&region=US",
		f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={urllib.parse.quote(plain)}&lang=en-US&region=US",
		f"https://query2.finance.yahoo.com/v7/finance/quote?symbols={urllib.parse.quote(plain)}&lang=en-US&region=US",
	]
	headers = {
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
		"Accept": "application/json,text/javascript,*/*;q=0.1",
		"Accept-Language": "en-US,en;q=0.9",
		"Pragma": "no-cache",
		"Cache-Control": "no-cache",
	}
	collected: Dict[str, Dict[str, object]] = {}
	for url in urls:
		try:
			req = urllib.request.Request(url, headers=headers)
			with urllib.request.urlopen(req, timeout=15) as resp:
				data_bytes = resp.read()
			payload = json.loads(data_bytes.decode("utf-8", errors="ignore"))
			results = payload.get("quoteResponse", {}).get("result", []) or []
			for item in results:
				s = item.get("symbol")
				if isinstance(s, str):
					collected[s] = item
			if collected and len(collected) >= len(symbols):
				break
		except Exception:
			continue
	# Fallback and augmentation: Yahoo Chart v8 per-symbol to derive last price and change %
	def chart_meta(symbol: str) -> Optional[Dict[str, object]]:
		chart_urls = [
			f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range=5d&interval=1d",
			f"https://query2.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range=5d&interval=1d",
		]
		for cu in chart_urls:
			try:
				req = urllib.request.Request(cu, headers=headers)
				with urllib.request.urlopen(req, timeout=15) as resp:
					raw = resp.read()
				data = json.loads(raw.decode("utf-8", errors="ignore"))
				results = data.get("chart", {}).get("result", []) or []
				if not results:
					continue
				meta = results[0].get("meta", {}) or {}
				indicators = results[0].get("indicators", {}) or {}
				quotes = indicators.get("quote", []) or []
				last_close = None
				if quotes:
					closes = quotes[0].get("close", []) or []
					# find last non-None
					for v in reversed(closes):
						if v is not None:
							last_close = float(v)
							break
				price = meta.get("regularMarketPrice")
				if price is None and last_close is not None:
					price = float(last_close)
				prev = meta.get("previousClose")
				if prev in (None, 0):
					prev = meta.get("chartPreviousClose")
				change_pct = None
				try:
					if price is not None and prev not in (None, 0):
						change_pct = (float(price) - float(prev)) / float(prev) * 100.0
				except Exception:
					change_pct = None
				out: Dict[str, object] = {}
				if price is not None:
					out["regularMarketPrice"] = float(price)
				if prev is not None:
					out["regularMarketPreviousClose"] = float(prev)
					out["previousClose"] = float(prev)
					out["chartPreviousClose"] = float(prev)
				if change_pct is not None:
					out["regularMarketChangePercent"] = float(change_pct)
				return out if out else None
			except Exception:
				continue
		return None

	def ensure_change_percent(symbol: str, data: Dict[str, object]) -> Dict[str, object]:
		# If we already have a percent and previous close, keep it
		price = data.get("regularMarketPrice")
		prev = data.get("regularMarketPreviousClose") or data.get("previousClose") or data.get("chartPreviousClose")
		chg = data.get("regularMarketChangePercent")
		try:
			if chg is None and price is not None and prev not in (None, 0):
				chg = (float(price) - float(prev)) / float(prev) * 100.0
		except Exception:
			chg = None
		if chg is None:
			meta = chart_meta(symbol)
			if meta:
				# backfill missing pieces
				if price is None and meta.get("regularMarketPrice") is not None:
					price = meta["regularMarketPrice"]
					data["regularMarketPrice"] = price  # type: ignore[index]
				if prev is None and (meta.get("regularMarketPreviousClose") is not None or meta.get("previousClose") is not None or meta.get("chartPreviousClose") is not None):
					prev = meta.get("regularMarketPreviousClose") or meta.get("previousClose") or meta.get("chartPreviousClose")
					if prev is not None:
						data["regularMarketPreviousClose"] = prev  # type: ignore[index]
						data["previousClose"] = prev  # type: ignore[index]
						data["chartPreviousClose"] = prev  # type: ignore[index]
				if meta.get("regularMarketChangePercent") is not None:
					chg = meta.get("regularMarketChangePercent")
		if chg is not None:
			try:
				data["regularMarketChangePercent"] = float(chg)  # type: ignore[index]
			except Exception:
				pass
		return data

	# If we didn't get any v7 data, build from pure chart_meta
	if not collected:
		fallback: Dict[str, Dict[str, object]] = {}
		for s in symbols:
			meta = chart_meta(s)
			if meta:
				fallback[s] = meta
		return fallback

	# Augment missing fields using chart_meta
	for s in symbols:
		collected[s] = ensure_change_percent(s, collected.get(s, {}))
	return collected


def _format_change_pct(value: Optional[float]) -> str:
	try:
		num = float(value)
	except Exception:
		return ""
	sign = "+" if num >= 0 else ""
	return f"{sign}{num:.2f}%"


def build_markets_tape_text() -> str:
	# Major indices, commodities, and FX symbols on Yahoo
	indices: List[Tuple[str, str]] = [
		("S&P 500", "^GSPC"),
		("Dow", "^DJI"),
		("Nasdaq", "^IXIC"),
		("FTSE 100", "^FTSE"),
		("DAX", "^GDAXI"),
		("Nikkei 225", "^N225"),
		("Hang Seng", "^HSI"),
	]
	commodities: List[Tuple[str, str]] = [
		("WTI", "CL=F"),
		("Brent", "BZ=F"),
		("Gold", "GC=F"),
		("Silver", "SI=F"),
		("NatGas", "NG=F"),
		("Copper", "HG=F"),
	]
	fx: List[Tuple[str, str]] = [
		("EUR/USD", "EURUSD=X"),
		("GBP/USD", "GBPUSD=X"),
		("USD/JPY", "JPY=X"),
		("USD/CHF", "CHF=X"),
	]
	all_pairs = indices + commodities + fx
	symbols = [s for _, s in all_pairs]
	quotes = yahoo_multi_quote(symbols)

	def piece(label: str, sym: str) -> str:
		q = quotes.get(sym, {})
		# Prefer regular market values; fall back to post/pre market if needed
		price = q.get("regularMarketPrice")
		if price is None:
			price = q.get("postMarketPrice") if q.get("postMarketPrice") is not None else q.get("preMarketPrice")
		chg_pct = q.get("regularMarketChangePercent")
		if chg_pct is None:
			chg_pct = q.get("postMarketChangePercent") if q.get("postMarketChangePercent") is not None else q.get("preMarketChangePercent")
		try:
			price_str = f"{float(price):.2f}"
		except Exception:
			price_str = "n/a"
		pct_str = _format_change_pct(chg_pct)
		if pct_str:
			return f"{label} {price_str} {pct_str}"
		return f"{label} {price_str}"

	parts_idx = [piece(l, s) for (l, s) in indices]
	parts_cmd = [piece(l, s) for (l, s) in commodities]
	parts_fx = [piece(l, s) for (l, s) in fx]
	return "   |   ".join(parts_idx + parts_cmd + parts_fx)


def build_markets_tape_segments() -> List[Tuple[str, str]]:
	# Colors
	WHITE = "#F2F2F2"
	GREEN = "#4CAF50"
	RED = "#E53935"
	# Symbols
	indices: List[Tuple[str, str]] = [
		("S&P 500", "^GSPC"),
		("Dow", "^DJI"),
		("Nasdaq", "^IXIC"),
		("FTSE 100", "^FTSE"),
		("DAX", "^GDAXI"),
		("Nikkei 225", "^N225"),
		("Hang Seng", "^HSI"),
	]
	commodities: List[Tuple[str, str]] = [
		("WTI", "CL=F"),
		("Brent", "BZ=F"),
		("Gold", "GC=F"),
		("Silver", "SI=F"),
		("NatGas", "NG=F"),
		("Copper", "HG=F"),
	]
	fx: List[Tuple[str, str]] = [
		("EUR/USD", "EURUSD=X"),
		("GBP/USD", "GBPUSD=X"),
		("USD/JPY", "JPY=X"),
		("USD/CHF", "CHF=X"),
	]
	all_pairs = indices + commodities + fx
	symbols = [s for _, s in all_pairs]
	quotes = yahoo_multi_quote(symbols)

	def seg(label: str, sym: str) -> List[Tuple[str, str]]:
		q = quotes.get(sym, {})
		price = q.get("regularMarketPrice")
		if price is None:
			price = q.get("postMarketPrice") if q.get("postMarketPrice") is not None else q.get("preMarketPrice")
		prev = q.get("regularMarketPreviousClose") or q.get("previousClose") or q.get("chartPreviousClose")
		chg_pct = None
		# Prefer computing from price/prev; fallback to Yahoo's percent
		try:
			if price is not None and prev not in (None, 0):
				chg_pct = (float(price) - float(prev)) / float(prev) * 100.0
		except Exception:
			chg_pct = None
		if chg_pct is None:
			tmp = q.get("regularMarketChangePercent")
			if tmp is None:
				tmp = q.get("postMarketChangePercent") if q.get("postMarketChangePercent") is not None else q.get("preMarketChangePercent")
			try:
				if tmp is not None:
					chg_pct = float(tmp)
			except Exception:
				chg_pct = None
		try:
			price_str = f"{float(price):.2f}"
		except Exception:
			price_str = "n/a"
		pct_str = ""
		color = WHITE
		if chg_pct is not None:
			sign = "+" if chg_pct >= 0 else ""
			pct_str = f"{sign}{chg_pct:.2f}%"
			color = GREEN if chg_pct >= 0 else RED
		# Return pieces: name (white), space, price (colored), space, pct (colored or empty)
		pieces: List[Tuple[str, str]] = []
		pieces.append((f"{label} ", WHITE))
		pieces.append((price_str, color))
		if pct_str:
			pieces.append((f" {pct_str}", color))
		return pieces

	segments: List[Tuple[str, str]] = []
	def add_group(pairs: List[Tuple[str, str]]) -> None:
		nonlocal segments
		for idx, (l, s) in enumerate(pairs):
			if segments:
				segments.append(("   |   ", WHITE))
			segments.extend(seg(l, s))

	add_group(indices)
	add_group(commodities)
	add_group(fx)
	return segments


def fetch_politico_top_titles(limit: int = 5) -> List[str]:
	url = "https://rss.politico.com/politics-news.xml"
	try:
		xml_bytes = fetch_xml(url)
		root = ET.fromstring(xml_bytes)
		items = find_items(root)[:limit]
		out: List[str] = []
		for it in items:
			known = extract_known_fields(it)
			title = known.get("title") or ""
			title = normalize_text(title)
			if title:
				out.append(title)
		return out
	except Exception:
		return []


def run_gui() -> int:
	feeds = build_feeds()
	try:
		root = tk.Tk()
	except Exception as e:
		print(f"Failed to open GUI window: {e}")
		return 1

	root.title("Bespoke Search")
	root.geometry("900x700")

	# Top-of-window ticker tapes
	markets_tape = TickerTape(root, height=26, bg="#0F0F0F", fg="#F2F2F2", speed_px_per_step=2, step_ms=20)
	markets_tape.widget().pack(side=tk.TOP, fill=tk.X)
	news_tape = TickerTape(root, height=24, bg="#151515", fg="#E6E6E6", speed_px_per_step=2, step_ms=20)
	news_tape.widget().pack(side=tk.TOP, fill=tk.X)

	text = scrolledtext.ScrolledText(root, wrap=tk.WORD)
	text.pack(side=tk.TOP, fill=tk.BOTH, expand=True)
	text.configure(state=tk.NORMAL)
	initial = get_feed_list_string(feeds)
	if not initial.endswith("\n"):
		initial += "\n"
	# Helper to insert content with clickable links at a given index
	link_pattern = re.compile(r"(https?://[^\s]+)")
	link_counter = {"n": 0}
	def insert_with_links(widget: tk.Text, index: str, content: str) -> None:
		last = 0
		for m in link_pattern.finditer(content):
			start, end = m.span()
			# Insert text before the link
			if start > last:
				pre = content[last:start]
				widget.insert(index, pre)
				index = widget.index(f"{index}+{len(pre)}c")
			# Insert the link with a clickable tag
			url = m.group(0)
			tag = f"link_{link_counter['n']}"
			link_counter["n"] += 1
			widget.insert(index, url, (tag,))
			widget.tag_config(tag, foreground="blue", underline=True)
			widget.tag_bind(tag, "<Button-1>", lambda e, u=url: webbrowser.open(u))
			widget.tag_bind(tag, "<Enter>", lambda e: widget.config(cursor="hand2"))
			widget.tag_bind(tag, "<Leave>", lambda e: widget.config(cursor=""))
			index = widget.index(f"{index}+{len(url)}c")
			last = end
		# Insert any remaining text after the last link
		if last < len(content):
			tail = content[last:]
			widget.insert(index, tail)
	# Insert initial content at top, editable
	insert_with_links(text, "1.0", initial)

	entry_frame = tk.Frame(root)
	entry_frame.pack(side=tk.BOTTOM, fill=tk.X)
	prompt = tk.Label(entry_frame, text="> ")
	prompt.pack(side=tk.LEFT)
	entry = tk.Entry(entry_frame)
	entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
	entry.focus_set()

	def append_top(content: str) -> None:
		if not content.endswith("\n"):
			content += "\n"
		insert_with_links(text, "1.0", content)
		text.yview_moveto(0.0)

	def on_submit(event=None):
		cmd = entry.get().strip()
		if not cmd:
			return
		if cmd.lower() in ("quit", "q", "exit"):
			root.destroy()
			return
		result = execute_selection(cmd, feeds)
		append_top(result)
		entry.delete(0, tk.END)

	entry.bind("<Return>", on_submit)
	# Initial ticker population and periodic refresh (every 90 seconds)
	def refresh_markets():
		def worker():
			try:
				segments = build_markets_tape_segments()
			except Exception:
				segments = []
			def apply_text():
				if segments:
					markets_tape.set_segments(segments)
			root.after(0, apply_text)
		threading.Thread(target=worker, daemon=True).start()
		root.after(90_000, refresh_markets)

	def refresh_politico():
		def worker():
			try:
				titles = fetch_politico_top_titles(5)
				content = "   •   ".join(titles) if titles else ""
			except Exception:
				content = ""
			def apply_text():
				if content:
					news_tape.set_text(content)
			root.after(0, apply_text)
		threading.Thread(target=worker, daemon=True).start()
		root.after(90_000, refresh_politico)

	# Kick off refresh loops immediately
	refresh_markets()
	refresh_politico()
	root.mainloop()
	return 0


def open_in_webview(url: str, window_title: str = "Webview") -> int:
	"""
	Open the given URL in a lightweight Python GUI webview if available.
	Falls back to the system default browser if pywebview is not installed.
	"""
	try:
		import webview  # type: ignore
		# Create a simple webview window
		webview.create_window(window_title, url)
		webview.start()
		return 0
	except ImportError:
		print("Missing dependency: pywebview. Install with:")
		print("  pip install pywebview")
		print("Opening in your default browser instead...")
		try:
			import webbrowser
			webbrowser.open(url)
			return 0
		except Exception as e:
			print(f"Failed to open browser: {e}")
			return 1
	except Exception as e:
		print(f"Failed to open webview: {e}")
		return 1


def main(argv: List[str]) -> int:
	feeds = build_feeds()
	print_feed_list(feeds)

	while True:
		try:
			selection = input('Enter selection (or "guide" for options, "quit" to exit): ').strip()
		except (EOFError, KeyboardInterrupt):
			print()
			return 0

		lower = selection.lower()
		if not selection:
			continue
		if lower in ("quit", "q", "exit"):
			return 0
		if lower in ("guide", "help", "list", "options"):
			print_feed_list(feeds)
			continue

		mode, feed, ticker = parse_selection_with_args(selection, feeds)
		if mode == "invalid":
			print('Invalid selection. Type "guide" to see the full list of options.')
			continue
		if mode == "stock":
			if not ticker:
				print('Usage: 34 TICKER (e.g., 34 AAPL) — type "guide" to see all options.')
				continue
			print_stock_info(ticker)
			continue
		if mode == "commodities":
			print_commodities_snapshot()
			continue
		if mode == "liveuamap":
			assert feed is not None
			url = feed.get("url") or "https://liveuamap.com"
			open_in_webview(url, window_title="LiveUAMap")
			continue
		if mode == "feed":
			assert feed is not None
			process_feed(feed)
			continue
		print('Invalid selection. Type "guide" to see the full list of options.')
		continue


if __name__ == "__main__":
	args = sys.argv[1:]
	if any(arg == "--gui" for arg in args):
		sys.exit(run_gui())
	elif any(arg == "--tui" for arg in args):
		sys.exit(run_tui())
	elif any(arg == "--cli" for arg in args):
		sys.exit(main(sys.argv))
	else:
		# Default to GUI automatically; if unavailable, gracefully fall back to TUI, then CLI.
		try:
			code = run_gui()
		except Exception:
			code = 1
		if code == 0:
			sys.exit(0)
		# Try TUI fallback if GUI failed
		try:
			code = run_tui()
			sys.exit(code or 0)
		except Exception:
			# Final fallback to simple CLI
			sys.exit(main(sys.argv))


