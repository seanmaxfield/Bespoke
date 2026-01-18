#!/usr/bin/env python3
import os
import json
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET

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

def copy_csv(src_name):
	src = os.path.join(ROOT, src_name)
	dst = os.path.join(OUT_DIR, src_name)
	if os.path.exists(src):
		with open(src, "rb") as fsrc, open(dst, "wb") as fdst:
			fdst.write(fsrc.read())

def main():
	write_json(os.path.join(OUT_DIR, "markets.json"), build_markets())
	write_json(os.path.join(OUT_DIR, "news.json"), build_politico())
	# keep CSVs in docs/data so the SPA can load them directly
	copy_csv("dc_researchers_with_emails_CONSOLIDATED.csv")
	copy_csv("journalists_china_asia_FULL.csv")
	print("Wrote data files to docs/data/")

if __name__ == "__main__":
	main()

