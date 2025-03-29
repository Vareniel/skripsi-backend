const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");
const { setTimeout } = require("node:timers/promises");


const app = express();
app.use(express.json());
app.use(cors());

app.post("/scrape", async (req, res) => {
    let { url } = req.body;
    if (!url.includes("tokopedia.com")) {
        return res.status(400).json({ error: "Invalid URL" });
    }

    url = convertToReviewURL(url);
    console.log("🔗 Menggunakan URL:", url);

    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    try {
        console.log("🔍 Membuka halaman:", url);
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
        await page.waitForSelector("article.css-15m2bcr", { timeout: 60000 });

        // 🔹 Ambil daftar rating & kategori
        const filters = await page.evaluate(() => {
            return [...document.querySelectorAll('label.checkbox')]
                .map(label => label.innerText.trim())
                .filter(text => text.match(/^[1-5]$|Kualitas Barang|Pelayanan Penjual|Kemasan Barang|Harga Barang|Sesuai Deskripsi|Pengiriman/));
        });
        console.log("📌 Filter Tersedia:", filters);

        const ratings = filters.filter(f => /^[1-5]$/.test(f));

        console.log("⭐ Ratings:", ratings);

        let allReviews = [];

        let prevRating = null;
        if (filters.length > 0) {            
            for (let rating of ratings) {
                console.log(`📌 Menerapkan filter: ${rating}`);
                await applyFilter(page, rating, prevRating);
                let reviews = await scrapeReviews(page);
                console.log(`🔢 Jumlah ulasan untuk rating ${rating}: ${reviews.length}`);
                allReviews = [...allReviews, ...reviews];
                prevRating = rating; // Simpan rating saat ini untuk dinonaktifkan nanti
            }
        } else {
            console.log("no ratings!");
            
            let reviews = await scrapeReviews(page);
            allReviews = [...allReviews, ...reviews];
        }

        console.log("✅ Total Ulasan Ditemukan:", allReviews.length);
        res.json({ reviews: allReviews });
    } catch (error) {
        console.error("❌ Error scraping:", error);
        res.status(500).json({ error: "Failed to scrape data" });
    } finally {
        await browser.close();
    }
});

async function applyFilter(page, newRating, prevRating = null) {
    await page.evaluate((newRating, prevRating) => {
        const labels = [...document.querySelectorAll('label.checkbox')];

        // Jika ada rating sebelumnya yang aktif, klik untuk menonaktifkannya
        if (prevRating) {
            const prevLabel = labels.find(label => label.innerText.trim() === prevRating);
            if (prevLabel) prevLabel.click();
        }

        // Klik rating baru untuk menerapkan filter
        const newLabel = labels.find(label => label.innerText.trim() === newRating);
        if (newLabel) newLabel.click();
    }, newRating, prevRating);

    await setTimeout(1000); // Tunggu agar perubahan diterapkan sebelum scraping
}

async function scrapeReviews(page) {
    let reviews = [];
    let hasNextPage = true;
    let pageNumber = 1;

    while (hasNextPage) {
        console.log(`📜 Mengambil ulasan halaman ${pageNumber}...`);

        // Tunggu elemen review muncul sebelum mengambil data
        await page.waitForSelector("article.css-15m2bcr", { timeout: 5000 }).catch(() => {
            console.log("⏳ Tidak ada review ditemukan di halaman ini.");
            hasNextPage = false;
        });

        let pageReviews = await page.evaluate(() => {
            return [...document.querySelectorAll("article.css-15m2bcr")].map(el => ({
                rating: el.querySelector("[data-testid='icnStarRating']")?.getAttribute("aria-label") || "Tidak ada rating",
                reviewText: el.querySelector("span[data-testid='lblItemUlasan']")?.innerText.trim() || "Tidak ada review",
            }));
        });

        reviews = [...reviews, ...pageReviews];

        // Cek apakah ada tombol "Laman berikutnya" yang aktif
        const nextButton = await page.$("button[aria-label='Laman berikutnya']:not([disabled])");
        if (nextButton) {
            await nextButton.click();
            await page.waitForTimeout(2000); // Tunggu agar halaman bisa dimuat
            pageNumber++;
        } else {
            console.log("✅ Tidak ada halaman berikutnya, selesai.");
            hasNextPage = false;
        }
    }

    return reviews;
}

function convertToReviewURL(originalURL) {
    try {
        let urlObj = new URL(originalURL);
        let pathParts = urlObj.pathname.split("/");
        if (pathParts.includes("review")) return originalURL;
        if (pathParts.length >= 3 && pathParts[2] !== "mobile-apps") {
            return `https://www.tokopedia.com${urlObj.pathname}/review`;
        }
        return originalURL;
    } catch (err) {
        console.error("❌ Gagal mengubah URL:", err);
        return originalURL;
    }
}

app.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));
