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
function fetchTextCORS(url) {
	// Prefer a CORS pass-through that preserves XML (needed for RSS)
	const proxied = "https://cors.isomorphic-git.org/" + url;
	return fetchText(proxied);
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
	const btnCalendar = document.getElementById("btn-calendar");
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
	btnCalendar.addEventListener("click", createCalendarOverlay);

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
		lines.push("");
		lines.push('Select a feed by number, abbreviation, or title.');
		lines.push('Usage: 35 TICKER (e.g., 35 AAPL) or "STOCK AAPL". Specials: CMDTY, LM.');
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
		return {mode:"search", text};
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
			if (feedsIndex?.feeds && feedsIndex.feeds[idx]) abbr = feedsIndex.feeds[idx].abbr;
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

