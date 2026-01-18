#!/usr/bin/env python3
import re
import sys
import csv
from pathlib import Path

MD_DEFAULT = "dc_think_tank_researchers copy.md"
CSV_DEFAULT = "dc_researchers.csv"


def is_heading(line: str, level: int) -> bool:
	prefix = "#" * level + " "
	return line.startswith(prefix)


def normalize_whitespace(text: str) -> str:
	return " ".join(text.split())


def extract_email(text: str) -> str:
	# Simple email pattern
	m = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text)
	return m.group(0) if m else ""


def parse_markdown(md_text: str):
	think_tank = ""
	topic = ""
	records = []
	for raw in md_text.splitlines():
		line = raw.rstrip()
		if not line:
			continue
		# Headings
		if is_heading(line, 2):  # ## THINK TANK
			think_tank = normalize_whitespace(line[3:])
			topic = ""  # reset topic when changing institution
			continue
		if is_heading(line, 3):  # ### TOPIC
			topic = normalize_whitespace(line[4:])
			continue
		# Bulleted person lines
		strip = line.lstrip()
		if not strip.startswith("- "):
			continue
		item = strip[2:].strip()
		# Skip obvious non-person bullets
		lower = item.lower()
		if any(k in lower for k in [
			"note:", "complete", "comprehensive", "leadership &", "leadership and",
			"board of directors", "research conducted", "usage applications",
			"recommendations for maintenance", "positions", "programs", "leadership"
		]):
			continue
		# Heuristic: split on first ' - ' to get name
		name = item
		if " - " in item:
			name = item.split(" - ", 1)[0].strip()
		# Remove stray bullets like 'Multiple ...'
		if any(name.lower().startswith(prefix) for prefix in ["multiple", "positions", "###", "##"]):
			continue
		# Basic sanity: require at least one space and an alphabetic char
		if " " not in name or not re.search(r"[A-Za-z]", name):
			continue
		email = extract_email(item)
		records.append({
			"name": name,
			"think_tank": think_tank,
			"topic": topic,
			"email": email,
		})
	return records


def main():
	in_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(MD_DEFAULT)
	out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(CSV_DEFAULT)
	if not in_path.exists():
		print(f"Input file not found: {in_path}")
		return 1
	text = in_path.read_text(encoding="utf-8", errors="ignore")
	rows = parse_markdown(text)
	# Write CSV
	with out_path.open("w", newline="", encoding="utf-8") as f:
		w = csv.DictWriter(f, fieldnames=["name", "think_tank", "topic", "email"])
		w.writeheader()
		for r in rows:
			w.writerow(r)
	print(f"Wrote {len(rows)} records to {out_path}")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())

