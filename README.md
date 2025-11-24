# Burger Arbitrage Website

Premium website showcasing the quality gap between dine-in and delivery experiences.

## Deployment

This is a static website that can be deployed to any static hosting service.

### Files
- `index.html` - Main HTML file
- `styles.css` - Design system and styles
- `app.js` - JavaScript application
- `Maps.csv` - Google Maps restaurant data
- `wolt_data.csv` - Wolt delivery data

### Local Development

```bash
# Start a local server
python3 -m http.server 8000

# Visit http://localhost:8000
```

### Deploy to Netlify

1. Drag and drop the `website` folder to [netlify.com/drop](https://app.netlify.com/drop)
2. Your site will be live instantly!

### Deploy to Vercel

```bash
npm install -g vercel
cd website
vercel
```

### Deploy to GitHub Pages

1. Create a new GitHub repository
2. Push the `website` folder contents
3. Enable GitHub Pages in repository settings
4. Select the main branch as source
