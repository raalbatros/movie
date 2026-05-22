const puppeteer = require('puppeteer');

/**
 * OK.ru Film Kaynağı - Puppeteer versiyonu
 * JavaScript render edilen sayfaları okuyabilir
 */

class OKruSource {
    constructor() {
        this.baseUrl = 'https://ok.ru';
        this.processedIds = new Set();
    }

    async getBrowser() {
        return await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
            ]
        });
    }

    // Arama sayfasından video ID'lerini çek
    async searchVideoIds(page, keyword, maxResults = 20) {
        const ids = [];
        try {
            const url = `${this.baseUrl}/video/search?q=${encodeURIComponent(keyword)}`;
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Sayfanın yüklenmesini bekle
            await new Promise(r => setTimeout(r, 2000));

            // HTML içinden video ID'lerini çek
            const html = await page.content();
            console.log(`     HTML boyutu: ${Math.round(html.length / 1024)}KB`);

            const patterns = [
                /\/video\/(\d{8,})/g,
                /"videoId"\s*:\s*"(\d{8,})"/g,
                /data-mid="(\d{8,})"/g,
                /"mid"\s*:\s*"(\d{8,})"/g,
            ];

            for (const pattern of patterns) {
                let match;
                pattern.lastIndex = 0;
                while ((match = pattern.exec(html)) !== null) {
                    const id = match[1];
                    if (!this.processedIds.has(id) && !ids.includes(id)) {
                        ids.push(id);
                        if (ids.length >= maxResults) break;
                    }
                }
                if (ids.length >= maxResults) break;
            }

            console.log(`     Bulunan ID: ${ids.length}`);
        } catch (error) {
            console.error(`  ⚠️  Arama hatası (${keyword}): ${error.message}`);
        }
        return ids;
    }

    // videoPlayerMetadata API ile video bilgilerini al
    async getVideoMeta(videoId) {
        if (this.processedIds.has(videoId)) return null;
        try {
            const url = `${this.baseUrl}/dk?cmd=videoPlayerMetadata&mid=${videoId}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const data = await response.json();
            if (!data || !data.movie) return null;

            const movie = data.movie;
            const title = movie.title;
            if (!title || title.length < 2) return null;

            const duration = parseInt(movie.duration || '0');
            if (duration > 0 && duration < 3600) return null; // 60 dk altı film değil

            this.processedIds.add(videoId);

            let year = new Date().getFullYear();
            const yearMatch = title.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
            if (yearMatch) year = parseInt(yearMatch[1]);

            return {
                title: title.replace(/\\"/g, '"').replace(/&quot;/g, '"').trim(),
                url: `https://ok.ru/videoembed/${videoId}`,
                duration,
                poster: movie.poster || '',
                year,
                rating: 0,
                mainGenre: 'Diğer',
                allGenres: ['Diğer'],
                source: 'ok.ru'
            };
        } catch {
            return null;
        }
    }

    async getPopularMovies(limit = 100) {
        console.log('📺 OK.ru taranıyor (Puppeteer)...');

        const keywords = [
            'türkçe dublaj film 2024',
            'türkçe dublaj film 2025',
            'full hd film türkçe',
            'aksiyon filmi türkçe dublaj',
            'komedi filmi türkçe',
            'dram filmi türkçe',
            'korku filmi türkçe dublaj',
            'bilim kurgu filmi türkçe',
            'animasyon filmi türkçe',
            'gerilim filmi türkçe'
        ];

        const movies = [];
        const browser = await this.getBrowser();

        try {
            const page = await browser.newPage();

            // Bot tespitini zorlaştır
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'tr-TR,tr;q=0.9' });

            for (const keyword of keywords) {
                if (movies.length >= limit) break;
                console.log(`  🔍 "${keyword}" aranıyor...`);

                const ids = await this.searchVideoIds(page, keyword, 25);

                for (const id of ids) {
                    if (movies.length >= limit) break;
                    const meta = await this.getVideoMeta(id);
                    if (meta) {
                        movies.push(meta);
                        const dur = meta.duration ? `${Math.floor(meta.duration / 60)} dk` : '? dk';
                        console.log(`     ✓ ${meta.title} (${meta.year}, ${dur})`);
                    }
                    await new Promise(r => setTimeout(r, 500));
                }

                await new Promise(r => setTimeout(r, 1000));
            }

            await page.close();
        } finally {
            await browser.close();
        }

        // Tekrar eden başlıkları temizle
        const seen = new Set();
        const unique = movies.filter(m => {
            const key = m.title.toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        console.log(`📊 OK.ru: ${unique.length} benzersiz film bulundu`);
        return unique;
    }
}

module.exports = OKruSource;
