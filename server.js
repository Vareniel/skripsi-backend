const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");
const { setTimeout } = require("node:timers/promises");
const axios = require('axios'); // For making HTTP requests

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*", // Ubah ini menjadi domain yang sesuai untuk keamanan
        methods: ["GET", "POST"]
    }
});

app.use(express.json());
app.use(cors());

const VADER_API_URL = 'http://127.0.0.1:5000/sentiment';

io.on("connection", (socket) => {
    console.log("🔗 User connected");
    socket.on("disconnect", () => {
        console.log("❌ User disconnected");
    });
});

app.post("/scrape", async (req, res) => {
    let { url } = req.body;
    if (!url.includes("tokopedia.com")) {
        return res.status(400).json({ error: "Invalid URL" });
    }

    url = convertToReviewURL(url);
    console.log("🔗 Menggunakan URL:", url);

    const browser = await puppeteer.launch({ headless: false, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    try {
        console.log("🔍 Membuka halaman:", url);
        io.emit('status', { message: '🔍 Unveiling the page... The journey begins...', step: 'opening', progress: 10 });
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

        // Coba klik tombol jika ada
        const buttonExists = await page.$("div.css-11hzwo5 button");
        if (buttonExists) {
            await page.click("div.css-11hzwo5 button");
            console.log("✅ Tombol berhasil diklik.");
            io.emit('status', { message: '✅ Button found and clicked! The gates are opening...', step: 'clicking_button', progress: 15 });
        } else {
            console.log("⚠️ Tidak menemukan tombol, langsung scroll ke bawah.");
            io.emit('status', { message: '⚠️ Button not found. No worries, we scroll down into the abyss...', step: 'scrolling', progress: 20 });
        }

        await page.evaluate(async () => {
            await new Promise(resolve => {
                let totalHeight = 0;
                let distance = 100;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        console.log("🔽 Scrolling selesai, mencoba deteksi review...");
        io.emit('status', { message: '🔽 The scroll is complete, venturing into review detection...', step: 'detecting_reviews', progress: 30 });

        await page.waitForSelector("article.css-15m2bcr", { timeout: 60000 });

        // 🔹 Cek status disabled dari checkbox rating
        const ratingsStatus = await page.evaluate(() => {
            return [...document.querySelectorAll("label.checkbox")].map(label => ({
                text: label.innerText.trim(),
                disabled: label.querySelector("input")?.disabled || false
            }));
        });

        console.log("📌 Status Checkbox Ratings:", ratingsStatus);
        io.emit('status', { message: '📌 Checkbox Ratings Status: ' + JSON.stringify(ratingsStatus), step: 'checking_ratings', progress: 35 });

        // 🔹 Ambil hanya rating yang tidak disabled
        let activeRatings = ratingsStatus.filter(r => /^[1-5]$/.test(r.text) && !r.disabled).map(r => r.text);
        console.log("⭐ Ratings Aktif:", activeRatings);
        io.emit('status', { message: '⭐ Active Ratings: ' + activeRatings.join(', '), step: 'filtering_ratings', progress: 40 });

        let allReviews = [];

        if (activeRatings.length < 2) {
            allReviews = await scrapeReviews(page);
            // io.emit('status', { message: message, step: 'scraping_reviews', progress: 50 });
        } else {
            let prevRating = null;
            for (let rating of activeRatings) {
                let filterMessage = '';
                switch (rating) {
                    case "5":
                        filterMessage = '🌟 Unleashing the power of the highest ratings... The elite reviews await! Can you count the stars? Five shines the brightest!';
                        break;
                    case "4":
                        filterMessage = '💎 A noble rating emerges... A few more steps to uncover greatness. Four is the number of stability and strength.';
                        break;
                    case "3":
                        filterMessage = '⚖️ A balanced judgment, neither too high nor too low... Reviewing in the middle ground. Three stands between the highs and the lows.';
                        break;
                    case "2":
                        filterMessage = '🔻 Descending into the shadows... Seeking the lower-rated reviews. Two paths lie ahead, but only one will lead to the truth.';
                        break;
                    case "1":
                        filterMessage = '💀 The lowest of ratings... A perilous journey through the abyss of dissatisfaction. One is the loneliest number in this world.';
                        break;
                    default:
                        filterMessage = '🛠️ Preparing to apply filter... A mystery filter yet to be revealed.';
                        break;
                }                

                console.log(`📌 Menerapkan filter: ${rating}`);
                io.emit('status', { message: `📌 ${filterMessage}`, step: 'applying_filter', progress: 45 });
                
                await applyFilter(page, rating, prevRating);
                
                let reviews = await scrapeReviews(page, (message) => {
                    io.emit('status', { message: '🧐 Scraping reviews... The hunt is on!', step: 'scraping_reviews', progress: 50 });
                });

                console.log(`🔢 Jumlah ulasan untuk rating ${rating}: ${reviews.length}`);
                io.emit('status', { message: `🔢 Number of reviews for rating ${rating}: ${reviews.length}. The count is growing...`, step: 'scraping_reviews', progress: 60 });
                
                allReviews = [...allReviews, ...reviews];
                prevRating = rating;
            }

        }

        console.log("✅ Total Ulasan Ditemukan:", allReviews.length);
        io.emit('status', { message: `✅ Total Reviews Found: ${allReviews.length}. Victory is near...`, step: 'reviews_found', progress: 70 });

        // 🔹 Analisis Sentimen dengan Delay
        const reviewsWithSentiment = [];
        for (let index = 0; index < allReviews.length; index++) {
            const review = allReviews[index];
            io.emit('status', { message: `⚔️ Analyzing sentiment for review #${index + 1} of #${allReviews.length}... The true feelings emerge.`, step: 'analyzing_sentiment', progress: 70 + (index / allReviews.length) * 20 });

            await setTimeout(1);

            if (review.reviewText !== "Tidak ada review") {
                const sentimentResult = await analyzeSentimentWithVADER(review.reviewText);

                reviewsWithSentiment.push({
                    ...review,
                    sentiment: sentimentResult.sentiment,
                });
            } else {
                reviewsWithSentiment.push({
                    ...review,
                    sentiment: "Netral",
                });
            }
        }
        io.emit('status', { message: '✅ Sentiment analysis complete... The souls are read.', step: 'sentiment_analysis_complete', progress: 90 });
        res.json({ reviews: reviewsWithSentiment });
        io.emit('status', { message: '✅ Data sent to client... The quest is complete.', step: 'data_sent', progress: 100 });
    } catch (error) {
        console.error("❌ Error scraping:", error);
        io.emit('status', { message: `❌ Error scraping: ${error.message}. A dark force has intervened...`, step: 'error', progress: 0 });
        res.status(500).json({ error: "Failed to scrape data" });
    } finally {
        await browser.close();
        io.emit('status', { message: '✅ Browser closed. The path has been sealed.', step: 'browser_closed', progress: 100 });
    }
});

async function analyzeSentimentWithVADER(reviewText) {
    try {
        const response = await axios.post(VADER_API_URL, { reviewText });
        return response.data;
    } catch (error) {
        console.log("❌ Error saat analisis sentimen.");
        return { sentiment: null };
    }
}

async function applyFilter(page, newRating, prevRating = null) {
    await page.evaluate((newRating, prevRating) => {
        const labels = [...document.querySelectorAll('label.checkbox')];

        if (prevRating) {
            const prevLabel = labels.find(label => label.innerText.trim() === prevRating);
            if (prevLabel) prevLabel.click();
        }

        const newLabel = labels.find(label => label.innerText.trim() === newRating);
        if (newLabel) newLabel.click();
    }, newRating, prevRating);

    await setTimeout(500);
}

async function scrapeReviews(page) {
    let reviews = [];
    let hasNextPage = true;
    let pageNumber = 1;

    while (hasNextPage) {
        console.log(`📜 Mengambil ulasan halaman ${pageNumber}...`);

        await page.waitForSelector("article.css-15m2bcr", { timeout: 5000 }).catch(() => {
            console.log("⏳ Tidak ada review ditemukan di halaman ini.");
            hasNextPage = false;
        });

        let pageReviews = await page.evaluate(() => {
            return [...document.querySelectorAll("article.css-15m2bcr")].map(el => ({
                rating: el.querySelector("[data-testid='icnStarRating']")?.getAttribute("aria-label") || "Tidak ada rating",
                reviewText: el.querySelector("span[data-testid='lblItemUlasan']")?.innerText.trim() || "Tidak ada review",
                user: el.querySelector("span.name")?.innerText.trim() || "No User",
                timeAgo: el.querySelector("p.css-vqrjg4-unf-heading")?.innerText.trim() || "Tidak diketahui"
            }));
        });

        console.log(`📜 Mendapatkan ulasan di halaman ${pageNumber}.`);

        reviews = [...reviews, ...pageReviews];

        const nextButton = await page.$("button[aria-label='Laman berikutnya']:not([disabled])");
        if (nextButton) {
            await nextButton.click();
            await setTimeout(500);
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

http.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));
