// Robust CSV parser with quotes support (RFC4180-ish)
function parseCSV(text) {
	// Remove BOM if present
	if (text.charCodeAt(0) === 0xFEFF) {
		text = text.slice(1);
	}
	const rows = [];
	let field = "";
	let row = [];
	let i = 0, inQuotes = false;
	while (i < text.length) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				// Escaped double quote
				if (i + 1 < text.length && text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				} else {
					inQuotes = false;
					i++;
					continue;
				}
			} else {
				field += ch;
				i++;
				continue;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
				i++;
				continue;
			}
			if (ch === ",") {
				row.push(field);
				field = "";
				i++;
				continue;
			}
			if (ch === "\r") {
				// normalize CRLF or CR
				if (i + 1 < text.length && text[i + 1] === "\n") i++;
				row.push(field);
				field = "";
				if (row.length > 0) rows.push(row);
				row = [];
				i++;
				continue;
			}
			if (ch === "\n") {
				row.push(field);
				field = "";
				if (row.length > 0) rows.push(row);
				row = [];
				i++;
				continue;
			}
			field += ch;
			i++;
			continue;
		}
	}
	// push last field/row
	row.push(field);
	if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
		rows.push(row);
	}
	if (rows.length === 0) return [];
	const headers = rows[0].map(h => (h || "").trim());
	const out = [];
	for (let r = 1; r < rows.length; r++) {
		const cols = rows[r];
		if (cols.every(c => (c || "").trim() === "")) continue;
		const obj = {};
		for (let c = 0; c < headers.length; c++) {
			const key = headers[c];
			if (!key) continue;
			obj[key] = (cols[c] || "").trim();
		}
		out.push(obj);
	}
	return out;
}

async function fetchJSON(url) {
	const r = await fetch(url, { cache: "no-store" });
	if (!r.ok) throw new Error(`fetch ${url} ${r.status}`);
	return await r.json();
}
async function fetchText(url) {
	const r = await fetch(url, { cache: "no-store" });
	if (!r.ok) throw new Error(`fetch ${url} ${r.status}`);
	return await r.text();
}
async function fetchTextCORS(url) {
	// Prefer r.jina.ai for RSS (adds permissive CORS), then fall back to isomorphic-git
	const viaJina = (() => {
		try {
			const u = new URL(url);
			return `https://r.jina.ai/http://${u.host}${u.pathname}${u.search}`;
		} catch {
			let s = url;
			if (s.startsWith("https://")) s = s.slice(8);
			else if (s.startsWith("http://")) s = s.slice(7);
			return `https://r.jina.ai/http://${s}`;
		}
	})();
	try {
		return await fetchText(viaJina);
	} catch (e1) {
		try {
			const viaIso = "https://cors.isomorphic-git.org/" + url;
			return await fetchText(viaIso);
		} catch (e2) {
			throw e2 || e1;
		}
	}
}

function setTape(element, pieces) {
	// pieces: [{text, cls}]
	element.innerHTML = "";
	const span = document.createElement("div");
	span.style.display = "inline-block";
	span.style.whiteSpace = "nowrap";
	let x = 0;
	pieces.forEach(p => {
		const s = document.createElement("span");
		s.textContent = p.text;
		if (p.cls) s.className = p.cls;
		span.appendChild(s);
	});
	element.appendChild(span);
	// scroll
	let pos = element.clientWidth;
	function step() {
		pos -= 1.5;
		if (pos + span.clientWidth <= 0) pos = element.clientWidth;
		span.style.transform = `translateX(${pos}px)`;
		requestAnimationFrame(step);
	}
	requestAnimationFrame(step);
}

