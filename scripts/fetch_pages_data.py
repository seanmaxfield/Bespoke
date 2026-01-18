#!/usr/bin/env python3
import os
import json
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from typing import List, Dict

ROOT = os.path.dirname(os.path.dirname(__file__))
OUT_DIR = os.path.join(ROOT, "docs", "data")
os.makedirs(OUT_DIR, exist_ok=True)

def fetch(url: str, headers=None, timeout=20) -> bytes:
	req = urllib.request.Request(url, headers=headers or {"User-Agent":"Mozilla/5.0"})
	with urllib.request.urlopen(req, timeout=timeout) as resp:
		return resp.read()

def write_json(path: str, obj):
	tmp = path + ".tmp"
	with open(tmp, "w", encoding="utf-8") as f:
		json.dump(obj, f, ensure_ascii=False, indent=2)
	os.replace(tmp, path)

def yahoo_quotes(symbols):
	encoded = ",".join(urllib.parse.quote(s) for s in symbols)
	urls = [
		f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={encoded}&lang=en-US&region=US",
		f"https://query2.finance.yahoo.com/v7/finance/quote?symbols={encoded}&lang=en-US&region=US",
	]
	headers = {"User-Agent":"Mozilla/5.0","Accept":"application/json"}
	for url in urls:
		try:
			raw = fetch(url, headers=headers)
			data = json.loads(raw.decode("utf-8","ignore"))
			res = data.get("quoteResponse",{}).get("result",[]) or []
			if res:
				return {r.get("symbol"): r for r in res if r.get("symbol")}
		except Exception:
			continue
	return {}

def yahoo_chart_meta(symbol):
	headers = {"User-Agent":"Mozilla/5.0","Accept":"application/json"}
	for host in ("query1","query2"):
		url = f"https://{host}.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range=5d&interval=1d"
		try:
			raw = fetch(url, headers=headers)
			data = json.loads(raw.decode("utf-8","ignore"))
			res = (data.get("chart",{}) or {}).get("result",[]) or []
			if not res: 
				continue
			meta = res[0].get("meta",{}) or {}
			closes = (((res[0].get("indicators",{}) or {}).get("quote",[]) or [{}])[0]).get("close",[]) or []
			last_close = None
			for v in reversed(closes):
				if v is not None:
					last_close = float(v)
					break
			price = meta.get("regularMarketPrice")
			if price is None and last_close is not None:
				price = last_close
			prev = meta.get("previousClose") or meta.get("chartPreviousClose")
			pct = None
			if price is not None and prev not in (None,0):
				pct = (float(price) - float(prev)) / float(prev) * 100.0
			out = {}
			if price is not None: out["regularMarketPrice"] = float(price)
			if pct is not None: out["regularMarketChangePercent"] = float(pct)
			return out
		except Exception:
			continue
	return {}

def build_markets():
	indices = [
		("S&P 500","^GSPC"),
		("Dow","^DJI"),
		("Nasdaq","^IXIC"),
		("FTSE 100","^FTSE"),
		("DAX","^GDAXI"),
		("Nikkei 225","^N225"),
		("Hang Seng","^HSI"),
	]
	commodities = [
		("WTI","CL=F"),
		("Brent","BZ=F"),
		("Gold","GC=F"),
		("Silver","SI=F"),
		("NatGas","NG=F"),
		("Copper","HG=F"),
	]
	fx = [
		("EUR/USD","EURUSD=X"),
		("GBP/USD","GBPUSD=X"),
		("USD/JPY","JPY=X"),
		("USD/CHF","CHF=X"),
	]
	all_pairs = indices + commodities + fx
	symbols = [s for _,s in all_pairs]
	quotes = yahoo_quotes(symbols)
	out = []
	for label,sym in all_pairs:
		q = quotes.get(sym,{})
		price = q.get("regularMarketPrice")
		pct = q.get("regularMarketChangePercent")
		if price is None or pct is None:
			meta = yahoo_chart_meta(sym)
			if price is None: price = meta.get("regularMarketPrice")
			if pct is None: pct = meta.get("regularMarketChangePercent")
		try:
			price_str = f"{float(price):.2f}" if price is not None else "n/a"
		except Exception:
			price_str = "n/a"
		dir_val = 0.0
		try:
			dir_val = float(pct) if pct is not None else 0.0
		except Exception:
			dir_val = 0.0
		pct_str = (f"{'+' if dir_val>=0 else ''}{dir_val:.2f}%") if pct is not None else ""
		out.append({"label":label,"price":price_str,"pct":pct_str,"dir":dir_val})
	return out

def build_politico(limit=5):
	url = "https://rss.politico.com/politics-news.xml"
	try:
		# cache-bust
		url += ("&" if "?" in url else "?") + f"_ts={int(time.time())}"
		raw = fetch(url, headers={"User-Agent":"Mozilla/5.0","Accept":"application/rss+xml"})
		root = ET.fromstring(raw)
		items = root.findall(".//item")[:limit]
		out = []
		for it in items:
			title = (it.findtext("title") or "").strip()
			link = (it.findtext("link") or "").strip()
			out.append({"title":title,"link":link})
		return out
	except Exception:
		return []

