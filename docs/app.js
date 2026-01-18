// Simple CSV parser (no quotes nesting)
function parseCSV(text) {
	const lines = text.trim().split(/\r?\n/);
	const headers = lines.shift().split(",").map(h => h.trim());
	return lines.map(line => {
		// naive split; handles simple CSVs
		const parts = line.split(",").map(s => s.trim());
		const row = {};
		headers.forEach((h, i) => row[h] = parts[i] || "");
		return row;
	});
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

function renderOutputBlock(block) {
	const out = document.getElementById("output");
	out.textContent = block + "\n" + out.textContent;
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
		const xml = await fetchText(url);
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
				renderOutputBlock(`No items for ${abbr}.`);
				return;
			}
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
			renderOutputBlock(`Failed to load feed ${abbr}: ${e}`);
		}
	});

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
			tableBody.appendChild(tr);
		});
	}

	document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener("change", loadMode));
	orgSel.addEventListener("change", renderTable);
	topicSel.addEventListener("change", renderTable);
	searchBox.addEventListener("input", renderTable);

	btnRecent.addEventListener("click", async () => {
		const sel = Array.from(tableBody.children).find(tr => tr.classList.contains("selected"));
		if (!sel) { renderOutputBlock("Select a person first, then click Show Recent Work."); return; }
		const tds = sel.querySelectorAll("td");
		const name = tds[0].textContent || "";
		const org = tds[1].textContent || "";
		const email = tds[3].textContent || "";
		const block = await fetchRecentBlock(name, org, email);
		renderOutputBlock(block);
	});

	await loadMode();
	await loadFeedsIndex();
}

main().catch(err => {
	document.getElementById("output").textContent = "Failed to initialize: " + err;
});

