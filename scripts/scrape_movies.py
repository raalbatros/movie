#!/usr/bin/env python3
"""
IPTV Movie M3U Scraper
Collects movies from multiple sources and generates M3U playlist.
Runs nightly via GitHub Actions.
"""

import os
import json
import time
import logging
import requests
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

TMDB_API_KEY   = os.getenv("TMDB_API_KEY", "")
TMDB_READ_TOKEN= os.getenv("TMDB_READ_TOKEN", "")
OUTPUT_DIR     = Path("output")
OUTPUT_M3U     = OUTPUT_DIR / "movies.m3u"
OUTPUT_JSON    = OUTPUT_DIR / "movies.json"
OUTPUT_README  = OUTPUT_DIR / "README.md"

GENRES = {
    28:    "Action",
    35:    "Comedy",
    18:    "Drama",
    27:    "Horror",
    878:   "Sci-Fi",
    12:    "Adventure",
    16:    "Animation",
    10749: "Romance",
    53:    "Thriller",
    80:    "Crime",
    14:    "Fantasy",
    10752: "War",
}

# Pages to fetch per genre (20 movies per page)
PAGES_PER_GENRE = 3
# Minimum TMDB vote count to include a movie
MIN_VOTE_COUNT  = 100
# Request delay (seconds) to respect rate limits
REQUEST_DELAY   = 0.25

# Free embed stream sources — ordered by reliability
STREAM_SOURCES = [
    {"name": "vidsrc.to",    "url": "https://vidsrc.to/embed/movie/{tmdb_id}"},
    {"name": "vidsrc.me",    "url": "https://vidsrc.me/embed/movie?tmdb={tmdb_id}"},
    {"name": "embed.su",     "url": "https://embed.su/embed/movie/{imdb_id}"},
    {"name": "multiembed",   "url": "https://multiembed.mov/?tmdb=1&video_id={tmdb_id}"},
    {"name": "videasy",      "url": "https://player.videasy.net/movie/{imdb_id}"},
    {"name": "superembed",   "url": "https://www.2embed.cc/embed/{imdb_id}"},
    {"name": "smashystream", "url": "https://player.smashy.stream/movie/{imdb_id}"},
]

TMDB_HEADERS = {}
if TMDB_READ_TOKEN:
    TMDB_HEADERS["Authorization"] = f"Bearer {TMDB_READ_TOKEN}"

# ─── TMDB helpers ─────────────────────────────────────────────────────────────

