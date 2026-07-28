/**
 * In-Memory High-Performance TTL Cache Middleware
 * Optimized for handling 10,000+ high concurrent requests
 */

const cacheStore = new Map();

/**
 * Cache middleware generator
 * @param {number} durationSeconds TTL in seconds
 * @param {function} customKeyGenerator Optional function to generate custom cache keys
 */
const cacheMiddleware = (durationSeconds = 60, customKeyGenerator = null) => {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const key = customKeyGenerator 
      ? customKeyGenerator(req) 
      : `${req.originalUrl || req.url}_user_${req.user?.userId || 'guest'}`;

    const cachedEntry = cacheStore.get(key);
    const now = Date.now();

    if (cachedEntry && cachedEntry.expiry > now) {
      // Cache hit - return instantly with headers
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(cachedEntry.data);
    }

    // Cache miss - intercept res.json / res.send to cache response
    res.setHeader('X-Cache', 'MISS');
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      // Only cache successful JSON responses (status 200)
      if (res.statusCode === 200 && body && body.success !== false) {
        cacheStore.set(key, {
          data: JSON.stringify(body),
          expiry: now + durationSeconds * 1000,
        });
      }
      return originalJson(body);
    };

    next();
  };
};

/**
 * Invalidate cache entry by exact key or regex pattern
 */
const clearCachePattern = (pattern) => {
  const regex = new RegExp(pattern);
  for (const key of cacheStore.keys()) {
    if (regex.test(key)) {
      cacheStore.delete(key);
    }
  }
};

/**
 * Clear all cache entries
 */
const clearAllCache = () => {
  cacheStore.clear();
};

// Periodic cleanup of expired keys every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cacheStore.entries()) {
    if (value.expiry <= now) {
      cacheStore.delete(key);
    }
  }
}, 120 * 1000);

module.exports = {
  cacheMiddleware,
  clearCachePattern,
  clearAllCache,
};
