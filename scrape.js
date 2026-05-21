const axios = require('axios');
const fs = require('fs');
const OKruSource = require('./okru');

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

// OK.ru'dan film çek
async function fetchFromOKru() {
    console.log("\n📺 OK.RU Filmleri taranıyor...");
    const okru = new OKruSource();
    const movies = await okru.getPopularMovies(50);
    
    return movies.map(movie => ({
        title: movie.title,
        year: movie.year,
        link: movie.url,
        poster: movie.poster,
        rating: movie.rating,
        mainGenre: movie.mainGenre,
        allGenres: movie.allGenres,
        source: 'ok.ru'
    }));
}

// Vidmody'den film çek (mevcut)
async function fetchFromVidmody() {
    console.log("\n🎬 VİDMODY Filmleri taranıyor...");
    const movies = [];
    
    // VİZYONDAKİLER
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
                            allGenres: genreInfo.genres,
                            source: 'vidmody'
                        });
                        console.log(`   ✓ ${movie.title} (${genreInfo.mainGenre}) ⭐ ${movie.vote_average}`);
                    }
                }
                await new Promise(r => setTimeout(r, 30));
            }
            vizyonPage++;
        } catch(e) { break; }
    }
    
    // YILLARA GÖRE TARAMA (1980-2026)
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
                                allGenres: genreInfo.genres,
                                source: 'vidmody'
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
    
    return movies;
}

// M3U oluştur (güncellenmiş - iki kaynağı birleştirir)
function createM3U(allMovies) {
    // Aynı başlıktaki filmleri filtrele (tekrar edenleri temizle)
    const uniqueMovies = [];
    const seenTitles = new Set();
    
    for (const movie of allMovies) {
        const cleanTitle = movie.title.toLowerCase().trim();
        if (!seenTitles.has(cleanTitle)) {
            seenTitles.add(cleanTitle);
            uniqueMovies.push(movie);
        }
    }
    
    console.log(`\n📊 Tekrar eden filmler temizlendi: ${allMovies.length} -> ${uniqueMovies.length}`);
    
    let m3u = '#EXTM3U\n';
    m3u += `# Film Arşivi - ${new Date().toLocaleDateString('tr-TR')}\n`;
    m3u += `# Toplam: ${uniqueMovies.length} film\n`;
    m3u += `# Kaynaklar: Vidmody + OK.ru\n`;
    m3u += `# ⭐ IMDb puanına göre sıralanmıştır\n\n`;
    
    // Vizyondakiler (ayrı)
    const vizyon = uniqueMovies.filter(m => m.year === "Vizyonda");
    if (vizyon.length > 0) {
        vizyon.sort((a, b) => b.rating - a.rating);
        m3u += `# 🆕 VİZYONDAKİLER (${vizyon.length} adet)\n`;
        for (const m of vizyon) {
            m3u += `#EXTINF:-1 group-title="Vizyondakiler" tvg-logo="${m.poster}", ${m.title} ⭐ ${m.rating}\n`;
            m3u += `${m.link}\n`;
        }
        m3u += `\n`;
    }
    
    // OK.ru filmleri (ayrı bir grup)
    const okruMovies = uniqueMovies.filter(m => m.source === 'ok.ru' && m.year !== "Vizyonda");
    if (okruMovies.length > 0) {
        m3u += `# 📺 OK.RU FİLMLERİ (${okruMovies.length} adet)\n`;
        for (const m of okruMovies) {
            const durationInfo = m.duration ? ` [${Math.floor(m.duration/60)}dk]` : '';
            m3u += `#EXTINF:-1 group-title="OK.ru Filmleri", ${m.title}${durationInfo}\n`;
            m3u += `${m.link}\n`;
        }
        m3u += `\n`;
    }
    
    // Diğer filmleri türlerine göre grupla (Vidmody filmleri)
    const vidmodyMovies = uniqueMovies.filter(m => m.source === 'vidmody' && m.year !== "Vizyonda");
    const moviesByGenre = {};
    
    for (const movie of vidmodyMovies) {
        const genre = movie.mainGenre;
        if (!moviesByGenre[genre]) moviesByGenre[genre] = [];
        moviesByGenre[genre].push(movie);
    }
    
    // Türleri film sayısına göre sırala
    const sortedGenres = Object.keys(moviesByGenre).sort((a, b) => moviesByGenre[b].length - moviesByGenre[a].length);
    
    for (const genre of sortedGenres) {
        const genreMovies = moviesByGenre[genre];
        genreMovies.sort((a, b) => b.rating - a.rating);
        
        const icon = GENRE_ICONS[genre] || "🎬";
        
        m3u += `# ${icon} ${genre.toUpperCase()} (${genreMovies.length} adet)\n`;
        
        for (const m of genreMovies) {
            const yearInfo = m.year !== "Bilinmiyor" ? ` (${m.year})` : "";
            m3u += `#EXTINF:-1 group-title="${genre}" tvg-logo="${m.poster}", ${m.title}${yearInfo} ⭐ ${m.rating}\n`;
            m3u += `${m.link}\n`;
        }
        m3u += `\n`;
    }
    
    // "Diğer" kategorisi
    const otherMovies = uniqueMovies.filter(m => m.mainGenre === "Diğer" && m.year !== "Vizyonda" && m.source !== 'ok.ru');
    if (otherMovies.length > 0) {
        otherMovies.sort((a, b) => b.rating - a.rating);
        m3u += `# 📁 DİĞER (${otherMovies.length} adet)\n`;
        for (const m of otherMovies) {
            const yearInfo = m.year !== "Bilinmiyor" ? ` (${m.year})` : "";
            m3u += `#EXTINF:-1 group-title="Diğer" tvg-logo="${m.poster}", ${m.title}${yearInfo} ⭐ ${m.rating}\n`;
            m3u += `${m.link}\n`;
        }
    }
    
    fs.writeFileSync('filmler/films.m3u', m3u);
    return uniqueMovies.length;
}

async function scrape() {
    console.log("🎬 FİLM ARŞİVİ TARANIYOR (VİDMODY + OK.RU)...\n");
    
    let allMovies = [];
    
    // 1. Vidmody'den çek
    const vidmodyMovies = await fetchFromVidmody();
    allMovies = [...vidmodyMovies];
    console.log(`\n📊 Vidmody: ${vidmodyMovies.length} film`);
    
    // 2. OK.ru'dan çek
    const okruMovies = await fetchFromOKru();
    allMovies = [...allMovies, ...okruMovies];
    console.log(`📊 OK.ru: ${okruMovies.length} film`);
    
    // 3. M3U oluştur
    const total = createM3U(allMovies);
    
    console.log(`\n✅ TAMAMLANDI!`);
    console.log(`📊 Toplam film: ${total}`);
    console.log(`   🎬 Vidmody: ${vidmodyMovies.length}`);
    console.log(`   📺 OK.ru: ${okruMovies.length}`);
    console.log(`💾 Kaydedildi: filmler/films.m3u`);
}

scrape().catch(console.error);