def build_commodities_snapshot():
	# Same symbols as the CLI for parity
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
	def chart_closes(symbol: str):
		for host in ("query1","query2"):
			url = f"https://{host}.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range=3mo&interval=1d"
			try:
				raw = fetch(url, headers={"User-Agent":"Mozilla/5.0","Accept":"application/json"})
				data = json.loads(raw.decode("utf-8","ignore"))
				result = data.get("chart",{}).get("result",[]) or []
				if not result: 
					continue
				quote = result[0].get("indicators",{}).get("quote",[]) or []
				if not quote: 
					continue
				return [float(v) for v in (quote[0].get("close",[]) or []) if v is not None]
			except Exception:
				continue
		return []
	def fmt_change(cur, past):
		try:
			if past is None or past == 0: 
				return ""
			diff = cur - past
			pct = (diff / past) * 100.0
			sign = "+" if diff >= 0 else ""
			return f"{sign}{diff:.2f} ({sign}{pct:.2f}%)"
		except Exception:
			return ""
	out = []
	for name, sym in commodities:
		closes = chart_closes(sym)
		if not closes:
			out.append({"name":name,"symbol":sym,"current":"unavailable","w":"","m":""})
			continue
		cur = closes[-1]
		week_val = closes[-6] if len(closes) >= 6 else closes[0]
		month_val = closes[-22] if len(closes) >= 22 else closes[0]
		out.append({
			"name": name,
			"symbol": sym,
			"current": f"{cur:.2f}",
			"w": fmt_change(cur, week_val),
			"m": fmt_change(cur, month_val),
		})
	return out

def copy_csv(src_name):
	src = os.path.join(ROOT, src_name)
	dst = os.path.join(OUT_DIR, src_name)
	if os.path.exists(src):
		with open(src, "rb") as fsrc, open(dst, "wb") as fdst:
			fdst.write(fsrc.read())

