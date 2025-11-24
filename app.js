// ============================================
// BURGER ARBITRAGE - MAIN APPLICATION
// ============================================

// Global state
let restaurantData = [];
let filteredData = [];

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching restaurant names
 */
function levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[str2.length][str1.length];
}

/**
 * Calculate similarity score between two strings (0-100)
 */
function similarityScore(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 100;

    const distance = levenshteinDistance(longer, shorter);
    return ((longer.length - distance) / longer.length) * 100;
}

/**
 * Find best match for a name in a list of names
 */
function findBestMatch(name, nameList) {
    let bestMatch = null;
    let bestScore = 0;

    for (const candidate of nameList) {
        const score = similarityScore(
            name.toLowerCase().trim(),
            candidate.name.toLowerCase().trim()
        );

        if (score > bestScore) {
            bestScore = score;
            bestMatch = candidate;
        }
    }

    return { match: bestMatch, score: bestScore };
}

/**
 * Classify restaurant based on delivery delta
 */
function classifyRestaurant(delta) {
    if (delta > 0.3) return 'Better Dine-In';
    if (delta < -0.1) return 'Better Delivery';
    return 'Consistent';
}

/**
 * Get category color
 */
function getCategoryColor(category) {
    const colors = {
        'Better Dine-In': '#E74C3C',
        'Consistent': '#F39C12',
        'Better Delivery': '#27AE60'
    };
    return colors[category] || '#95A5A6';
}

/**
 * Format number with commas
 */
function formatNumber(num) {
    return num.toLocaleString('en-US');
}

/**
 * Parse CSV text to array of objects
 */
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = [];
        let current = '';
        let inQuotes = false;

        for (let char of lines[i]) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());

        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] || '';
        });
        data.push(obj);
    }

    return data;
}

// ============================================
// DATA LOADING & PROCESSING
// ============================================

/**
 * Load and merge data from CSV files
 */
async function loadData() {
    try {
        // Load both CSV files
        const [mapsResponse, woltResponse] = await Promise.all([
            fetch('./Maps.csv'),
            fetch('./wolt_data.csv')
        ]);

        if (!mapsResponse.ok || !woltResponse.ok) {
            throw new Error('Failed to load data files');
        }

        const mapsText = await mapsResponse.text();
        const woltText = await woltResponse.text();

        const mapsData = parseCSV(mapsText);
        const woltData = parseCSV(woltText);

        // Merge data using fuzzy matching
        const merged = [];

        for (const mapsRow of mapsData) {
            const { match, score } = findBestMatch(mapsRow.name, woltData);

            if (match && score > 85) {
                const googleRating = parseFloat(mapsRow.rating);
                const woltRating = parseFloat(match.rating);
                const deliveryDelta = googleRating - woltRating;

                merged.push({
                    restaurant: mapsRow.name,
                    googleRating: googleRating,
                    googleReviews: parseInt(mapsRow.reviews_count) || 0,
                    woltRating: woltRating,
                    woltReviews: parseInt(match.reviews_count) || 0,
                    deliveryDelta: deliveryDelta,
                    category: classifyRestaurant(deliveryDelta),
                    matchScore: score
                });
            }
        }

        // Deduplicate: Keep only the best-rated instance of each restaurant
        // This handles chains like McDonald's with multiple locations
        const deduped = [];
        const seen = new Map();

        for (const restaurant of merged) {
            // Normalize name for comparison (remove location details, trim, lowercase)
            const normalizedName = restaurant.restaurant
                .toLowerCase()
                .replace(/\s*[-–—]\s*.*/g, '') // Remove everything after dash (location info)
                .replace(/\s+/g, ' ')
                .trim();

            if (!seen.has(normalizedName)) {
                seen.set(normalizedName, restaurant);
            } else {
                // Keep the one with higher Google rating (or more reviews if ratings are equal)
                const existing = seen.get(normalizedName);
                if (restaurant.googleRating > existing.googleRating ||
                    (restaurant.googleRating === existing.googleRating &&
                        restaurant.googleReviews > existing.googleReviews)) {
                    seen.set(normalizedName, restaurant);
                }
            }
        }

        // Convert Map back to array
        const uniqueRestaurants = Array.from(seen.values());

        return uniqueRestaurants;
    } catch (error) {
        console.error('Error loading data:', error);
        throw error;
    }
}

// ============================================
// UI RENDERING FUNCTIONS
// ============================================

/**
 * Render key metrics
 */
