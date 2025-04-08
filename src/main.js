// DOM elements
const scrapeBtn = document.getElementById('scrape-btn');
const tokopediaUrlInput = document.getElementById('tokopedia-url');
const statsSection = document.getElementById('stats-section');
const reviewsSection = document.getElementById('reviews-section');
const reviewsTable = document.getElementById('reviews-table');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

let allReviews = [];
let currentPage = 1;
let reviewsPerPage = 5;

// Charts
let ratingChart, sentimentChart, trendChart;

// Event listeners
scrapeBtn.addEventListener('click', () => {
    const url = tokopediaUrlInput.value.trim();
    if (!url) {
        alert('Please enter a valid Tokopedia URL');
        return;
    }

    // Simulate loading
    document.getElementById('loading-container').style.display = 'flex';
    document.getElementById('loading-message').innerText = '🛡️ The hunt begins... Scraping the forbidden knowledge...';
    scrapeBtn.innerHTML = 'Scraping... <i class="fas fa-spinner fa-spin"></i>';
    scrapeBtn.disabled = true;

    fetch("http://localhost:3000/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
    })
    .then(res => res.json())
    .then(data => {
        scrapeBtn.innerHTML = 'Scrape <i class="fas fa-arrow-right"></i>';
        scrapeBtn.disabled = false;

        document.getElementById('loading-container').style.display = 'none';

        // Show sections
        statsSection.style.display = 'block';
        reviewsSection.style.display = 'block';

        if (!data.reviews || data.reviews.length === 0) {
            alert("No Data Available");
            return;
        }

        allReviews = data.reviews;

        initCharts(allReviews)

        // Apply pagination immediately
        updateReviews();
    });
});

prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        updateReviews();
    }
});

nextBtn.addEventListener('click', () => {
    if (currentPage < Math.ceil(allReviews.length / reviewsPerPage)) {
        currentPage++;
        updateReviews();
    }
});

// Function to update the displayed reviews based on the current page
function updateReviews() {
    const startIndex = (currentPage - 1) * reviewsPerPage;
    const endIndex = startIndex + reviewsPerPage;
    const reviewsToShow = allReviews.slice(startIndex, endIndex);

    populateReviews(reviewsToShow);

    // Update pagination button states
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === Math.ceil(allReviews.length / reviewsPerPage);

    // Rebuild pagination
    const paginationContainer = document.querySelector('.pagination');
    paginationContainer.innerHTML = '';

    // Tombol Prev
    const prevButton = document.createElement('button');
    prevButton.textContent = 'Prev';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updateReviews();
        }
    });
    paginationContainer.appendChild(prevButton);

    const totalPages = Math.ceil(allReviews.length / reviewsPerPage);
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);

    if (startPage > 1) {
        const firstPageButton = createPageButton(1);
        paginationContainer.appendChild(firstPageButton);

        if (startPage > 2) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            paginationContainer.appendChild(dots);
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationContainer.appendChild(createPageButton(i));
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            paginationContainer.appendChild(dots);
        }
        paginationContainer.appendChild(createPageButton(totalPages));
    }

    // Tombol Next
    const nextButton = document.createElement('button');
    nextButton.textContent = 'Next';
    nextButton.disabled = currentPage === totalPages;
    nextButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            updateReviews();
        }
    });
    paginationContainer.appendChild(nextButton);
}

function createPageButton(pageNumber) {
    const button = document.createElement('button');
    button.textContent = pageNumber;
    if (pageNumber === currentPage) {
        button.classList.add('active');
    }
    button.addEventListener('click', () => {
        currentPage = pageNumber;
        updateReviews();
    });
    return button;
}