def main():
	write_json(os.path.join(OUT_DIR, "markets.json"), build_markets())
	write_json(os.path.join(OUT_DIR, "news.json"), build_politico())
	write_json(os.path.join(OUT_DIR, "commodities.json"), build_commodities_snapshot())
	# keep CSVs in docs/data so the SPA can load them directly
	copy_csv("dc_researchers_with_emails_CONSOLIDATED.csv")
	copy_csv("journalists_china_asia_FULL.csv")
	# Build feeds list (30+ sources) and latest items per feed
	# Exact order to mirror the CLI "guide" list
	feeds: List[Dict[str,str]] = [
		{"abbr":"TS","title":"Top Stories","url":"https://www.rttnews.com/RSS/Todaystop.xml"},
		{"abbr":"BN","title":"Breaking News","url":"https://www.rttnews.com/RSS/breakingnews.xml"},
		{"abbr":"ERN","title":"Earnings News","url":"https://www.rttnews.com/RSS/Earnings.xml"},
		{"abbr":"POL","title":"Political News","url":"https://www.rttnews.com/RSS/Political.xml"},
		{"abbr":"ECO","title":"Economic News","url":"https://www.rttnews.com/RSS/EconomicNews.xml"},
		{"abbr":"IPO","title":"IPO News/Alerts","url":"https://www.rttnews.com/RSS/IPO.xml"},
		{"abbr":"MA","title":"Market Analysis","url":"https://www.rttnews.com/RSS/MarketAnalysis.xml"},
		{"abbr":"CMT","title":"Commentary","url":"https://www.rttnews.com/RSS/commentary.xml"},
		{"abbr":"USMU","title":"US Market Updates","url":"https://www.rttnews.com/RSS/USMarketUpdate.xml"},
		{"abbr":"EUMU","title":"European Market Updates","url":"https://www.rttnews.com/RSS/EuropeMarketUpdate.xml"},
		{"abbr":"ASMU","title":"Asian Market Updates","url":"https://www.rttnews.com/RSS/AsiaMarketUpdate.xml"},
		{"abbr":"PMTA","title":"Pre-Market Trading Alerts","url":"https://www.rttnews.com/RSS/stockalerts.xml"},
		{"abbr":"STSA","title":"Short-Term Stock Alerts","url":"https://www.rttnews.com/RSS/momentum.xml"},
		{"abbr":"HOT","title":"Hot Stocks","url":"https://www.rttnews.com/RSS/HotStocks.xml"},
		{"abbr":"CAN","title":"Canadian News","url":"https://www.rttnews.com/RSS/canadiannews.xml"},
		{"abbr":"SECT","title":"Market/Sector Trends","url":"https://www.rttnews.com/RSS/SectorTrends.xml"},
		{"abbr":"ENTTOP","title":"Entertainment Top Story","url":"https://www.rttnews.com/RSS/EntTopStory.xml"},
		{"abbr":"MUSIC","title":"Music News","url":"https://www.rttnews.com/RSS/MusicNews.xml"},
		{"abbr":"MOVREV","title":"Movie Reviews","url":"https://www.rttnews.com/RSS/MovieReviews.xml"},
		{"abbr":"DVD","title":"DVD Releases","url":"https://www.rttnews.com/RSS/DVDReleases.xml"},
		{"abbr":"FXTOP","title":"Forex Top Story","url":"https://www.rttnews.com/RSS/ForexTopStory.xml"},
		{"abbr":"CURR","title":"Currency Market","url":"https://www.rttnews.com/RSS/CurrencyAlerts.xml"},
		{"abbr":"HEALTH","title":"Health News","url":"https://www.rttnews.com/RSS/HealthNews.xml"},
		{"abbr":"BIO","title":"Biotech","url":"https://www.rttnews.com/RSS/Biotech.xml"},
		{"abbr":"TECH","title":"Technology","url":"https://www.rttnews.com/RSS/Technology.xml"},
		{"abbr":"MOM","title":"Momentum","url":"https://www.rttnews.com/RSS/Momentum.xml"},
		{"abbr":"BELL","title":"Before The Bell","url":"https://www.rttnews.com/RSS/StockAlerts.xml"},
		{"abbr":"NYT","title":"The New York Times - Home Page","url":"https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"},
		{"abbr":"WP","title":"The Washington Post - Politics","url":"https://feeds.washingtonpost.com/rss/politics"},
		{"abbr":"GDNME","title":"The Guardian - Middle East","url":"https://www.theguardian.com/world/middleeast/rss"},
		{"abbr":"PLCO","title":"Politico - Congress","url":"https://rss.politico.com/congress.xml"},
		{"abbr":"PLDEF","title":"Politico - Defense","url":"https://rss.politico.com/defense.xml"},
		{"abbr":"PLPOL","title":"Politico - Politics","url":"https://rss.politico.com/politics-news.xml"},
		{"abbr":"BBC","title":"BBC News - Top Stories","url":"https://feeds.bbci.co.uk/news/rss.xml"},
		{"abbr":"STOCK","title":"Stock Lookup (price, fundamentals, news) - use: 35 TICKER","url":""},
		{"abbr":"LM","title":"LiveUAMap","url":"https://liveuamap.com"},
		{"abbr":"CMDTY","title":"Commodities Snapshot (price, 1w, 1m change)","url":""},
		{"abbr":"WSJMK","title":"WSJ - Markets","url":"https://feeds.content.dowjones.io/public/rss/RSSMarketsMain"},
		{"abbr":"WSJWR","title":"WSJ - World News","url":"https://feeds.content.dowjones.io/public/rss/RSSWorldNews"},
		{"abbr":"WSJECO","title":"WSJ - Economy","url":"https://feeds.content.dowjones.io/public/rss/socialeconomyfeed"},
		{"abbr":"GDNWR","title":"The Guardian - World","url":"https://www.theguardian.com/world/rss"},
	]
	def fetch_feed(url: str, limit: int = 10):
		# Robust fetch with retries; support RSS and Atom
		headers = {
			"User-Agent":"Mozilla/5.0 (CLI RSS Reader)",
			"Accept":"application/rss+xml, application/xml;q=0.9, */*;q=0.8",
			"Cache-Control":"no-cache","Pragma":"no-cache",
		}
		for _ in range(3):
			try:
				u = url + (("&" if "?" in url else "?") + f"_ts={int(time.time())}")
				raw = fetch(u, headers=headers)
				root = ET.fromstring(raw)
				items = root.findall(".//item")
				if not items:
					entries = root.findall(".//{http://www.w3.org/2005/Atom}entry")
					out = []
					for it in entries[:limit]:
						title = (it.findtext("{http://www.w3.org/2005/Atom}title") or "").strip()
						link_el = it.find("{http://www.w3.org/2005/Atom}link")
						link = (link_el.get("href") if link_el is not None else "") or ""
						pub = (it.findtext("{http://www.w3.org/2005/Atom}updated") or "").strip()
						out.append({"title":title,"link":link,"pubDate":pub})
					if out:
						return out
				else:
					out = []
					for it in items[:limit]:
						title = (it.findtext("title") or "").strip()
						link = (it.findtext("link") or "").strip()
						pub = (it.findtext("pubDate") or "").strip()
						out.append({"title":title,"link":link,"pubDate":pub})
					if out:
						return out
			except Exception:
				time.sleep(0.6)
				continue
		return []
	feeds_payload = {"feeds":[{"abbr":f["abbr"],"title":f["title"],"url":f.get("url","")} for f in feeds],"data":{}}
	for f in feeds:
		feeds_payload["data"][f["abbr"]] = fetch_feed(f["url"])
	write_json(os.path.join(OUT_DIR, "feeds.json"), feeds_payload)
	print("Wrote data files to docs/data/")

if __name__ == "__main__":
	main()