function renderMetrics(data) {
    const avgGoogle = data.reduce((sum, d) => sum + d.googleRating, 0) / data.length;
    const avgWolt = data.reduce((sum, d) => sum + d.woltRating, 0) / data.length;
    const avgDelta = data.reduce((sum, d) => sum + d.deliveryDelta, 0) / data.length;

    const metrics = [
        { icon: '📍', value: avgGoogle.toFixed(2), label: 'Dine-in Average' },
        { icon: '🛵', value: avgWolt.toFixed(2), label: 'Delivery Average' },
        { icon: '📊', value: avgDelta.toFixed(2), label: 'Quality Gap' },
        { icon: '🍔', value: data.length, label: 'Restaurants' }
    ];

    const grid = document.getElementById('metrics-grid');
    grid.innerHTML = metrics.map((metric, index) => `
    <div class="glass-card metric-card fade-in stagger-${index + 1}">
      <span class="metric-icon">${metric.icon}</span>
      <span class="metric-value">${metric.value}</span>
      <span class="metric-label">${metric.label}</span>
    </div>
  `).join('');
}

/**
 * Render scatter plot
 */
function renderScatterPlot(data) {
    const ctx = document.getElementById('scatter-chart').getContext('2d');

    // Calculate medians
    const googleRatings = data.map(d => d.googleRating).sort((a, b) => a - b);
    const woltRatings = data.map(d => d.woltRating).sort((a, b) => a - b);
    const medianGoogle = googleRatings[Math.floor(googleRatings.length / 2)];
    const medianWolt = woltRatings[Math.floor(woltRatings.length / 2)];

    // Update caption
    document.getElementById('scatter-caption').textContent =
        `Median ratings: Dine-in ${medianGoogle.toFixed(1)} | Delivery ${medianWolt.toFixed(1)}`;

    // Prepare data by category
    const categories = {
        'Better Dine-In': [],
        'Consistent': [],
        'Better Delivery': []
    };

    data.forEach(d => {
        categories[d.category].push({
            x: d.googleRating,
            y: d.woltRating,
            label: d.restaurant,
            reviews: d.googleReviews
        });
    });

    // Create datasets
    const datasets = Object.keys(categories).map(category => ({
        label: category,
        data: categories[category],
        backgroundColor: getCategoryColor(category) + '99',
        borderColor: getCategoryColor(category),
        borderWidth: 2,
        pointRadius: (context) => {
            const reviews = context.raw.reviews;
            return Math.max(4, Math.min(15, Math.sqrt(reviews) / 5));
        },
        pointHoverRadius: (context) => {
            const reviews = context.raw.reviews;
            return Math.max(6, Math.min(18, Math.sqrt(reviews) / 5));
        }
    }));

    new Chart(ctx, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#E8E8E8',
                        font: { size: 14, family: 'Inter' },
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 14, 39, 0.95)',
                    titleColor: '#FFFFFF',
                    bodyColor: '#E8E8E8',
                    borderColor: 'rgba(255, 107, 107, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: (items) => items[0].raw.label,
                        label: (context) => {
                            const d = context.raw;
                            return [
                                `Dine-in: ${d.x.toFixed(1)} ⭐`,
                                `Delivery: ${d.y.toFixed(1)} ⭐`,
                                `Gap: ${(d.x - d.y).toFixed(2)}`,
                                `Reviews: ${formatNumber(d.reviews)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Dine-in Rating (Google Maps)',
                        color: '#FF6B6B',
                        font: { size: 14, family: 'Inter', weight: '600' }
                    },
                    min: 2.5,
                    max: 5,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#E8E8E8',
                        font: { size: 12, family: 'Inter' }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Delivery Rating (Wolt)',
                        color: '#FF6B6B',
                        font: { size: 14, family: 'Inter', weight: '600' }
                    },
                    min: 2.5,
                    max: 5,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#E8E8E8',
                        font: { size: 12, family: 'Inter' }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                intersect: true
            }
        }
    });
}

/**
 * Render worst restaurants list
 */
function renderWorstList(data) {
    const worst = [...data]
        .sort((a, b) => b.deliveryDelta - a.deliveryDelta)
        .slice(0, 8);

    const list = document.getElementById('worst-list');
    list.innerHTML = worst.map(d => `
    <li class="restaurant-item">
      <span class="restaurant-name" title="${d.restaurant}">${d.restaurant}</span>
      <div class="restaurant-ratings">
        <span class="rating-badge">
          <span>📍</span>
          <span class="rating-value">${d.googleRating.toFixed(1)}</span>
        </span>
        <span class="rating-badge">
          <span>🛵</span>
          <span class="rating-value">${d.woltRating.toFixed(1)}</span>
        </span>
        <span class="delta-badge delta-negative">-${d.deliveryDelta.toFixed(2)}</span>
      </div>
    </li>
  `).join('');
}

/**
 * Render hidden gems list
 */
function renderGemsList(data) {
    const gems = [...data]
        .filter(d => d.googleRating >= 4.5 && d.googleReviews < 500)
        .sort((a, b) => b.googleRating - a.googleRating)
        .slice(0, 8);

    const list = document.getElementById('gems-list');
    list.innerHTML = gems.map(d => `
    <li class="restaurant-item">
      <span class="restaurant-name" title="${d.restaurant}">${d.restaurant}</span>
      <div class="restaurant-ratings">
        <span class="rating-badge">
          <span>⭐</span>
          <span class="rating-value">${d.googleRating.toFixed(1)}</span>
        </span>
        <span class="rating-badge">
          <span>📊</span>
          <span class="rating-value">${formatNumber(d.googleReviews)}</span>
        </span>
      </div>
    </li>
  `).join('');
}

/**
 * Render category distribution chart
 */
function renderCategoryChart(data) {
    const ctx = document.getElementById('category-chart').getContext('2d');

    const categoryCounts = data.reduce((acc, d) => {
        acc[d.category] = (acc[d.category] || 0) + 1;
        return acc;
    }, {});

    const categories = ['Better Dine-In', 'Consistent', 'Better Delivery'];
    const counts = categories.map(cat => categoryCounts[cat] || 0);
    const colors = categories.map(cat => getCategoryColor(cat));

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: categories,
            datasets: [{
                label: 'Number of Restaurants',
                data: counts,
                backgroundColor: colors.map(c => c + 'CC'),
                borderColor: colors,
                borderWidth: 2,
                borderRadius: 10,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 14, 39, 0.95)',
                    titleColor: '#FFFFFF',
                    bodyColor: '#E8E8E8',
                    borderColor: 'rgba(255, 107, 107, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: (context) => `${context.parsed.y} restaurants`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#E8E8E8',
                        font: { size: 13, family: 'Inter' }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#E8E8E8',
                        font: { size: 12, family: 'Inter' },
                        stepSize: 5
                    },
                    title: {
                        display: true,
                        text: 'Number of Restaurants',
                        color: '#FF6B6B',
                        font: { size: 14, family: 'Inter', weight: '600' }
                    }
                }
            }
        }
    });
}

/**
 * Render data table
 */
function renderDataTable(data = filteredData) {
    const tbody = document.getElementById('table-body');

    if (data.length === 0) {
        tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: var(--space-xl); color: var(--color-text-muted);">
          No restaurants found matching your search.
        </td>
      </tr>
    `;
        return;
    }

    tbody.innerHTML = data.map(d => `
    <tr>
      <td style="font-weight: 600; color: var(--color-text-primary);">${d.restaurant}</td>
      <td>${d.googleRating.toFixed(1)}</td>
      <td>${formatNumber(d.googleReviews)}</td>
      <td>${d.woltRating.toFixed(1)}</td>
      <td>${formatNumber(d.woltReviews)}</td>
      <td style="font-weight: 600; color: ${d.deliveryDelta > 0 ? 'var(--color-category-dine-in)' : 'var(--color-category-delivery)'};">
        ${d.deliveryDelta > 0 ? '+' : ''}${d.deliveryDelta.toFixed(2)}
      </td>
      <td>
        <span style="
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          font-weight: 600;
          background: ${getCategoryColor(d.category)}33;
          color: ${getCategoryColor(d.category)};
        ">
          ${d.category}
        </span>
      </td>
    </tr>
  `).join('');
}

/**
 * Handle search input
 */
function handleSearch(event) {
    const query = event.target.value.toLowerCase().trim();

    if (!query) {
        filteredData = restaurantData;
    } else {
        filteredData = restaurantData.filter(d =>
            d.restaurant.toLowerCase().includes(query)
        );
    }

    renderDataTable(filteredData);
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize the application
 */
async function init() {
    try {
        // Load data
        restaurantData = await loadData();
        filteredData = restaurantData;

        // Hide loading, show content
        document.getElementById('loading').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';

        // Render all components
        renderMetrics(restaurantData);
        renderScatterPlot(restaurantData);
        renderWorstList(restaurantData);
        renderGemsList(restaurantData);
        renderCategoryChart(restaurantData);
        renderDataTable(restaurantData);

        // Setup search
        document.getElementById('search-input').addEventListener('input', handleSearch);

    } catch (error) {
        console.error('Initialization error:', error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error-state').style.display = 'block';
    }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
