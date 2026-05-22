const OKruSource = require('./okru');
const fs = require('fs');

async function test() {
    console.log("🧪 OK.ru TEST BAŞLIYOR...\n");

    const okru = new OKruSource();

    // Sadece 10 film dene — hızlı test için
    const movies = await okru.getPopularMovies(10);

    if (movies.length === 0) {
        console.log("\n❌ SONUÇ: OK.ru çalışmıyor, film bulunamadı.");
        process.exit(1);
    }

    console.log(`\n✅ SONUÇ: ${movies.length} film bulundu!\n`);

    // Bulunan filmleri listele
    movies.forEach((m, i) => {
        const dur = m.duration ? `${Math.floor(m.duration / 60)} dk` : '? dk';
        console.log(`  ${i + 1}. ${m.title} (${m.year}) [${dur}]`);
        console.log(`     🔗 ${m.url}`);
    });

    // Küçük bir test M3U dosyası oluştur
    let m3u = '#EXTM3U\n';
    m3u += `# OK.ru Test - ${new Date().toLocaleDateString('tr-TR')}\n\n`;
    for (const m of movies) {
        m3u += `#EXTINF:-1 group-title="OK.ru Test" tvg-logo="${m.poster}", ${m.title} (${m.year})\n`;
        m3u += `${m.url}\n`;
    }

    fs.writeFileSync('test-okru.m3u', m3u);
    console.log('\n💾 test-okru.m3u oluşturuldu — VLC/Kodi ile açıp linkleri test edebilirsin.');
}

test().catch(err => {
    console.error("❌ Hata:", err.message);
    process.exit(1);
});
