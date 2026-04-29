const axios = require('axios');
const fs = require('fs');

const API_KEY = process.env.TMDB_API_KEY;

if (!API_KEY) {
    console.error("❌ TMDB API anahtarı bulunamadı!");
    process.exit(1);
}

if (!fs.existsSync('filmler')) {
    fs.mkdirSync('filmler');
}

const VIDMODY_URL = "https://vidmody.com/vs";
const processedMovies = new Set();
const failedLinks = new Set();

async function getImdbId(tmdbId) {
    if (processedMovies.has(tmdbId)) return null;
    try {
        const url = `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${API_KEY}`;
        const response = await axios.get(url);
        const imdbId = response.data.imdb_id;
        if (imdbId) {
            processedMovies.add(tmdbId);
            return imdbId;
        }
        return null;
    } catch {
        return null;
    }
}

async function checkLink(url) {
    if (failedLinks.has(url)) return false;
    try {
        await axios.head(url, { timeout: 5000 });
        return true;
    } catch {
        failedLinks.add(url);
        return false;
    }
}

async function scrape() {
    console.log("🎬 FİLM ARŞİVİ TARANIYOR...\n");
    const movies = [];
    
    // 1. VİZYONDAKİLER (Tüm sayfalar)
    console.log("🆕 Vizyondaki filmler taranıyor...");
    let vizyonPage = 1;
    while (vizyonPage <= 5) {
        try {
            const url = `https://api.themoviedb.org/3/movie/now_playing?api_key=${API_KEY}&language=tr&page=${vizyonPage}`;
            const response = await axios.get(url);
            if (response.data.results.length === 0) break;
            for (const movie of response.data.results) {
                const imdbId = await getImdbId(movie.id);
                if (imdbId) {
                    const link = `${VIDMODY_URL}/${imdbId}`;
                    if (await checkLink(link)) {
                        movies.push({
                            title: movie.title,
                            year: "Vizyonda",
                            link: link,
                            poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "",
                            rating: movie.vote_average || 0,
                            isTurkish: false
                        });
                        console.log(`   ✓ ${movie.title} ⭐ ${movie.vote_average}`);
                    }
                }
                await new Promise(r => setTimeout(r, 30));
            }
            vizyonPage++;
        } catch(e) { break; }
    }
    
    // 2. YILLARA GÖRE TARAMA (1980-2026, her yıl 10 sayfa)
    console.log("\n📅 Yıllara göre filmler taranıyor...");
    let totalMovies = 0;
    
    for (let year = 2026; year >= 1980; year--) {
        console.log(`📅 ${year} taranıyor...`);
        let yearCount = 0;
        
        for (let page = 1; page <= 10; page++) {
            const url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=tr&sort_by=popularity.desc&primary_release_year=${year}&page=${page}`;
            try {
                const response = await axios.get(url);
                if (response.data.results.length === 0) break;
                for (const movie of response.data.results) {
                    const imdbId = await getImdbId(movie.id);
                    if (imdbId) {
                        const link = `${VIDMODY_URL}/${imdbId}`;
                        if (await checkLink(link)) {
                            movies.push({
                                title: movie.title,
                                year: year,
                                link: link,
                                poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "",
                                rating: movie.vote_average || 0,
                                isTurkish: movie.original_language === "tr"
                            });
                            yearCount++;
                            console.log(`   ✓ ${movie.title} ⭐ ${movie.vote_average || "?"}`);
                        }
                    }
                    await new Promise(r => setTimeout(r, 25));
                }
            } catch(e) { break; }
        }
        console.log(`   ${year} için ${yearCount} film eklendi`);
        totalMovies += yearCount;
    }
    
    console.log(`\n📊 Toplam taranan film: ${movies.length}`);
    
    // M3U OLUŞTUR
    const vizyon = movies.filter(m => m.year === "Vizyonda");
    const turkish = movies.filter(m => m.isTurkish && m.year !== "Vizyonda");
    const others = movies.filter(m => m.year !== "Vizyonda" && !m.isTurkish);
    
    let m3u = '#EXTM3U\n';
    m3u += `# Film Arşivi - ${new Date().toLocaleDateString('tr-TR')}\n`;
    m3u += `# Toplam: ${movies.length} film\n\n`;
    
    if (vizyon.length > 0) {
        vizyon.sort((a, b) => b.rating - a.rating);
        m3u += `# 🆕 VİZYONDAKİLER (${vizyon.length} adet)\n`;
        for (const m of vizyon) {
            m3u += `#EXTINF:-1 group-title="Vizyondakiler" tvg-logo="${m.poster}", ${m.title} ⭐ ${m.rating}\n${m.link}\n`;
        }
        m3u += `\n`;
    }
    
    if (turkish.length > 0) {
        turkish.sort((a, b) => b.rating - a.rating);
        m3u += `# 🇹🇷 YERLİ FİLMLER (${turkish.length} adet)\n`;
        for (const m of turkish) {
            m3u += `#EXTINF:-1 group-title="Yerli Filmler" tvg-logo="${m.poster}", ${m.title} (${m.year}) ⭐ ${m.rating}\n${m.link}\n`;
        }
        m3u += `\n`;
    }
    
    const yearGroups = {};
    for (const m of others) {
        if (!yearGroups[m.year]) yearGroups[m.year] = [];
        yearGroups[m.year].push(m);
    }
    
    for (const year of Object.keys(yearGroups).sort().reverse()) {
        yearGroups[year].sort((a, b) => b.rating - a.rating);
        m3u += `# 🎬 ${year} (${yearGroups[year].length} adet)\n`;
        for (const m of yearGroups[year]) {
            m3u += `#EXTINF:-1 group-title="${year}" tvg-logo="${m.poster}", ${m.title} ⭐ ${m.rating}\n${m.link}\n`;
        }
        m3u += `\n`;
    }
    
    fs.writeFileSync('filmler/films.m3u', m3u);
    console.log(`\n✅ TAMAMLANDI! ${movies.length} film kaydedildi.`);
}

scrape().catch(console.error);