def tmdb_get(path: str, params: dict = None) -> dict | None:
    base = "https://api.themoviedb.org/3"
    if TMDB_API_KEY and not TMDB_READ_TOKEN:
        params = params or {}
        params["api_key"] = TMDB_API_KEY
    try:
        r = requests.get(f"{base}{path}", headers=TMDB_HEADERS, params=params, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.warning(f"TMDB request failed ({path}): {e}")
        return None


def get_movies_by_genre(genre_id: int, pages: int = PAGES_PER_GENRE) -> list[dict]:
    movies = []
    for page in range(1, pages + 1):
        data = tmdb_get("/discover/movie", {
            "with_genres":       genre_id,
            "language":          "en-US",
            "sort_by":           "popularity.desc",
            "vote_count.gte":    MIN_VOTE_COUNT,
            "page":              page,
        })
        if not data:
            break
        movies.extend(data.get("results", []))
        time.sleep(REQUEST_DELAY)
    return movies


def get_popular_movies(pages: int = 5) -> list[dict]:
    movies = []
    for page in range(1, pages + 1):
        data = tmdb_get("/movie/popular", {"language": "en-US", "page": page})
        if not data:
            break
        movies.extend(data.get("results", []))
        time.sleep(REQUEST_DELAY)
    return movies


def get_top_rated_movies(pages: int = 3) -> list[dict]:
    movies = []
    for page in range(1, pages + 1):
        data = tmdb_get("/movie/top_rated", {"language": "en-US", "page": page})
        if not data:
            break
        movies.extend(data.get("results", []))
        time.sleep(REQUEST_DELAY)
    return movies


def get_imdb_id(tmdb_id: int) -> str | None:
    data = tmdb_get(f"/movie/{tmdb_id}/external_ids")
    time.sleep(REQUEST_DELAY)
    return data.get("imdb_id") if data else None


def get_genre_names(genre_ids: list[int]) -> list[str]:
    return [GENRES.get(gid, "") for gid in genre_ids if gid in GENRES]


# ─── Link builder ─────────────────────────────────────────────────────────────

def build_stream_links(tmdb_id: int, imdb_id: str | None) -> list[dict]:
    links = []
    for src in STREAM_SOURCES:
        url_tmpl = src["url"]
        if "{imdb_id}" in url_tmpl and not imdb_id:
            continue
        url = url_tmpl.format(tmdb_id=tmdb_id, imdb_id=imdb_id or "")
        links.append({"source": src["name"], "url": url})
    return links


# ─── M3U builder ──────────────────────────────────────────────────────────────

def build_m3u(movies: list[dict]) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "#EXTM3U",
        f'#PLAYLIST:IPTV Movies — {now}',
        f"# Generated: {now}",
        f"# Total movies: {len(movies)}",
        f"# Sources: {', '.join(s['name'] for s in STREAM_SOURCES)}",
        "",
    ]

    for m in movies:
        title       = m["title"]
        year        = (m.get("release_date") or "")[:4]
        rating      = round(m.get("vote_average", 0), 1)
        tmdb_id     = m["id"]
        imdb_id     = m.get("imdb_id", "")
        poster      = f"https://image.tmdb.org/t/p/w300{m['poster_path']}" if m.get("poster_path") else ""
        genres_str  = "/".join(get_genre_names(m.get("genre_ids", [])))
        group       = genres_str.split("/")[0] if genres_str else "Movies"
        links       = m.get("stream_links", [])
        best_url    = links[0]["url"] if links else f"https://vidsrc.to/embed/movie/{tmdb_id}"

        extinf = (
            f'#EXTINF:-1 '
            f'tvg-id="{tmdb_id}" '
            f'tvg-name="{title}" '
            f'tvg-logo="{poster}" '
            f'group-title="{group}" '
            f'tmdb-id="{tmdb_id}" '
            f'imdb-id="{imdb_id}" '
            f'rating="{rating}" '
            f'year="{year}",'
            f'{title} ({year}) [{rating}⭐]'
        )
        lines.append(extinf)
        lines.append(best_url)
        lines.append("")

    return "\n".join(lines)


# ─── README builder ───────────────────────────────────────────────────────────

