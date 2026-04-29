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

// Tür ID'leri ve Türkçe isimleri
const GENRES = {
    28: "Aksiyon",
    12: "Macera",
    16: "Animasyon",
    35: "Komedi",
    80: "Suç",
    99: "Belgesel",
    18: "Dram",
    10751: "Aile",
    14: "Fantastik",
    36: "Tarih",
    27: "Korku",
    10402: "Müzik",
    9648: "Gizem",
    10749: "Romantik",
    878: "Bilim Kurgu",
    53: "Gerilim",
    10752: "Savaş",
    37: "Western"
};

// Tür ikonları
const GENRE_ICONS = {
    "Aksiyon": "💥",
    "Komedi": "😂",
    "Dram": "🎭",
    "Korku": "👻",
    "Bilim Kurgu": "🚀",
    "Romantik": "💕",
    "Macera": "🗺️",
    "Suç": "🔫",
    "Gerilim": "🔪",
    "Animasyon": "🐭",
    "Aile": "👨‍👩‍👧",
    "Fantastik": "🧙",
    "Tarih": "📜",
    "Savaş": "⚔️",
    "Gizem": "🔍",
    "Müzik": "🎵",
    "Western": "🤠",
    "Belgesel": "🎥"
};

async function getMovieGenres(tmdbId) {
    try {
        const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${API_KEY}&language=tr`;
        const response = await axios.get(url);
        const genreNames = response.data.genres.map(g => g.name);
        const mainGenre = genreNames[0] || "Diğer";
        return { genres: genreNames, mainGenre };
    } catch {
        return { genres: ["Diğer"], mainGenre: "Diğer" };
    }
}

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
    console.log("🎬 FİLM ARŞİVİ TARANIYOR (TÜRLERE GÖRE)...\n");
    const movies = [];
    
    // 1. VİZYONDAKİLER
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
                        const genreInfo = await getMovieGenres(movie.id);
                        movies.push({
                            title: movie.title,
                            year: "Vizyonda",
                            link: link,
                            poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "",
                            rating: movie.vote_average || 0,
                            mainGenre: genreInfo.mainGenre,
                            allGenres: genreInfo.genres
                        });
                        console.log(`   ✓ ${movie.title} (${genreInfo.mainGenre}) ⭐ ${movie.vote_average}`);
                    }
                }
                await new Promise(r => setTimeout(r, 30));
            }
            vizyonPage++;
        } catch(e) { break; }
    }
    
    // 2. YILLARA GÖRE TARAMA (1980-2026)
    console.log("\n📅 Filmler taranıyor...");
    
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
                            const genreInfo = await getMovieGenres(movie.id);
                            movies.push({
                                title: movie.title,
                                year: year,
                                link: link,
                                poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "",
                                rating: movie.vote_average || 0,
                                mainGenre: genreInfo.mainGenre,
                                allGenres: genreInfo.genres
                            });
                            yearCount++;
                            console.log(`   ✓ ${movie.title} (${year} - ${genreInfo.mainGenre}) ⭐ ${movie.vote_average || "?"}`);
                        }
                    }
                    await new Promise(r => setTimeout(r, 25));
                }
            } catch(e) { break; }
        }
        console.log(`   ${year} için ${yearCount} film eklendi`);
    }
    
    console.log(`\n📊 Toplam taranan film: ${movies.length}`);
    
    // ========== M3U OLUŞTUR (TÜRLERE GÖRE) ==========
    let m3u = '#EXTM3U\n';
    m3u += `# Film Arşivi - ${new Date().toLocaleDateString('tr-TR')}\n`;
    m3u += `# Toplam: ${movies.length} film\n`;
    m3u += `# ⭐ IMDb puanına göre sıralanmıştır\n\n`;
    
    // Vizyondakiler (ayrı)
    const vizyon = movies.filter(m => m.year === "Vizyonda");
    if (vizyon.length > 0) {
        vizyon.sort((a, b) => b.rating - a.rating);
        m3u += `# 🆕 VİZYONDAKİLER (${vizyon.length} adet)\n`;
        for (const m of vizyon) {
            m3u += `#EXTINF:-1 group-title="Vizyondakiler" tvg-logo="${m.poster}", ${m.title} ⭐ ${m.rating}\n`;
            m3u += `${m.link}\n`;
        }
        m3u += `\n`;
    }
    
    // Diğer filmleri türlerine göre grupla
    const nonVizyon = movies.filter(m => m.year !== "Vizyonda");
    const moviesByGenre = {};
    
    for (const movie of nonVizyon) {
        const genre = movie.mainGenre;
        if (!moviesByGenre[genre]) moviesByGenre[genre] = [];
        moviesByGenre[genre].push(movie);
    }
    
    // Türleri film sayısına göre sırala
    const sortedGenres = Object.keys(moviesByGenre).sort((a, b) => moviesByGenre[b].length - moviesByGenre[a].length);
    
    for (const genre of sortedGenres) {
        const genreMovies = moviesByGenre[genre];
        // Tür içinde puana göre sırala
        genreMovies.sort((a, b) => b.rating - a.rating);
        
        // İkon ekle
        const icon = GENRE_ICONS[genre] || "🎬";
        
        m3u += `# ${icon} ${genre.toUpperCase()} (${genreMovies.length} adet)\n`;
        
        for (const m of genreMovies) {
            const yearInfo = m.year !== "Bilinmiyor" ? ` (${m.year})` : "";
            m3u += `#EXTINF:-1 group-title="${genre}" tvg-logo="${m.poster}", ${m.title}${yearInfo} ⭐ ${m.rating}\n`;
            m3u += `${m.link}\n`;
        }
        m3u += `\n`;
    }
    
    // "Diğer" kategorisi (türü belirsiz filmler için)
    const otherMovies = movies.filter(m => m.mainGenre === "Diğer" && m.year !== "Vizyonda");
    if (otherMovies.length > 0) {
        otherMovies.sort((a, b) => b.rating - a.rating);
        m3u += `# 📁 DİĞER (${otherMovies.length} adet)\n`;
        for (const m of otherMovies) {
            const yearInfo = m.year !== "Bilinmiyor" ? ` (${m.year})` : "";
            m3u += `#EXTINF:-1 group-title="Diğer" tvg-logo="${m.poster}", ${m.title}${yearInfo} ⭐ ${m.rating}\n`;
            m3u += `${m.link}\n`;
        }
        m3u += `\n`;
    }
    
    fs.writeFileSync('filmler/films.m3u', m3u);
    
    console.log(`\n✅ TAMAMLANDI!`);
    console.log(`📊 Toplam film: ${movies.length}`);
    console.log(`🎭 Türler: ${sortedGenres.length} farklı kategori`);
    console.log(`💾 Kaydedildi: filmler/films.m3u`);
}

scrape().catch(console.error);
