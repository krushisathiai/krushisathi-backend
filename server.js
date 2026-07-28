const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();

// Trust proxy for Render / Cloudflare / Nginx load balancers
app.set('trust proxy', 1);

// Disable x-powered-by header for security (hide Express identity)
app.disable('x-powered-by');

// ─── SECURITY & PERFORMANCE MIDDLEWARE ─────────────────────────────────────────
// Helmet security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow serving images/assets
  contentSecurityPolicy: false, // Avoid blocking frontend cross-origin requests
}));

// Gzip Compression for fast responses
app.use(compression());

// Rate Limiter for general API endpoints (300 requests per 15 minutes per IP)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter Rate Limiter for Auth endpoints (30 login/register requests per 15 minutes per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many authentication attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// CORS configuration
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── ROUTES ───────────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const scanRoutes = require('./routes/scans');
const diseaseRoutes = require('./routes/diseases');
const alertRoutes = require('./routes/alerts');
const shopRoutes = require('./routes/shop');

// ─── CACHE MIDDLEWARE FOR 10K HIGH LOAD ───────────────────────────────────────
const { cacheMiddleware } = require('./middleware/cache');

// Apply caching to heavy read-only endpoints (5-30 min TTL)
app.use('/api/diseases', cacheMiddleware(1800)); // 30 min cache
app.use('/api/fertilizers', cacheMiddleware(1800)); // 30 min cache
app.use('/api/alerts', cacheMiddleware(300)); // 5 min cache
app.use('/api/shop', cacheMiddleware(300)); // 5 min cache

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/diseases', diseaseRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/fertilizers', require('./routes/fertilizers'));
app.use('/api/expert', require('./routes/expert'));
app.use('/api/urea', require('./routes/urea'));
app.use('/api/admin', require('./routes/admin'));

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Krushi Sathi AI API is running', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ─── WEATHER (Using Open-Meteo API for real data with 10 min cache) ──────────────
app.get('/api/weather', cacheMiddleware(600), async (req, res) => {
  try {
    // Defaulting to Sangamner coordinates for now as per plan
    const lat = 19.57;
    const lon = 74.20;
    const location = 'Sangamner, Maharashtra';

    // Fetch current weather and forecast from Open-Meteo
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max&timezone=auto`;
    
    let data;
    try {
      const https = require('https');
      data = await new Promise((resolve, reject) => {
        https.get(weatherUrl, { headers: { 'User-Agent': 'KrushiSathiAI/1.0' } }, (resp) => {
          let raw = '';
          resp.on('data', (chunk) => raw += chunk);
          resp.on('end', () => {
            try {
              resolve(JSON.parse(raw));
            } catch(e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });

      if (!data || data.error || !data.current) {
        throw new Error(data?.reason || 'Invalid weather data received from API');
      }

      const current = data.current;
      
      // Simple weather code mapper (WMO weather codes)
      const mapCodeToCondition = (code) => {
        if (code === 0) return { cond: 'Clear Sky', icon: 'clear' };
        if (code <= 3) return { cond: 'Partly Cloudy', icon: 'partly_cloudy' };
        if (code <= 49) return { cond: 'Foggy', icon: 'cloudy' };
        if (code <= 69) return { cond: 'Rain', icon: 'rainy' };
        if (code <= 79) return { cond: 'Snow', icon: 'cloudy' };
        if (code <= 99) return { cond: 'Thunderstorm', icon: 'rainy' };
        return { cond: 'Sunny', icon: 'sunny' };
      };

      const currentMap = mapCodeToCondition(current.weather_code);

      // Extract next 5 hours
      const hourlyForecast = [];
      const nowHour = new Date().getHours();
      for (let i = 1; i <= 5; i++) {
        let idx = nowHour + i;
        if (idx >= data.hourly.time.length) break;
        const timeStr = new Date(data.hourly.time[idx]).toLocaleTimeString('en-US', { hour: 'numeric' });
        const hMap = mapCodeToCondition(data.hourly.weather_code[idx]);
        hourlyForecast.push({
          time: timeStr,
          temp: Math.round(data.hourly.temperature_2m[idx]),
          icon: hMap.icon,
        });
      }

      // Extract next 5 days
      const fiveDayForecast = [];
      for (let i = 1; i <= 5; i++) {
        if (i >= data.daily.time.length) break;
        const d = new Date(data.daily.time[i]);
        let dayName = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
        if (i === 1) dayName = 'Tomorrow';
        const dMap = mapCodeToCondition(data.daily.weather_code[i]);
        fiveDayForecast.push({
          day: dayName,
          high: Math.round(data.daily.temperature_2m_max[i]),
          low: Math.round(data.daily.temperature_2m_min[i]),
          icon: dMap.icon,
        });
      }

      res.json({
        success: true,
        weather: {
          location,
          temperature: Math.round(current.temperature_2m),
          humidity: current.relative_humidity_2m,
          condition: currentMap.cond,
          icon: currentMap.icon,
          wind_speed: current.wind_speed_10m,
          feels_like: Math.round(current.apparent_temperature),
          rain_chance: current.precipitation > 0 ? 80 : 10,
          uv_index: Math.round(data.daily.uv_index_max[0] || 5),
          hourly_forecast: hourlyForecast,
          five_day_forecast: fiveDayForecast,
        },
      });
    } catch (e) {
      console.error('Weather API error:', e);
      return res.status(500).json({ success: false, message: 'Failed to fetch weather data', error: e.toString() });
    }
  } catch (err) {
    console.error('Weather error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch weather data' });
  }
});

// ─── STATS ────────────────────────────────────────────────────────────────────
app.get('/api/stats', require('./middleware/auth').authMiddleware, async (req, res) => {
  const db = require('./db');
  try {
    const userId = req.user.userId;
    const [totalScans] = await db.query('SELECT COUNT(*) as count FROM scans WHERE user_id = ?', [userId]);
    const [recentScans] = await db.query('SELECT * FROM scans WHERE user_id = ? ORDER BY scanned_at DESC LIMIT 3', [userId]);
    const [diseaseCount] = await db.query("SELECT COUNT(*) as count FROM scans WHERE user_id = ? AND disease_name != 'Healthy Plant'", [userId]);
    const totalCount = parseInt(totalScans[0]?.count || 0, 10);
    const diseaseTotal = parseInt(diseaseCount[0]?.count || 0, 10);
    
    res.json({
      success: true,
      stats: { 
        total_scans: totalCount, 
        disease_detected: diseaseTotal, 
        healthy_plants: Math.max(0, totalCount - diseaseTotal), 
        recent_scans: recentScans || [] 
      },
    });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load dashboard stats' });
  }
});

// ─── 404 & ERROR ──────────────────────────────────────────────────────────────
app.use((req, res) => { res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` }); });
app.use((err, req, res, next) => { console.error('Server error:', err.stack); res.status(500).json({ success: false, message: err.message || 'Something went wrong' }); });

// ─── START & CLUSTER SCALABILITY FOR 10K CONCURRENT USERS ───────────────────────
const cluster = require('cluster');
const os = require('os');
const PORT = process.env.PORT || 5000;
const migrate = require('./migrate');

const numCPUs = os.cpus().length;
const isClusterEnabled = process.env.ENABLE_CLUSTER === 'true' && cluster.isMaster;

if (isClusterEnabled && numCPUs > 1) {
  console.log(`🚀 Primary process ${process.pid} is running. Forking ${numCPUs} worker processes for high-load handling...`);
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker, code, signal) => {
    console.warn(`Worker process ${worker.process.pid} died. Restarting worker...`);
    cluster.fork();
  });
} else {
  migrate().then(() => {
    console.log('Database migration completed.');
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🌱 Krushi Sathi AI API (PID: ${process.pid}) running on http://0.0.0.0:${PORT}`);
      console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
    });

    // Keep-Alive Tuning for 10k concurrent HTTP TCP connection reuse
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 66000; // 66 seconds
  }).catch((err) => {
    console.error('Database migration failed to complete on startup:', err);
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🌱 Krushi Sathi AI API running on http://0.0.0.0:${PORT} (Migration failed)`);
    });
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
  });
}

module.exports = app;
