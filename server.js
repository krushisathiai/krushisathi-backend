require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/scans', require('./routes/scans'));
app.use('/api/diseases', require('./routes/diseases'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/fertilizers', require('./routes/fertilizers'));
app.use('/api/expert', require('./routes/expert'));
app.use('/api/urea', require('./routes/urea'));
app.use('/api/admin', require('./routes/admin'));

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Krushi Sathi AI API is running', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ─── WEATHER (Enhanced mock with hourly + 5-day forecast) ─────────────────────
app.get('/api/weather', async (req, res) => {
  try {
    const { location = 'Sangamner, Maharashtra' } = req.query;
    const conditions = ['Partly Cloudy', 'Sunny', 'Light Rain', 'Overcast', 'Clear Sky'];
    const icons = ['partly_cloudy', 'sunny', 'rainy', 'cloudy', 'clear'];
    const condIdx = Math.floor(Math.random() * conditions.length);

    const hourlyForecast = [];
    const hours = ['10 AM', '1 PM', '4 PM', '7 PM', '10 PM'];
    const hourIcons = ['sunny', 'partly_cloudy', 'sunny', 'cloudy', 'clear'];
    for (let i = 0; i < 5; i++) {
      hourlyForecast.push({
        time: hours[i],
        temp: (28 + Math.random() * 7).toFixed(0),
        icon: hourIcons[i],
      });
    }

    const days = ['Today', 'Tomorrow'];
    const dates = [];
    for (let i = 2; i < 6; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dates.push(d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }));
    }
    const allDays = [...days, ...dates];
    const fiveDayForecast = allDays.map((day) => ({
      day,
      high: (30 + Math.random() * 5).toFixed(0),
      low: (20 + Math.random() * 4).toFixed(0),
      icon: conditions[Math.floor(Math.random() * conditions.length)],
    }));

    res.json({
      success: true,
      weather: {
        location,
        temperature: (28 + Math.random() * 8).toFixed(1),
        humidity: (40 + Math.random() * 30).toFixed(0),
        condition: conditions[condIdx],
        icon: icons[condIdx],
        wind_speed: (8 + Math.random() * 15).toFixed(1),
        feels_like: (26 + Math.random() * 8).toFixed(1),
        rain_chance: Math.floor(Math.random() * 40),
        uv_index: Math.floor(Math.random() * 8) + 1,
        hourly_forecast: hourlyForecast,
        five_day_forecast: fiveDayForecast,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch weather data' });
  }
});

// ─── STATS ────────────────────────────────────────────────────────────────────
app.get('/api/stats', require('./middleware/auth').authMiddleware, async (req, res) => {
  const db = require('./db');
  try {
    const userId = req.user.userId;
    const [totalScans] = await db.query('SELECT COUNT(*) as count FROM scans WHERE user_id = ?', [userId]);
    const [recentScans] = await db.query('SELECT * FROM scans WHERE user_id = ? ORDER BY scanned_at DESC LIMIT 5', [userId]);
    const [diseaseCount] = await db.query('SELECT COUNT(*) as count FROM scans WHERE user_id = ? AND disease_name != "Healthy Plant"', [userId]);
    res.json({
      success: true,
      stats: { total_scans: totalScans[0].count, disease_detected: diseaseCount[0].count, healthy_plants: totalScans[0].count - diseaseCount[0].count, recent_scans: recentScans },
    });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load dashboard stats' });
  }
});

// ─── 404 & ERROR ──────────────────────────────────────────────────────────────
app.use((req, res) => { res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` }); });
app.use((err, req, res, next) => { console.error('Server error:', err.stack); res.status(500).json({ success: false, message: err.message || 'Something went wrong' }); });

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const migrate = require('./migrate');

migrate().then(() => {
  console.log('Database migration completed.');
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌱 Krushi Sathi AI API running on http://0.0.0.0:${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
  });
}).catch((err) => {
  console.error('Database migration failed to complete on startup:', err);
  // Still start server even if DB fails to connect initially so logs can be checked
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌱 Krushi Sathi AI API running on http://0.0.0.0:${PORT} (Migration failed)`);
  });
});

module.exports = app;