function escapeHTML(s) {
	return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function linkify(text) {
	const escaped = escapeHTML(text);
	// Replace URLs with anchor tags
	return escaped.replace(/https?:\/\/[^\s]+/g, (url) => {
		return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
	}).replace(/\n/g, "<br>");
}
function renderOutputBlock(block) {
	const out = document.getElementById("output");
	const div = document.createElement("div");
	div.className = "out-block";
	div.innerHTML = linkify(block);
	// Prepend newest block at top
	if (out.firstChild) out.insertBefore(div, out.firstChild);
	else out.appendChild(div);
	// Scroll to top to show newest
	out.scrollTop = 0;
}

function buildRecentQuery(name, org, email) {
	let q = `"${name}"`;
	if (email && email.includes("@")) {
		const domain = email.split("@")[1].toLowerCase();
		const map = {
			"washpost.com":"washingtonpost.com", "bloomberg.net":"bloomberg.com",
			"nytimes.com":"nytimes.com", "wsj.com":"wsj.com", "ft.com":"ft.com",
			"thomsonreuters.com":"reuters.com", "reuters.com":"reuters.com",
			"ap.org":"apnews.com", "politico.com":"politico.com"
		};
		const site = map[domain] || domain;
		if (site) q += ` site:${site}`;
	} else if (org) {
		q += ` "${org}"`;
	}
	return q;
}

async function fetchRecentBlock(name, org, email) {
	const query = buildRecentQuery(name, org, email);
	const base = "https://news.google.com/rss/search";
	const url = `${base}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
	try {
		// Use CORS-friendly proxy to fetch the RSS
		const xml = await fetchTextCORS(url);
		const parser = new DOMParser();
		const doc = parser.parseFromString(xml, "text/xml");
		const items = Array.from(doc.querySelectorAll("item")).slice(0, 10);
		if (items.length === 0) return `No recent work found for ${name}.\n`;
		const lines = [];
		lines.push(`Recent work for ${name} — ${org}`.trim());
		lines.push("----------------------------------------");
		items.forEach((it, i) => {
			const title = (it.querySelector("title")?.textContent || "").trim();
			const link = (it.querySelector("link")?.textContent || "").trim();
			const pubDate = (it.querySelector("pubDate")?.textContent || "").trim();
			lines.push(`${(i+1).toString().padStart(2," ")}. ${title}`);
			if (pubDate) lines.push(`    ${pubDate}`);
			if (link) lines.push(`    ${link}`);
		});
		lines.push("");
		return lines.join("\n");
	} catch (e) {
		return `Failed to fetch recent work for ${name}: ${e}\n`;
	}
}

// ---- Finnhub (parity with Python CLI) ----
const FINNHUB_DEFAULT_KEY = "cr59shhr01qrns9mpm20cr59shhr01qrns9mpm2g";
function getFinnhubKey() {
	// Allow override via localStorage or ?finnhub=KEY
	const url = new URL(window.location.href);
	const qp = url.searchParams.get("finnhub");
	if (qp) return qp;
	const ls = localStorage.getItem("FINNHUB_API_KEY");
	return ls || FINNHUB_DEFAULT_KEY;
}
async function finnhubJSON(path, params) {
	const token = getFinnhubKey();
	const u = new URL("https://finnhub.io" + path);
	Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
	u.searchParams.set("token", token);
	const r = await fetch(u.toString(), { cache: "no-store" });
	if (!r.ok) throw new Error(`Finnhub ${path} ${r.status}`);
	return await r.json();
}
async function finnhubQuote(symbol) {
	return await finnhubJSON("/api/v1/quote", { symbol });
}
async function finnhubProfile(symbol) {
	return await finnhubJSON("/api/v1/stock/profile2", { symbol });
}
async function finnhubMetric(symbol) {
	const m = await finnhubJSON("/api/v1/stock/metric", { symbol, metric: "all" });
	return (m && m.metric) ? m.metric : {};
}
async function finnhubCompanyNews(symbol) {
	const to = new Date();
	const from = new Date(to.getTime() - 10 * 24 * 60 * 60 * 1000);
	function iso(d){ return d.toISOString().slice(0,10); }
	return await finnhubJSON("/api/v1/company-news", { symbol, from: iso(from), to: iso(to) });
}
function humanNumber(value) {
	let num = Number(value);
	if (!isFinite(num)) return "";
	const abs = Math.abs(num);
	if (abs >= 1e12) return (num/1e12).toFixed(2) + "T";
	if (abs >= 1e9) return (num/1e9).toFixed(2) + "B";
	if (abs >= 1e6) return (num/1e6).toFixed(2) + "M";
	if (abs >= 1e3) return (num/1e3).toFixed(2) + "K";
	return num.toFixed(2);
}
function asPercent(v) {
	if (v == null || isNaN(v)) return null;
	let num = Number(v);
	if (Math.abs(num) <= 1) num *= 100;
	return num.toFixed(2) + "%";
}
async function renderStockViaFinnhub(ticker) {
	try {
		const [quote, profile, metrics] = await Promise.all([
			finnhubQuote(ticker),
			finnhubProfile(ticker),
			finnhubMetric(ticker),
		]);
		const name = profile.name || profile.ticker || ticker;
		const currency = profile.currency || "";
		const price = quote.c;
		const change = quote.d;
		const changePct = quote.dp;
		const dayLow = quote.l, dayHigh = quote.h;
		const marketCap = profile.marketCapitalization;
		const lines = [];
		lines.push(`${name} (${ticker})`);
		if (price != null) lines.push(`Price: ${price} ${currency}`);
		if (change != null && changePct != null) {
			lines.push(`Change: ${change} (${Number(changePct).toFixed(2)}%)`);
		}
		if (marketCap != null) lines.push(`Market Cap: ${humanNumber(marketCap * 1e6)}`);
		lines.push("");
		lines.push("Fundamentals");
		lines.push("------------");
		if (dayLow != null && dayHigh != null) lines.push(`Day Range: ${dayLow} - ${dayHigh}`);
		const yrLow = metrics["52WeekLow"] || metrics["fiftyTwoWeekLow"];
		const yrHigh = metrics["52WeekHigh"] || metrics["fiftyTwoWeekHigh"];
		if (yrLow != null && yrHigh != null) lines.push(`52W Range: ${yrLow} - ${yrHigh}`);
		const pe = metrics["peBasicExclExtraTTM"] || metrics["peNormalizedAnnual"];
		if (pe != null) lines.push(`PE (TTM): ${Number(pe).toFixed(2)}`);
		const eps = metrics["epsExclExtraItemsTTM"] || metrics["epsBasicExclExtraItemsTTM"];
		if (eps != null) lines.push(`EPS (TTM): ${Number(eps).toFixed(2)}`);
		// Dividend yield (derive)
		const divPS = metrics["dividendPerShareTTM"] || metrics["dividendPerShareAnnual"] || metrics["dividendTTM"] || metrics["dividendPerShareTrailing12Months"];
		let divYieldPct = null;
		if (divPS != null && price) {
			try { divYieldPct = (Number(divPS) / Number(price)) * 100; } catch {}
		}
		if (divYieldPct == null) {
			const raw = metrics["dividendYieldTTM"] || metrics["dividendYieldIndicatedAnnual"] || metrics["dividendYieldAnnual"];
			if (raw != null) {
				const val = Number(raw);
				if (val > 0 && val <= 1) divYieldPct = val * 100;
				else if (val > 1 && val < 20) divYieldPct = val;
			}
		}
		if (divYieldPct != null) lines.push(`Dividend Yield: ${divYieldPct.toFixed(2)}%`);
		const gm = asPercent(metrics["grossMarginTTM"]);
		if (gm) lines.push(`Gross Margins: ${gm}`);
		const om = asPercent(metrics["operatingMarginTTM"]);
		if (om) lines.push(`Operating Margin: ${om}`);
		const pm = asPercent(metrics["netProfitMarginTTM"]);
		if (pm) lines.push(`Profit Margin: ${pm}`);
		if (profile.finnhubIndustry) lines.push(`Sector/Industry: ${profile.finnhubIndustry}`);
		lines.push("");
		lines.push("Latest News");
		lines.push("-----------");
		const news = await finnhubCompanyNews(ticker);
		if (!Array.isArray(news) || news.length === 0) {
			lines.push("No news found.");
		} else {
			news.slice(0, 10).forEach((n, i) => {
				const title = n.headline || "";
				const link = n.url || "";
				const source = n.source || "";
				let dateStr = "";
				if (n.datetime) {
					try {
						dateStr = new Date(Number(n.datetime) * 1000).toUTCString().replace(" GMT","");
					} catch {}
				}
				lines.push(`${String(i+1).padStart(2," ")}. ${title}`);
				const meta = [source, dateStr].filter(Boolean).join(" ");
				if (meta) lines.push(`    ${meta}`);
				if (link) lines.push(`    ${link}`);
			});
		}
		lines.push("");
		renderOutputBlock(lines.join("\n"));
		return true;
	} catch (e) {
		return false;
	}
}

async function fetchYahooQuote(symbol) {
	const urls = [
		`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`,
		`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`
	];
	for (const url of urls) {
		try {
			const r = await fetch(url);
			if (!r.ok) continue;
			const data = await r.json();
			const res = data?.quoteResponse?.result?.[0];
			if (res) return res;
		} catch {}
	}
	return null;
}

async function fetchYahooChartCloses(symbol) {
	const urls = [
		`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`,
		`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`
	];
	for (const url of urls) {
		try {
			const r = await fetch(url);
			if (!r.ok) continue;
			const data = await r.json();
			const res = data?.chart?.result?.[0];
			const closes = res?.indicators?.quote?.[0]?.close || [];
			return closes.filter(v => v != null).map(Number);
		} catch {}
	}
	return [];
}

function formatChange(cur, past) {
	if (cur == null || past == null || past === 0) return "";
	const diff = cur - past;
	const pct = (diff / past) * 100;
	const sign = diff >= 0 ? "+" : "";
	return `${sign}${diff.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
}

async function main() {
	// Initial tapes
	async function refreshTapes() {
		try {
			const markets = await fetchJSON("data/markets.json");
			const pieces = [];
			markets.forEach((m, idx) => {
				if (idx > 0) pieces.push({ text:"   |   " });
				pieces.push({ text: `${m.label} ` });
				pieces.push({ text: `${m.price} `, cls: m.dir >= 0 ? "up" : "down" });
				pieces.push({ text: `${m.pct}`, cls: m.dir >= 0 ? "up" : "down" });
			});
			setTape(document.getElementById("markets-tape"), pieces);
		} catch {}
		try {
			const news = await fetchJSON("data/news.json");
			const pieces = [];
			news.forEach((n, idx) => {
				if (idx > 0) pieces.push({ text:"   •   " });
				pieces.push({ text: n.title });
			});
			setTape(document.getElementById("news-tape"), pieces);
		} catch {}
	}
	await refreshTapes();
	setInterval(refreshTapes, 90_000);

	// Directory panel
	let mode = "researchers";
	let allRows = [];
	const orgSel = document.getElementById("org-filter");
	const topicSel = document.getElementById("topic-filter");
	const searchBox = document.getElementById("search-box");
	const tableBody = document.querySelector("#people-table tbody");
	const btnRecent = document.getElementById("btn-recent");
	const feedSelect = document.getElementById("feed-select");
	const btnFeedLoad = document.getElementById("btn-feed-load");
	const cmdInput = document.getElementById("cmd-input");
	const cmdRun = document.getElementById("cmd-run");

	function setSelectOptions(select, values) {
		select.innerHTML = "";
		const optEmpty = document.createElement("option");
		optEmpty.value = ""; optEmpty.textContent = "";
		select.appendChild(optEmpty);
		values.forEach(v => {
			const o = document.createElement("option");
			o.value = v; o.textContent = v;
			select.appendChild(o);
		});
	}

	async function loadMode() {
		mode = document.querySelector('input[name="mode"]:checked').value;
		let rows = [];
		if (mode === "researchers") {
			const txt = await fetchText("data/dc_researchers_with_emails_CONSOLIDATED.csv");
			const parsed = parseCSV(txt);
			rows = parsed.map(r => ({
				name: r.name || "",
				org: r.think_tank || "",
				topic: r.consolidated_topic || r.topic || "",
				email: r.email || ""
			}));
		} else {
			const txt = await fetchText("data/journalists_china_asia_FULL.csv");
			const parsed = parseCSV(txt);
			rows = parsed.map(r => ({
				name: r.name || "",
				org: r.publication || "",
				topic: r.beat || "",
				email: r.email || ""
			}));
		}
		allRows = rows;
		const orgs = Array.from(new Set(rows.map(r => r.org).filter(Boolean))).sort();
		const topics = Array.from(new Set(rows.map(r => r.topic).filter(Boolean))).sort();
		setSelectOptions(orgSel, orgs);
		setSelectOptions(topicSel, topics);
		orgSel.value = ""; topicSel.value = ""; searchBox.value = "";
		renderTable();
	}

	// Load feed list for left controls
	async function loadFeedsIndex() {
		try {
			const payload = await fetchJSON("data/feeds.json");
			const feeds = payload.feeds || [];
			window.__feedsOrder = feeds;
			// Map abbr -> url for live fallback
			window.__feedUrlMap = {};
			feeds.forEach(f => { if (f.abbr) window.__feedUrlMap[f.abbr] = f.url || ""; });
			feedSelect.innerHTML = "";
			feeds.forEach(f => {
				const opt = document.createElement("option");
				opt.value = f.abbr;
				opt.textContent = `${f.abbr} — ${f.title}`;
				feedSelect.appendChild(opt);
			});
			if (feeds.length === 0) {
				const opt = document.createElement("option");
				opt.textContent = "No feeds available";
				feedSelect.appendChild(opt);
			}
			return payload;
		} catch (e) {
			const opt = document.createElement("option");
			opt.textContent = "Feeds unavailable";
			feedSelect.appendChild(opt);
			return null;
		}
	}

	btnFeedLoad.addEventListener("click", async () => {
		const abbr = feedSelect.value;
		if (!abbr) return;
		try {
			// feeds.json already contains items; reload to get latest
			const payload = await fetchJSON("data/feeds.json");
			const items = (payload.data && payload.data[abbr]) ? payload.data[abbr] : [];
			if (!items || items.length === 0) {
				// Try live fallback via CORS-friendly proxy
				const url = (window.__feedUrlMap && window.__feedUrlMap[abbr]) ? window.__feedUrlMap[abbr] : "";
				if (url) {
					const live = await fetchFeedLive(url);
					if (live && live.length) {
						renderFeedItems(abbr, live);
						return;
					}
				}
				renderOutputBlock(`No items for ${abbr}.`);
				return;
			}
			renderFeedItems(abbr, items);
		} catch (e) {
			renderOutputBlock(`Failed to load feed ${abbr}: ${e}`);
		}
	});

	function renderFeedItems(abbr, items) {
		const lines = [];
		lines.push(`Feed: ${abbr}`);
		lines.push("------------------------------");
		items.forEach((it, i) => {
			const title = it.title || "";
			const link = it.link || "";
			const pub = it.pubDate || it.pubdate || it.updated || "";
			lines.push(`${(i+1).toString().padStart(2," ")}. ${title}`);
			if (pub) lines.push(`    ${pub}`);
			if (link) lines.push(`    ${link}`);
		});
		lines.push("");
		renderOutputBlock(lines.join("\n"));
	}

	function makeProxyUrl(feedUrl) {
		try {
			const u = new URL(feedUrl);
			return `https://r.jina.ai/http://${u.host}${u.pathname}${u.search}`;
		} catch {
			return `https://r.jina.ai/http://${feedUrl.replace(/^https?:\/\//,"")}`;
		}
	}

	async function fetchFeedLive(feedUrl) {
		try {
			const xml = await fetchTextCORS(feedUrl);
			const parser = new DOMParser();
			const doc = parser.parseFromString(xml, "text/xml");
			const items = Array.from(doc.querySelectorAll("item")).slice(0, 25);
			if (items.length) {
				return items.map(it => ({
					title: (it.querySelector("title")?.textContent || "").trim(),
					link: (it.querySelector("link")?.textContent || "").trim(),
					pubDate: (it.querySelector("pubDate")?.textContent || it.querySelector("updated")?.textContent || "").trim(),
				}));
			}
			// Atom fallback
			const entries = Array.from(doc.querySelectorAll("entry")).slice(0, 25);
			return entries.map(it => ({
				title: (it.querySelector("title")?.textContent || "").trim(),
				link: (it.querySelector("link")?.getAttribute("href") || "").trim(),
				pubDate: (it.querySelector("updated")?.textContent || "").trim(),
			}));
		} catch {
			return [];
		}
	}

	function filteredRows() {
		const org = orgSel.value.trim();
		const topic = topicSel.value.trim();
		const q = searchBox.value.trim().toLowerCase();
		return allRows.filter(r => {
			if (org && r.org !== org) return false;
			if (topic && r.topic !== topic) return false;
			if (q) {
				const hay = `${r.name} ${r.org} ${r.topic} ${r.email}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		});
	}

	function renderTable() {
		const rows = filteredRows();
		tableBody.innerHTML = "";
		rows.forEach(r => {
			const tr = document.createElement("tr");
			tr.innerHTML = `<td>${r.name}</td><td>${r.org}</td><td>${r.topic}</td><td>${r.email}</td>`;
			tr.addEventListener("click", () => {
				Array.from(tableBody.children).forEach(el => el.classList.remove("selected"));
				tr.classList.add("selected");
				tr.dataset.selected = "1";
			});
			tr.addEventListener("dblclick", async () => {
				await showRecentForSelected();
			});
			tableBody.appendChild(tr);
		});
	}

	document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener("change", loadMode));
	orgSel.addEventListener("change", renderTable);
	topicSel.addEventListener("change", renderTable);
	searchBox.addEventListener("input", renderTable);

	async function showRecentForSelected() {
		const sel = Array.from(tableBody.children).find(tr => tr.classList.contains("selected"));
		if (!sel) { renderOutputBlock("Select a person first to show recent work."); return; }
		const tds = sel.querySelectorAll("td");
		const name = tds[0].textContent || "";
		const org = tds[1].textContent || "";
		const email = tds[3].textContent || "";
		// Try prebuilt recent.json first (built by Python), then fall back to live fetch
		try {
			if (!window.__recentMap) {
				window.__recentMap = await fetchJSON("data/recent.json");
			}
		} catch {}
		let usedPrebuilt = false;
		if (window.__recentMap) {
			const key = `${name}|${org}|${email}`;
			const items = window.__recentMap[key] || [];
			if (items && items.length) {
				const lines = [];
				lines.push(`Recent work for ${name} — ${org}`.trim());
				lines.push("----------------------------------------");
				items.slice(0, 10).forEach((it, i) => {
					lines.push(`${String(i+1).padStart(2," ")}. ${it.title || ""}`);
					if (it.pubDate) lines.push(`    ${it.pubDate}`);
					if (it.link) lines.push(`    ${it.link}`);
				});
				lines.push("");
				renderOutputBlock(lines.join("\n"));
				usedPrebuilt = true;
			}
		}
		if (!usedPrebuilt) {
			const block = await fetchRecentBlock(name, org, email);
			renderOutputBlock(block);
		}
	}
	btnRecent.addEventListener("click", async () => {
		await showRecentForSelected();
	});
	// Enter key triggers recent work when a person is selected
	document.addEventListener("keydown", async (e) => {
		if (e.key === "Enter" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
			await showRecentForSelected();
		}
	});

	// TradingView Economic Calendar - draggable overlay
	function createCalendarOverlay() {
		let overlay = document.getElementById("tv-calendar-overlay");
		if (overlay) {
			overlay.classList.toggle("hidden");
			return;
		}
		overlay = document.createElement("div");
		overlay.id = "tv-calendar-overlay";
		overlay.className = "floating-overlay";
		const header = document.createElement("div");
		header.className = "floating-header";
		const title = document.createElement("div");
		title.className = "floating-title";
		title.textContent = "Economic Calendar";
		const close = document.createElement("button");
		close.className = "floating-close";
		close.innerHTML = "&times;";
		close.addEventListener("click", () => overlay.classList.add("hidden"));
		header.appendChild(title);
		header.appendChild(close);
		const body = document.createElement("div");
		body.className = "floating-body";
		// TradingView Economic Calendar via iframe embed to avoid environment errors
		const cfg = {
			colorTheme: "light",
			isTransparent: false,
			width: "100%",
			height: "100%",
			locale: "en",
			importanceFilter: "-1,0,1",
			currencyFilter: ""
		};
		const iframe = document.createElement("iframe");
		iframe.setAttribute("allowtransparency", "true");
		iframe.setAttribute("frameborder", "0");
		iframe.style.width = "100%";
		iframe.style.height = "100%";
		// TradingView supports config in hash after JSON-encoded string
		const hash = encodeURIComponent(JSON.stringify(cfg));
		iframe.src = `https://s.tradingview.com/embed-widget/events/?locale=en#${hash}`;
		iframe.addEventListener("error", () => {
			// Fallback: open calendar in a new tab if the embed fails (adblock/network issue)
			window.open("https://www.tradingview.com/markets/fx/economic-calendar/", "_blank", "noopener,noreferrer");
			overlay.classList.add("hidden");
		});
		body.appendChild(iframe);
		overlay.appendChild(header);
		overlay.appendChild(body);
		document.body.appendChild(overlay);
		// Dragging
		let drag = {x:0, y:0, left:0, top:0, active:false};
		header.addEventListener("mousedown", (e) => {
			drag.active = true;
			drag.x = e.clientX;
			drag.y = e.clientY;
			const rect = overlay.getBoundingClientRect();
			drag.left = rect.left;
			drag.top = rect.top;
			e.preventDefault();
		});
		document.addEventListener("mousemove", (e) => {
			if (!drag.active) return;
			const dx = e.clientX - drag.x;
			const dy = e.clientY - drag.y;
			overlay.style.left = Math.max(0, drag.left + dx) + "px";
			overlay.style.top = Math.max(0, drag.top + dy) + "px";
		});
		document.addEventListener("mouseup", () => drag.active = false);
	}
	// Calendar invoked via command list (item 49)

	// Geo Browser overlay with map, reverse geocode, and actions
	function openGeoOverlay() {
		const overlayId = "geo-overlay";
		let overlay = document.getElementById(overlayId);
		if (overlay) { overlay.classList.toggle("hidden"); return; }
		overlay = document.createElement("div");
		overlay.id = overlayId;
		overlay.className = "floating-overlay";
		const header = document.createElement("div");
		header.className = "floating-header";
		const title = document.createElement("div");
		title.className = "floating-title";
		title.textContent = "Geo Browser";
		const actions = document.createElement("div");
		actions.className = "floating-search";
		const status = document.createElement("span");
		status.textContent = "Click map to pick a location";
		const btnNews = document.createElement("button");
		btnNews.textContent = "News";
		const btnInfo = document.createElement("button");
		btnInfo.textContent = "Country Info";
		const close = document.createElement("button");
		close.className = "floating-close";
		close.innerHTML = "&times;";
		close.addEventListener("click", () => overlay.classList.add("hidden"));
		actions.appendChild(status);
		actions.appendChild(btnNews);
		actions.appendChild(btnInfo);
		actions.appendChild(close);
		header.appendChild(title);
		header.appendChild(actions);
		const body = document.createElement("div");
		body.className = "floating-body";
		const mapDiv = document.createElement("div");
		mapDiv.id = "geo-map";
		mapDiv.style.width = "100%";
		mapDiv.style.height = "100%";
		body.appendChild(mapDiv);
		overlay.appendChild(header);
		overlay.appendChild(body);
		document.body.appendChild(overlay);
		// Dragging
		let drag = {x:0, y:0, left:0, top:0, active:false};
		header.addEventListener("mousedown", (e) => {
			if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON")) return;
			drag.active = true;
			drag.x = e.clientX;
			drag.y = e.clientY;
			const rect = overlay.getBoundingClientRect();
			drag.left = rect.left;
			drag.top = rect.top;
			e.preventDefault();
		});
		document.addEventListener("mousemove", (e) => {
			if (!drag.active) return;
			const dx = e.clientX - drag.x;
			const dy = e.clientY - drag.y;
			overlay.style.left = Math.max(0, drag.left + dx) + "px";
			overlay.style.top = Math.max(0, drag.top + dy) + "px";
		});
		document.addEventListener("mouseup", () => drag.active = false);
		// Map
		let selected = null;
		let marker = null;
		function placeLabel(p) {
			const parts = [];
			if (p.city) parts.push(p.city);
			else if (p.locality) parts.push(p.locality);
			if (p.principalSubdivision) parts.push(p.principalSubdivision);
			if (p.countryName) parts.push(p.countryName);
			return parts.join(", ");
		}
		async function reverseGeocode(lat, lon) {
			try {
				const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`;
				const data = await fetchJSON(url);
				return {
					lat, lon,
					city: data.city || data.locality || data.localityInfo?.administrative?.find(a => a.order === 5)?.name || "",
					locality: data.locality || "",
					principalSubdivision: data.principalSubdivision || "",
					countryName: data.countryName || data.country || "",
				};
			} catch {
				return { lat, lon, city:"", locality:"", principalSubdivision:"", countryName:"" };
			}
		}
		function buildNewsQueryForPlace(p) {
			const parts = [];
			const city = p.city || p.locality;
			if (city) parts.push(`"${city}"`);
			if (p.countryName) parts.push(`"${p.countryName}"`);
			const q = parts.join(" ");
			return q || `"${p.lat.toFixed(2)},${p.lon.toFixed(2)}"`;
		}
		async function fetchNewsForPlace(p) {
			const base = "https://news.google.com/rss/search";
			const query = buildNewsQueryForPlace(p);
			const url = `${base}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
			try {
				const xml = await fetchTextCORS(url);
				const parser = new DOMParser();
				const doc = parser.parseFromString(xml, "text/xml");
				const items = Array.from(doc.querySelectorAll("item")).slice(0, 10);
				const lines = [];
				lines.push(`News for ${placeLabel(p) || `${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`}`);
				lines.push("----------------------------------------");
				if (items.length === 0) {
					lines.push("No items found.");
				} else {
					items.forEach((it, i) => {
						const title = (it.querySelector("title")?.textContent || "").trim();
						const link = (it.querySelector("link")?.textContent || "").trim();
						const pubDate = (it.querySelector("pubDate")?.textContent || "").trim();
						lines.push(`${String(i+1).padStart(2," ")}. ${title}`);
						if (pubDate) lines.push(`    ${pubDate}`);
						if (link) lines.push(`    ${link}`);
					});
				}
				lines.push("");
				renderOutputBlock(lines.join("\n"));
			} catch (e) {
				renderOutputBlock(`Failed to fetch news for ${placeLabel(p)}: ${e}\n`);
			}
		}
		async function fetchWikiForCountry(name) {
			if (!name) { renderOutputBlock("No country identified for this location.\n"); return; }
			try {
				const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
				const data = await fetchJSON(url);
				const lines = [];
				lines.push(`${data.title || name}`);
				lines.push("------------------------------");
				if (data.description) lines.push(data.description);
				if (data.extract) {
					lines.push("");
					lines.push(data.extract);
				}
				if (data.content_urls?.desktop?.page) {
					lines.push("");
					lines.push(data.content_urls.desktop.page);
				}
				lines.push("");
				renderOutputBlock(lines.join("\n"));
			} catch (e) {
				renderOutputBlock(`Failed to load Wikipedia summary for ${name}: ${e}\n`);
			}
		}
		function requireLeaflet() {
			if (typeof L === "undefined") {
				renderOutputBlock("Map library not loaded. Please refresh the page.\n");
				return false;
			}
			return true;
		}
		if (!requireLeaflet()) return;
		const map = L.map(mapDiv).setView([20, 0], 2);
		L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
			attribution: "© OpenStreetMap contributors"
		}).addTo(map);
		map.on("click", async (e) => {
			const { lat, lng } = e.latlng;
			selected = await reverseGeocode(lat, lng);
			status.textContent = placeLabel(selected) || `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
			if (marker) marker.remove();
			marker = L.marker([lat, lng]).addTo(map);
		});
		btnNews.addEventListener("click", async () => {
			if (!selected) { renderOutputBlock("Pick a location on the map first.\n"); return; }
			await fetchNewsForPlace(selected);
		});
		btnInfo.addEventListener("click", async () => {
			if (!selected) { renderOutputBlock("Pick a location on the map first.\n"); return; }
			await fetchWikiForCountry(selected.countryName || "");
		});
	}

	// TradingView widgets (for numbered commands 42+)
	const TV_WIDGETS = [
		{ key:"advanced-chart", title:"Advanced Chart" },
		{ key:"stock-heatmap", title:"Stock Heatmap" },
		{ key:"screener", title:"Screener" },
		{ key:"fundamental-data", title:"Fundamental Data" },
		{ key:"company-profile", title:"Company Profile" },
		{ key:"economic-map", title:"Economic Map" },
	];

	function openTradingViewWidget(kind) {
		const MAP = {
			"advanced-chart": {
				title: "Advanced Chart",
				path: "advanced-chart",
				genCfg: (symbol="AAPL") => ({
					autosize: true,
					symbol,
					interval: "D",
					timezone: "Etc/UTC",
					theme: "light",
					locale: "en",
					allow_symbol_change: true,
					hide_top_toolbar: false
				}),
				fallback: (symbol="AAPL") => `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`,
				acceptsSymbol: true
			},
			"stock-heatmap": {
				title: "Stock Heatmap",
				path: "stock-heatmap",
				genCfg: () => ({ colorTheme: "light", dataSource: "SPX500", grouping: "sector", blockSize: "market_cap_basic", locale: "en" }),
				fallback: () => "https://www.tradingview.com/heatmap/stock/",
				acceptsSymbol: false
			},
			"screener": {
				title: "Screener",
				path: "screener",
				genCfg: () => ({ locale: "en", colorTheme: "light", defaultColumn: "overview", screener_type: "stock", displayCurrency: "USD" }),
				fallback: () => "https://www.tradingview.com/screener/",
				acceptsSymbol: false
			},
			"fundamental-data": {
				title: "Fundamental Data",
				path: "fundamental-data",
				genCfg: (symbol="AAPL") => ({ symbol, colorTheme: "light", isTransparent: false, largeChartUrl: "", displayMode: "compact", width: "100%", height: "100%" }),
				fallback: (symbol="AAPL") => `https://www.tradingview.com/symbols/${encodeURIComponent(symbol)}/financials-overview/`,
				acceptsSymbol: true,
				useScript: true,
				scriptSrc: "https://s3.tradingview.com/external-embedding/embed-widget-fundamental-data.js"
			},
			"company-profile": {
				title: "Company Profile",
				path: "company-profile",
				genCfg: (symbol="AAPL") => ({ symbol, colorTheme: "light", isTransparent: false, width: "100%", height: "100%" }),
				fallback: (symbol="AAPL") => `https://www.tradingview.com/symbols/${encodeURIComponent(symbol)}/company-profile/`,
				acceptsSymbol: true,
				useScript: true,
				scriptSrc: "https://s3.tradingview.com/external-embedding/embed-widget-company-profile.js"
			},
			"economic-map": {
				title: "Economic Map",
				path: "economic-map",
				genCfg: () => ({ colorTheme: "light", isTransparent: false, width: "100%", height: "100%", locale: "en" }),
				fallback: () => "https://www.tradingview.com/economic-map/",
				acceptsSymbol: false,
				useScript: true,
				scriptSrc: "https://s3.tradingview.com/external-embedding/embed-widget-economic-map.js"
			}
		};
		const meta = MAP[kind];
		if (!meta) return;
		const overlayId = `tv-${kind}-overlay`;
		let overlay = document.getElementById(overlayId);
		if (!overlay) {
			overlay = document.createElement("div");
			overlay.id = overlayId;
			overlay.className = "floating-overlay";
			const header = document.createElement("div");
			header.className = "floating-header";
			const title = document.createElement("div");
			title.className = "floating-title";
			title.textContent = meta.title;
			const actions = document.createElement("div");
			actions.className = "floating-search";
			let input = null, applyBtn = null;
			if (meta.acceptsSymbol) {
				input = document.createElement("input");
				input.type = "text";
				input.placeholder = "Symbol (e.g., AAPL)";
				input.value = "AAPL";
				applyBtn = document.createElement("button");
				applyBtn.textContent = "Load";
				actions.appendChild(input);
				actions.appendChild(applyBtn);
			}
			const close = document.createElement("button");
			close.className = "floating-close";
			close.innerHTML = "&times;";
			close.addEventListener("click", () => overlay.classList.add("hidden"));
			actions.appendChild(close);
			header.appendChild(title);
			header.appendChild(actions);
			const body = document.createElement("div");
			body.className = "floating-body";
			let currentSymbol = "AAPL";
			let iframe = null;
			let scriptContainer = null;
			function mountIframe(symbol) {
				if (scriptContainer) { scriptContainer.remove(); scriptContainer = null; }
				if (!iframe) {
					iframe = document.createElement("iframe");
					iframe.setAttribute("allowtransparency", "true");
					iframe.setAttribute("frameborder", "0");
					iframe.style.width = "100%";
					iframe.style.height = "100%";
					iframe.addEventListener("error", () => {
						if (meta.fallback) {
							const sym = input ? (input.value || "AAPL") : "AAPL";
							const url = typeof meta.fallback === "function" ? meta.fallback(sym) : meta.fallback;
							window.open(url, "_blank", "noopener,noreferrer");
						}
						overlay.classList.add("hidden");
					});
					body.appendChild(iframe);
				}
				const cfg = meta.genCfg ? meta.genCfg(symbol) : {};
				const hash = encodeURIComponent(JSON.stringify(cfg || {}));
				iframe.src = `https://s.tradingview.com/embed-widget/${meta.path}/?locale=en#${hash}`;
			}
			function mountScript(symbol) {
				if (iframe) { iframe.remove(); iframe = null; }
				if (scriptContainer) scriptContainer.remove();
				scriptContainer = document.createElement("div");
				scriptContainer.className = "tradingview-widget-container";
				const widget = document.createElement("div");
				widget.className = "tradingview-widget-container__widget";
				scriptContainer.appendChild(widget);
				const script = document.createElement("script");
				script.type = "text/javascript";
				script.async = true;
				script.src = meta.scriptSrc;
				const cfg = meta.genCfg ? meta.genCfg(symbol) : {};
				script.innerHTML = JSON.stringify(cfg);
				scriptContainer.appendChild(script);
				body.appendChild(scriptContainer);
			}
			function setWidget(symbol) {
				currentSymbol = symbol || "AAPL";
				if (meta.useScript) mountScript(currentSymbol);
				else mountIframe(currentSymbol);
			}
			setWidget("AAPL");
			overlay.appendChild(header);
			overlay.appendChild(body);
			document.body.appendChild(overlay);
			if (meta.acceptsSymbol && applyBtn && input) {
				function applySymbol() {
					const sym = (input.value || "AAPL").toUpperCase();
					setWidget(sym);
				}
				applyBtn.addEventListener("click", applySymbol);
				input.addEventListener("keydown", (e) => {
					if (e.key === "Enter") applySymbol();
				});
			}
			// Dragging
			let drag = {x:0, y:0, left:0, top:0, active:false};
			header.addEventListener("mousedown", (e) => {
				if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON")) return;
				drag.active = true;
				drag.x = e.clientX;
				drag.y = e.clientY;
				const rect = overlay.getBoundingClientRect();
				drag.left = rect.left;
				drag.top = rect.top;
				e.preventDefault();
			});
			document.addEventListener("mousemove", (e) => {
				if (!drag.active) return;
				const dx = e.clientX - drag.x;
				const dy = e.clientY - drag.y;
				overlay.style.left = Math.max(0, drag.left + dx) + "px";
				overlay.style.top = Math.max(0, drag.top + dy) + "px";
			});
			document.addEventListener("mouseup", () => drag.active = false);
		}
		overlay.classList.remove("hidden");
	}

	// Command parsing and execution
	let feedsIndex = null;
	async function guide() {
		if (!feedsIndex) {
			feedsIndex = await fetchJSON("data/feeds.json");
		}
		const lines = [];
		lines.push("News RSS Feeds");
		lines.push("------------------");
		(feedsIndex.feeds || []).forEach((f, i) => {
			lines.push(`${String(i+1).padStart(2," ")}. ${f.abbr.padEnd(6," ")} ${f.title}`);
		});
		const base = 41; // next numbers start at 42
		lines.push("");
		lines.push("Trading Widgets");
		lines.push("------------------");
		TV_WIDGETS.forEach((w, idx) => {
			lines.push(`${String(base + idx + 1).padStart(2," ")}. ${w.title}`);
		});
		lines.push(`${String(base + TV_WIDGETS.length + 1).padStart(2," ")}. Economic Calendar`);
		lines.push(`${String(base + TV_WIDGETS.length + 2).padStart(2," ")}. Geo Browser`);
		lines.push("");
		lines.push("Specials");
		lines.push("------------------");
		lines.push("STOCK TICKER   — Stock Lookup (price, fundamentals, news)");
		lines.push("CMDTY          — Commodities Snapshot (price, 1w, 1m change)");
		lines.push("LM             — LiveUAMap");
		lines.push("FT today       — All Financial Times articles published today");
		lines.push("");
		lines.push('Select a feed by number, abbreviation, or title.');
		lines.push('Usage: 35 TICKER (e.g., 35 AAPL) or "STOCK AAPL". Specials: CMDTY, LM. Widgets: 42+');
		lines.push("");
		renderOutputBlock(lines.join("\n"));
	}
	function normalize(text){ return (text||"").trim(); }
	function parseSelection(input){
		const text = normalize(input);
		if (!text) return {mode:"invalid"};
		const parts = text.split(/\s+/);
		const first = parts[0];
		// numeric index
		if (/^\d+$/.test(first)) {
			const idx = parseInt(first,10);
			if (parts.length >= 2 && window.__feedsOrder && window.__feedsOrder[idx-1] && (window.__feedsOrder[idx-1].abbr || "").toUpperCase() === "STOCK") {
				return {mode:"stock", ticker: parts[1].toUpperCase()};
			}
			return {mode:"feed_index", index: idx};
		}
		// specials and abbr/title
		const up = first.toUpperCase();
		if (up === "LM") return {mode:"liveuamap"};
		if (up === "CMDTY") return {mode:"commodities"};
		if (up === "STOCK") {
			if (parts.length < 2) return {mode:"invalid"};
			return {mode:"stock", ticker: parts[1].toUpperCase()};
		}
		// FT today variants: "ft", "fttoday", "ft today"
		if (text.toLowerCase() === "ft today" || up === "FTTODAY" || up === "FTTD") {
			return {mode:"fttoday"};
		}
		return {mode:"search", text};
	}
	// Build and render FT today block
	function isToday(dateObj) {
		const now = new Date();
		return dateObj.getFullYear() === now.getFullYear() &&
		       dateObj.getMonth() === now.getMonth() &&
		       dateObj.getDate() === now.getDate();
	}
	async function fetchFTTodayBlock() {
		// Try Google News RSS first, then fall back to Bing News RSS
		async function fetchAndFilter(url) {
			const xml = await fetchTextCORS(url);
			const parser = new DOMParser();
			const doc = parser.parseFromString(xml, "text/xml");
			const items = Array.from(doc.querySelectorAll("item"));
			const todays = [];
			for (const it of items) {
				const title = (it.querySelector("title")?.textContent || "").trim();
				const link = (it.querySelector("link")?.textContent || "").trim();
				const pubDateStr = (it.querySelector("pubDate")?.textContent || "").trim();
				if (!pubDateStr) continue;
				let d;
				try { d = new Date(pubDateStr); } catch { continue; }
				if (!isNaN(d) && isToday(d)) {
					todays.push({ title, link, pubDate: pubDateStr, dateObj: d });
				}
			}
			todays.sort((a,b) => b.dateObj - a.dateObj);
			return todays;
		}
		const sources = [
			`https://news.google.com/rss/search?q=${encodeURIComponent("site:ft.com")}&hl=en-US&gl=US&ceid=US:en`,
			`https://www.bing.com/news/search?q=${encodeURIComponent("site:ft.com")}&format=rss`,
		];
		let todays = [];
		let lastError = null;
		for (const src of sources) {
			try {
				todays = await fetchAndFilter(src);
				if (todays.length) break;
			} catch (e) {
				lastError = e;
				continue;
			}
		}
		const lines = [];
		lines.push("FT today — Financial Times articles published today");
		lines.push("--------------------------------------------------");
		if (todays.length === 0) {
			if (lastError) lines.push(`No FT items found. Last error: ${lastError}`);
			else lines.push("No FT items found for today.");
		} else {
			todays.forEach((it, i) => {
				lines.push(`${String(i+1).padStart(2," ")}. ${it.title}`);
				if (it.pubDate) lines.push(`    ${it.pubDate}`);
				if (it.link) lines.push(`    ${it.link}`);
			});
		}
		lines.push("");
		return lines.join("\n");
	}
	async function executeSelection(input){
		try {
			if (!feedsIndex) feedsIndex = await fetchJSON("data/feeds.json");
		} catch {}
		const sel = parseSelection(input);
		if (sel.mode === "invalid") { renderOutputBlock("Invalid selection.\n"); return; }
		if (sel.mode === "liveuamap") {
			window.open("https://liveuamap.com","_blank");
			return;
		}
		if (sel.mode === "commodities") {
			try {
				const data = await fetchJSON("data/commodities.json");
				const lines = [];
				lines.push("Commodities Snapshot");
				lines.push("--------------------");
				data.forEach(row => {
					lines.push(`${row.name}: ${row.current}  |  1w ${row.w}  |  1m ${row.m}`);
				});
				lines.push("");
				lines.push("Note: Yahoo continuous futures; 1w≈5 trading days, 1m≈21 trading days.");
				renderOutputBlock(lines.join("\n"));
			} catch (e) {
				renderOutputBlock(`Failed to load commodities: ${e}\n`);
			}
			return;
		}
		if (sel.mode === "fttoday") {
			const block = await fetchFTTodayBlock();
			renderOutputBlock(block);
			return;
		}
		if (sel.mode === "stock") {
			// Try Finnhub parity first; fallback to Yahoo + Google News
			const ok = await renderStockViaFinnhub(sel.ticker);
			if (!ok) {
				const q = await fetchYahooQuote(sel.ticker);
				if (!q) { renderOutputBlock("Failed to fetch stock data.\n"); return; }
				const lines = [];
				const name = q.shortName || q.longName || sel.ticker;
				const price = q.regularMarketPrice;
				const chg = q.regularMarketChange;
				const pct = q.regularMarketChangePercent;
				lines.push(`${name} (${sel.ticker})`);
				if (price != null) lines.push(`Price: ${price}`);
				if (chg != null && pct != null) lines.push(`Change: ${chg} (${pct.toFixed(2)}%)`);
				lines.push("");
				lines.push("Latest News");
				lines.push("-----------");
				const block = await fetchRecentBlock(sel.ticker, "", "");
				lines.push(block);
				renderOutputBlock(lines.join("\n"));
			}
			return;
		}
		// feed by index or by abbr/title search
		let abbr = null;
		if (sel.mode === "feed_index") {
			const idx = sel.index - 1;
			// 1..41 => feeds; 42+ => widgets
			if (feedsIndex?.feeds && idx < feedsIndex.feeds.length) {
				abbr = feedsIndex.feeds[idx].abbr;
			} else {
				const base = 41;
				const wIdx = sel.index - base - 1;
				if (wIdx >= 0 && wIdx < TV_WIDGETS.length) {
					openTradingViewWidget(TV_WIDGETS[wIdx].key);
					return;
				} else if (wIdx === TV_WIDGETS.length) {
					createCalendarOverlay();
					return;
				} else if (wIdx === TV_WIDGETS.length + 1) {
					openGeoOverlay();
					return;
				}
			}
		} else if (sel.mode === "search") {
			const txt = sel.text.toLowerCase();
			// abbr exact
			abbr = (feedsIndex?.feeds || []).find(f => f.abbr.toLowerCase() === txt)?.abbr || null;
			// title contains
			if (!abbr) {
				const f = (feedsIndex?.feeds || []).find(f => (f.title || "").toLowerCase().includes(txt));
				if (f) abbr = f.abbr;
			}
		}
		if (!abbr) { renderOutputBlock("Invalid selection.\n"); return; }
		// special entries just in case
		if (abbr.toUpperCase() === "LM") { window.open("https://liveuamap.com","_blank"); return; }
		if (abbr.toUpperCase() === "CMDTY") { await executeSelection("CMDTY"); return; }
		if (abbr.toUpperCase() === "STOCK") { renderOutputBlock('Usage: STOCK TICKER (e.g., STOCK AAPL)\n'); return; }
		// load feed items
		try {
			const payload = await fetchJSON("data/feeds.json");
			const items = (payload.data && payload.data[abbr]) ? payload.data[abbr] : [];
			if (!items || items.length === 0) { renderOutputBlock("No items found.\n"); return; }
			const lines = [];
			lines.push(`Feed: ${abbr}`);
			lines.push("------------------------------");
			items.forEach((it, i) => {
				lines.push(`${(i+1).toString().padStart(2," ")}. ${it.title}`);
				if (it.pubDate) lines.push(`    ${it.pubDate}`);
				if (it.link) lines.push(`    ${it.link}`);
			});
			lines.push("");
			renderOutputBlock(lines.join("\n"));
		} catch (e) {
			renderOutputBlock(`Failed to load feed: ${e}\n`);
		}
	}

	function runCmd() {
		const cmd = (cmdInput.value || "").trim();
		if (!cmd) return;
		if (["guide","help","list","options"].includes(cmd.toLowerCase())) {
			guide();
		} else {
			executeSelection(cmd);
		}
		cmdInput.value = "";
	}
	cmdRun.addEventListener("click", runCmd);
	cmdInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") runCmd();
	});

	await loadMode();
	await loadFeedsIndex();
	await guide();
}

main().catch(err => {
	document.getElementById("output").textContent = "Failed to initialize: " + err;
});

