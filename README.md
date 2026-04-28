# 🎬 IPTV Movie M3U Auto-Updater

Her gece otomatik olarak TMDB'den film listesi çekip M3U playlist oluşturan GitHub Actions projesi.

## Özellikler

- **1000+ film** — Popüler, üst sıralı ve türe göre filmler
- **7 stream kaynağı** — vidsrc.to, vidsrc.me, embed.su, multiembed, videasy, 2embed, smashystream
- **Her gece güncellenir** — GitHub Actions ile 02:00 UTC'de otomatik çalışır
- **M3U + JSON çıktı** — Hem playlist hem de ham veri

## Kurulum

### 1. Repo'yu fork/klonla

```bash
git clone https://github.com/YOUR_USERNAME/iptv-movies.git
cd iptv-movies
```

### 2. TMDB API Key al

1. [themoviedb.org](https://www.themoviedb.org/) → Hesap oluştur
2. Settings → API → "Create" → API Key (v3) veya Read Access Token (v4)
3. Ücretsiz ve sınırsız

### 3. GitHub Secret ekle

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret Name | Değer |
|-------------|-------|
| `TMDB_API_KEY` | TMDB v3 API key'in |
| `TMDB_READ_TOKEN` | TMDB v4 Read Access Token (opsiyonel, v3 yeterliyse boş bırak) |

> İkisinden birini girmek yeterli. `TMDB_READ_TOKEN` varsa öncelikli kullanılır.

### 4. Actions'ı etkinleştir

Repo → **Actions** sekmesi → "I understand my workflows..." → Enable

### 5. İlk çalıştırma (opsiyonel)

Actions → **Nightly Movie M3U Update** → **Run workflow** → Run

## Playlist URL'si

Repo public ise şu URL'yi kullanabilirsin:

```
https://raw.githubusercontent.com/YOUR_USERNAME/iptv-movies/main/output/movies.m3u
```

## Lokalde Çalıştırma

```bash
pip install -r requirements.txt
export TMDB_API_KEY="your_key_here"
python scripts/scrape_movies.py
```

## Çıktı Dosyaları

| Dosya | Açıklama |
|-------|----------|
| `output/movies.m3u` | Ana M3U playlist |
| `output/movies.json` | Tüm film verisi (debug/UI için) |
| `output/README.md` | Son güncelleme stats |

## IPTV Player Uyumluluğu

| Player | Destek |
|--------|--------|
| Kodi (PVR IPTV Simple) | ✅ |
| VLC | ✅ |
| IPTV Smarters | ⚠️ (embed linkler) |
| TiviMate | ⚠️ (embed linkler) |
| Tarayıcı | ✅ |

> Embed player linkleri doğrudan `.m3u8` stream değildir. Kodi ve VLC en iyi uyumu sağlar.

## Zamanlama

Varsayılan: Her gece **02:00 UTC** (05:00 Türkiye saati)

Değiştirmek için `.github/workflows/nightly.yml` dosyasındaki `cron` satırını düzenle:

```yaml
- cron: "0 2 * * *"   # 02:00 UTC
- cron: "0 23 * * *"  # 00:00 UTC+1
- cron: "0 21 * * *"  # her gece 00:00 Türkiye (UTC+3)
```

## Yapılandırma

`scripts/scrape_movies.py` başındaki sabitler:

```python
PAGES_PER_GENRE = 3      # tür başına sayfa (×20 film)
MIN_VOTE_COUNT  = 100    # minimum oy sayısı filtresi
REQUEST_DELAY   = 0.25   # istekler arası bekleme (saniye)
```
