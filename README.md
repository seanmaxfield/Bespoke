## RTTNews RSS CLI

A simple command-line interface to browse all RSS feeds listed on the RTTNews RSS feeds page and print all articles with associated information.

- Feeds source: [RTTNews RSS Feeds](https://www.rttnews.com/rss/rssarticlelist.aspx)

### Requirements
- Python 3.8+ (no external dependencies)

### Usage
1. Open a terminal in this folder.
2. Run:
   ```bash
   python3 rttnews_rss_cli.py
   ```
3. You'll see a numbered list with abbreviations and titles. Enter a number, abbreviation, or the title (case-insensitive) to select a feed. The CLI will then print all articles found, including common fields like title, link, publication date, author, category, guid, and description, along with any additional fields present.

### Notes
- Some feeds may contain duplicated or similarly named entries as they appear on the RTTNews page; this CLI includes them as listed, each with a unique abbreviation for convenience.