def build_readme(movies: list[dict], generated_at: str) -> str:
    genre_counts: dict[str, int] = {}
    for m in movies:
        for gid in m.get("genre_ids", []):
            name = GENRES.get(gid)
            if name:
                genre_counts[name] = genre_counts.get(name, 0) + 1

    genre_table = "\n".join(
        f"| {g} | {c} |"
        for g, c in sorted(genre_counts.items(), key=lambda x: -x[1])
    )

    return f"""# 🎬 IPTV Movies Playlist

Auto-generated nightly by GitHub Actions using TMDB data.

## Stats
| Metric | Value |
|--------|-------|
| **Total movies** | {len(movies)} |
| **Last updated** | {generated_at} |
| **Sources** | {len(STREAM_SOURCES)} embed providers |

## Playlist URL
```
https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/output/movies.m3u
```
> Replace `YOUR_USERNAME/YOUR_REPO` with your actual GitHub repo path.

## Genre Breakdown
| Genre | Count |
|-------|-------|
{genre_table}

## Stream Sources
| Source | Base URL |
|--------|----------|
{chr(10).join(f"| `{s['name']}` | `{s['url'].split('{')[0]}...` |" for s in STREAM_SOURCES)}

## Usage
Use the raw URL above in any IPTV player:
- **TiviMate** → Add Playlist → M3U URL
- **IPTV Smarters** → Add User → M3U URL  
- **VLC** → Media → Open Network Stream
- **Kodi** (PVR IPTV Simple) → M3U Playlist URL

## Notes
- Links are embed players, not direct `.m3u8` streams
- Best results with Kodi, VLC, or browser-based players
- Playlist refreshes every night at **02:00 UTC**
- Movies sourced from TMDB popularity + genre lists
"""


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    if not TMDB_API_KEY and not TMDB_READ_TOKEN:
        log.error("No TMDB credentials found. Set TMDB_API_KEY or TMDB_READ_TOKEN.")
        raise SystemExit(1)

    OUTPUT_DIR.mkdir(exist_ok=True)
    log.info("Starting IPTV Movie scraper...")

    # 1) Collect movies from all sources
    all_movies: dict[int, dict] = {}

    log.info("Fetching popular movies...")
    for m in get_popular_movies(pages=5):
        all_movies[m["id"]] = m

    log.info("Fetching top-rated movies...")
    for m in get_top_rated_movies(pages=3):
        all_movies.setdefault(m["id"], m)

    log.info("Fetching by genre...")
    for genre_id, genre_name in GENRES.items():
        log.info(f"  Genre: {genre_name}")
        for m in get_movies_by_genre(genre_id, pages=PAGES_PER_GENRE):
            all_movies.setdefault(m["id"], m)

    log.info(f"Total unique movies collected: {len(all_movies)}")

    # 2) Filter & enrich with IMDB IDs + stream links
    enriched: list[dict] = []
    total = len(all_movies)

    for i, (tmdb_id, movie) in enumerate(all_movies.items(), 1):
        title = movie.get("title", "Unknown")
        if not movie.get("poster_path"):
            continue  # skip movies without posters (usually bad data)

        log.info(f"[{i}/{total}] {title}")
        imdb_id = get_imdb_id(tmdb_id)
        movie["imdb_id"] = imdb_id or ""
        movie["stream_links"] = build_stream_links(tmdb_id, imdb_id)
        enriched.append(movie)

    # Sort by popularity
    enriched.sort(key=lambda m: m.get("popularity", 0), reverse=True)

    log.info(f"Enriched {len(enriched)} movies with stream links")

    # 3) Write M3U
    m3u_content = build_m3u(enriched)
    OUTPUT_M3U.write_text(m3u_content, encoding="utf-8")
    log.info(f"Wrote M3U → {OUTPUT_M3U} ({len(m3u_content):,} bytes)")

    # 4) Write JSON (for debugging / future web UI)
    json_data = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total": len(enriched),
        "movies": [
            {
                "id":           m["id"],
                "title":        m["title"],
                "year":         (m.get("release_date") or "")[:4],
                "rating":       round(m.get("vote_average", 0), 1),
                "votes":        m.get("vote_count", 0),
                "popularity":   round(m.get("popularity", 0), 2),
                "imdb_id":      m.get("imdb_id", ""),
                "poster":       f"https://image.tmdb.org/t/p/w300{m['poster_path']}" if m.get("poster_path") else "",
                "genres":       get_genre_names(m.get("genre_ids", [])),
                "overview":     m.get("overview", ""),
                "stream_links": m.get("stream_links", []),
            }
            for m in enriched
        ]
    }
    OUTPUT_JSON.write_text(json.dumps(json_data, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(f"Wrote JSON → {OUTPUT_JSON}")

    # 5) Write README
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    OUTPUT_README.write_text(build_readme(enriched, generated_at), encoding="utf-8")
    log.info(f"Wrote README → {OUTPUT_README}")

    log.info("Done! ✅")


if __name__ == "__main__":
    main()