// Populate reviews table with limited reviews
function populateReviews(reviews) {
    reviewsTable.innerHTML = '';
    
    const startIndex = (currentPage - 1) * reviewsPerPage;

    reviews.forEach((review, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${startIndex + index + 1}</td>
            <td>${review.user}</td>
            <td>${review.rating}</td>
            <td>${review.sentiment}</td>
            <td>${review.reviewText}</td>
            <td>${review.timeAgo}</td>
        `;
        reviewsTable.appendChild(row);
    });

}

// Initialize charts
function parseRelativeDate(relativeDate) {
    const now = new Date();
    let monthsAgo = 0;
    
    if (relativeDate.includes('hari')) {        
        const daysAgo = parseInt(relativeDate.match(/\d+/), 10) || 1;
        const pastDate = new Date(now);
        pastDate.setDate(now.getDate() - daysAgo);
        return `${pastDate.getMonth() + 1}/${pastDate.getFullYear()}`;
    } else if (relativeDate.includes('minggu')) {
        const weeksAgo = parseInt(relativeDate.match(/\d+/), 10) || 1;
        const pastDate = new Date(now);
        pastDate.setDate(now.getDate() - (weeksAgo * 7));
        return `${pastDate.getMonth() + 1}/${pastDate.getFullYear()}`;
    } else if (relativeDate.includes('bulan')) {
        monthsAgo = parseInt(relativeDate.match(/\d+/), 10) || 0;
    } else if (relativeDate.includes('tahun')) {
        const yearsAgo = parseInt(relativeDate.match(/\d+/), 10) || 1;
        monthsAgo = yearsAgo * 12;
    }
    
    const pastDate = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);    
    return `${pastDate.getMonth() + 1}/${pastDate.getFullYear()}`;
}

function initCharts(reviews) {
    // Calculate rating distribution
    const ratingCounts = [0, 0, 0, 0, 0]; // 1-5 stars
    reviews.forEach(review => {
        const ratingNumber = parseInt(review.rating.replace('bintang ', ''), 10);
        const ratingIndex = ratingNumber - 1;
        if (ratingIndex >= 0 && ratingIndex < 5) {
            ratingCounts[ratingIndex]++;
        }
    });

    // Rating chart (horizontal bar chart)
    const ratingCtx = document.getElementById('rating-chart').getContext('2d');
    if (window.ratingChart) window.ratingChart.destroy();
    window.ratingChart = new Chart(ratingCtx, {
        type: 'bar',
        data: {
            labels: ['5 ★', '4 ★', '3 ★', '2 ★', '1 ★'],
            datasets: [{
                label: 'Number of Reviews',
                data: ratingCounts.reverse(),
                backgroundColor: '#4f46e5',
                borderColor: '#4f46e5',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Rating Distribution' }
            }
        }
    });

    // Sentiment chart (pie chart)
    const sentimentData = [0, 0, 0]; // positive, neutral, negative
    reviews.forEach(review => {
        if (review.sentiment === 'positif') sentimentData[0]++;
        else if (review.sentiment === 'negatif') sentimentData[2]++;
        else sentimentData[1]++; // Default neutral if undefined
    });

    const sentimentCtx = document.getElementById('sentiment-chart').getContext('2d');
    if (window.sentimentChart) window.sentimentChart.destroy();
    window.sentimentChart = new Chart(sentimentCtx, {
        type: 'pie',
        data: {
            labels: ['Positive', 'Neutral', 'Negative'],
            datasets: [{
                data: sentimentData,
                backgroundColor: ['#4f46e5', '#9ca3af', '#6366f1'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' },
                title: { display: true, text: 'Sentiment Analysis' }
            }
        }
    });

    // Convert timeAgo to formatted date
    const reviewDates = reviews.map(review => parseRelativeDate(review.timeAgo));
    
    // Group ratings by date
    const dateMap = new Map();
    reviews.forEach((review, index) => {
        const dateKey = reviewDates[index];
        if (!dateMap.has(dateKey)) {
            dateMap.set(dateKey, { sum: 0, count: 0 });
        }
        const data = dateMap.get(dateKey);
        const ratingNumber = parseInt(review.rating.replace('bintang ', ''), 10);
        data.sum += ratingNumber;
        data.count++;
    });

    const dates = Array.from(dateMap.keys()).sort();
    const avgRatings = dates.map(date => dateMap.get(date).sum / dateMap.get(date).count);

    // Trend chart (line chart)
    const trendCtx = document.getElementById('trend-chart').getContext('2d');
    if (window.trendChart) window.trendChart.destroy();
    window.trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Average Rating',
                data: avgRatings,
                borderColor: '#4f46e5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Rating Trend Over Time' }
            },
            scales: {
                y: {
                    min: 0,
                    max: 5,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}