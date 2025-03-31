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

        // Coba klik tombol jika ada
        const buttonExists = await page.$("div.css-11hzwo5 button");
        if (buttonExists) {
            await page.click("div.css-11hzwo5 button");
            console.log("✅ Tombol berhasil diklik.");
        } else {
            console.log("⚠️ Tidak menemukan tombol, langsung scroll ke bawah.");
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

        await page.waitForSelector("article.css-15m2bcr", { timeout: 60000 });

        // 🔹 Cek status disabled dari checkbox rating
        const ratingsStatus = await page.evaluate(() => {
            return [...document.querySelectorAll("label.checkbox")].map(label => ({
                text: label.innerText.trim(),
                disabled: label.querySelector("input")?.disabled || false
            }));
        });

        console.log("📌 Status Checkbox Ratings:", ratingsStatus);

        // 🔹 Ambil hanya rating yang tidak disabled
        let activeRatings = ratingsStatus.filter(r => /^[1-5]$/.test(r.text) && !r.disabled).map(r => r.text);
        console.log("⭐ Ratings Aktif:", activeRatings);

        let allReviews = [];

        if (activeRatings.length < 2) {
            allReviews = await scrapeReviews(page);
        } else {
            let prevRating = null;
            for (let rating of activeRatings) {
                console.log(`📌 Menerapkan filter: ${rating}`);
                await applyFilter(page, rating, prevRating);
                let reviews = await scrapeReviews(page);
                console.log(`🔢 Jumlah ulasan untuk rating ${rating}: ${reviews.length}`);
                allReviews = [...allReviews, ...reviews];
                prevRating = rating;
            }
        }

        console.log("✅ Total Ulasan Ditemukan:", allReviews.length);

        // 🔹 Analisis Sentimen dengan Delay
        const reviewsWithSentiment = [];
        for (let index = 0; index < allReviews.length; index++) {
            const review = allReviews[index];
            console.log(index);

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

        res.json({ reviews: reviewsWithSentiment });
    } catch (error) {
        console.error("❌ Error scraping:", error);
        res.status(500).json({ error: "Failed to scrape data" });
    } finally {
        await browser.close();
    }
});