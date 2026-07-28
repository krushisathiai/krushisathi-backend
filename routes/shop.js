const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── MULTER SETUP FOR PRODUCT IMAGES ────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/products');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `product-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    return cb(null, true);
  },
});

// ─── MIDDLEWARE FOR SHOP OWNER ONLY ─────────────────────────────────────────
const requireShopOwner = async (req, res, next) => {
  try {
    const [users] = await db.query('SELECT role FROM users WHERE id = ?', [req.user.userId]);
    if (users.length === 0 || users[0].role !== 'shop_owner') {
      return res.status(403).json({ success: false, message: 'Access denied. Shop owners only.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error verifying role' });
  }
};

// ─── GET SHOP PRODUCTS (FOR OWNER) ──────────────────────────────────────────
// GET /api/shop/my-products
router.get('/my-products', authMiddleware, requireShopOwner, async (req, res) => {
  try {
    const [products] = await db.query(
      'SELECT * FROM shop_products WHERE shop_owner_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json({ success: true, products });
  } catch (err) {
    console.error('Error fetching shop products:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET DASHBOARD STATS (FOR OWNER) ──────────────────────────────────────────
// GET /api/shop/stats
router.get('/stats', authMiddleware, requireShopOwner, async (req, res) => {
  try {
    const [[totalProductsRow]] = await db.query('SELECT COUNT(*) as count FROM shop_products WHERE shop_owner_id = ?', [req.user.userId]);
    const [[outOfStockRow]] = await db.query('SELECT COUNT(*) as count FROM shop_products WHERE shop_owner_id = ? AND status = ?', [req.user.userId, 'Out of Stock']);
    const [[availableStockRow]] = await db.query('SELECT COUNT(*) as count FROM shop_products WHERE shop_owner_id = ? AND status != ?', [req.user.userId, 'Out of Stock']);
    const [[totalInquiriesRow]] = await db.query('SELECT COUNT(*) as count FROM shop_inquiries WHERE shop_owner_id = ?', [req.user.userId]);
    
    // Low stock products
    const [lowStockProducts] = await db.query('SELECT id, name, stock_quantity, unit FROM shop_products WHERE shop_owner_id = ? AND stock_quantity <= 10', [req.user.userId]);

    res.json({ 
      success: true, 
      stats: {
        totalProducts: parseInt(totalProductsRow.count),
        outOfStock: parseInt(outOfStockRow.count),
        availableStock: parseInt(availableStockRow.count),
        totalInquiries: parseInt(totalInquiriesRow.count),
        lowStockProducts
      }
    });
  } catch (err) {
    console.error('Error fetching shop stats:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ─── ADD PRODUCT (FOR OWNER) ────────────────────────────────────────────────
// POST /api/shop/products
router.post('/products', authMiddleware, requireShopOwner, upload.single('image'), async (req, res) => {
  try {
    const { name, category, company, price, stock_quantity, unit, description, status } = req.body;
    let imageUrl = null;
    
    if (req.file) {
      imageUrl = `/uploads/products/${req.file.filename}`;
    }
    
    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'Product name and price are required' });
    }

    const [result] = await db.query(
      `INSERT INTO shop_products 
       (shop_owner_id, name, category, company, price, stock_quantity, unit, description, image_url, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.userId, name, category, company, price, stock_quantity || 0, unit, description, imageUrl, status || 'Available']
    );

    // Generate Global Alert
    try {
      const [shopUser] = await db.query('SELECT shop_name FROM users WHERE id = ?', [req.user.userId]);
      const shopName = (shopUser.length > 0 && shopUser[0].shop_name) ? shopUser[0].shop_name : 'A Shop';
      
      const alertTitle = 'New Product Available! 🎉';
      const alertMessage = `${shopName} has added a new product: ${name}. Check it out now in the Marketplace!`;
      
      await db.query(
        `INSERT INTO alerts (user_id, title, message, type) VALUES (NULL, ?, ?, 'shop')`,
        [alertTitle, alertMessage]
      );
    } catch (alertErr) {
      console.error('Failed to create global alert for new product:', alertErr);
    }

    res.status(201).json({ success: true, message: 'Product added successfully', productId: result.insertId });
  } catch (err) {
    console.error('Error adding product:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
// ─── EDIT PRODUCT (FOR OWNER) ───────────────────────────────────────────────
// PUT /api/shop/products/:id
router.put('/products/:id', authMiddleware, requireShopOwner, upload.single('image'), async (req, res) => {
  try {
    const { name, category, company, price, stock_quantity, unit, description, status } = req.body;
    
    let updateQuery = 'UPDATE shop_products SET name = ?, category = ?, company = ?, price = ?, stock_quantity = ?, unit = ?, description = ?, status = ?';
    let params = [name, category, company, price, stock_quantity || 0, unit, description, status || 'Available'];

    if (req.file) {
      updateQuery += ', image_url = ?';
      params.push(`/uploads/products/${req.file.filename}`);
    }

    updateQuery += ' WHERE id = ? AND shop_owner_id = ?';
    params.push(req.params.id, req.user.userId);

    const [result] = await db.query(updateQuery, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or unauthorized' });
    }

    res.json({ success: true, message: 'Product updated successfully' });
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── TOGGLE PRODUCT STATUS (FOR OWNER) ──────────────────────────────────────
// PUT /api/shop/products/:id/status
router.put('/products/:id/status', authMiddleware, requireShopOwner, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const [result] = await db.query(
      'UPDATE shop_products SET status = ? WHERE id = ? AND shop_owner_id = ?',
      [status, req.params.id, req.user.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or unauthorized' });
    }

    res.json({ success: true, message: 'Product status updated successfully' });
  } catch (err) {
    console.error('Error updating product status:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ─── DELETE PRODUCT (FOR OWNER) ─────────────────────────────────────────────
// DELETE /api/shop/products/:id
router.delete('/products/:id', authMiddleware, requireShopOwner, async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM shop_products WHERE id = ? AND shop_owner_id = ?',
      [req.params.id, req.user.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or unauthorized' });
    }

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET ALL SHOP STORES (GOOGLE PLACES STYLE NEARBY STORES DIRECTORY) ─────────
// GET /api/shop/stores
router.get('/stores', authMiddleware, async (req, res) => {
  try {
    const [userRows] = await db.query('SELECT location FROM users WHERE id = ?', [req.user.userId]);
    const rawLoc = userRows[0]?.location || 'Sangamner, Maharashtra';
    const city = rawLoc.split(',')[0].trim() || 'Sangamner';
    const userLoc = rawLoc.toLowerCase();

    const query = `
      SELECT u.id, u.full_name as owner_name, u.mobile_number, u.shop_name, u.shop_location, u.profile_image,
             COUNT(p.id) as product_count
      FROM users u
      LEFT JOIN shop_products p ON u.id = p.shop_owner_id
      WHERE u.role = 'shop_owner'
      GROUP BY u.id, u.full_name, u.mobile_number, u.shop_name, u.shop_location, u.profile_image
      ORDER BY u.id DESC
    `;
    let [dbStores] = await db.query(query);

    // Format DB stores with Google Places metadata
    let stores = dbStores.map((s, idx) => ({
      id: s.id,
      owner_name: s.owner_name || 'Agro Owner',
      mobile_number: s.mobile_number || '9822012345',
      shop_name: s.shop_name || `${city} Krushi Seva Kendra`,
      shop_location: s.shop_location || `${city}, Maharashtra`,
      address: `${s.shop_location || city} Market Area, Near Main Bus Stand`,
      product_count: parseInt(s.product_count || '0', 10),
      rating: 4.8,
      reviews_count: 90 + (idx * 15),
      distance_km: (0.5 + (idx * 0.7)).toFixed(1),
      status_text: 'Open Now • 8:00 AM - 8:00 PM',
      maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((s.shop_name || 'Krushi Seva Kendra') + ' ' + (s.shop_location || city))}`
    }));

    // Dynamic location-aware nearby Agro Stores for the user's city
    const landmarks = ['Main Market Yard', 'Bypass Road Junction', 'Station Road', 'Bus Stand Area', 'Highway Naka', 'College Square', 'Ring Road', 'Old City Market'];
    const shopBrands = [
      { name: `${city} Krushi Seva Kendra`, owner: 'Vaibhav Patil', phone: '9822012345', count: 6, rating: 4.9, reviews: 142, dist: '0.8' },
      { name: `Kisan Agro Store ${city}`, owner: 'Sanjay Deshmukh', phone: '9850123456', count: 5, rating: 4.8, reviews: 118, dist: '1.2' },
      { name: `Mauli Krushi Seva Kendra ${city}`, owner: 'Mahesh Shinde', phone: '9763112233', count: 4, rating: 4.7, reviews: 95, dist: '1.9' },
      { name: `Shri Ganesh Fertilisers & Agro Store`, owner: 'Rajesh Jadhav', phone: '9921445566', count: 5, rating: 4.9, reviews: 165, dist: '2.4' },
      { name: `Shri Ram Krushi Bhandar ${city}`, owner: 'Anand Kulkarni', phone: '9860223344', count: 4, rating: 4.8, reviews: 88, dist: '2.9' },
      { name: `Mahalaxmi Krushi Seva Kendra ${city}`, owner: 'Pravin Pawar', phone: '9762998877', count: 3, rating: 4.6, reviews: 72, dist: '3.5' },
      { name: `Om Sai Krushi Seva Kendra`, owner: 'Ganesh Thorat', phone: '9922114433', count: 4, rating: 4.9, reviews: 110, dist: '4.1' },
      { name: `Royal Agro Store ${city}`, owner: 'Vikas More', phone: '9823556677', count: 3, rating: 4.7, reviews: 64, dist: '4.8' }
    ];

    const fallbackStores = shopBrands.map((b, idx) => ({
      id: 901 + idx,
      owner_name: b.owner,
      mobile_number: b.phone,
      shop_name: b.name,
      shop_location: `${city}, Maharashtra`,
      address: `${landmarks[idx % landmarks.length]}, ${city}, Maharashtra`,
      product_count: b.count,
      rating: b.rating,
      reviews_count: b.reviews,
      distance_km: b.dist,
      status_text: 'Open Now • 8:00 AM - 8:00 PM',
      maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.name + ' ' + city)}`
    }));

    // Deduplicate fallback stores against DB stores by normalized shop name
    const seenNames = new Set(stores.map(s => (s.shop_name || '').toLowerCase().replace(/[^a-z0-9]/g, '')));
    for (const fb of fallbackStores) {
      const normFbName = (fb.shop_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const isDuplicate = Array.from(seenNames).some(name => name.includes(normFbName) || normFbName.includes(name));
      if (!isDuplicate) {
        stores.push(fb);
        seenNames.add(normFbName);
      }
    }

    // Sort nearby stores matching user location first
    const parts = userLoc.split(',').map(s => s.trim()).filter(s => s.length > 2);
    stores.sort((a, b) => {
      const locA = (a.shop_location || '').toLowerCase();
      const locB = (b.shop_location || '').toLowerCase();
      const matchA = parts.some(p => locA.includes(p));
      const matchB = parts.some(p => locB.includes(p));
      if (matchA && !matchB) return -1;
      if (!matchA && matchB) return 1;
      return 0;
    });

    res.json({ success: true, stores, user_location: rawLoc, city });
  } catch (err) {
    console.error('Error fetching shop stores:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET ALL PRODUCTS (FOR ALL USERS) ───────────────────────────────────────
// GET /api/shop/all-products
router.get('/all-products', authMiddleware, async (req, res) => {
  try {
    const [userRows] = await db.query('SELECT location FROM users WHERE id = ?', [req.user.userId]);
    const userLoc = (userRows[0]?.location || '').toLowerCase();

    const query = `
      SELECT p.*, u.shop_name, u.shop_location, u.mobile_number 
      FROM shop_products p
      JOIN users u ON p.shop_owner_id = u.id
      ORDER BY p.created_at DESC
    `;
    const [products] = await db.query(query);

    // Boost products from shops matching user location
    if (userLoc && userLoc.length > 2) {
      const parts = userLoc.split(',').map(s => s.trim()).filter(s => s.length > 2);
      products.sort((a, b) => {
        const locA = (a.shop_location || '').toLowerCase();
        const locB = (b.shop_location || '').toLowerCase();
        const matchA = parts.some(p => locA.includes(p));
        const matchB = parts.some(p => locB.includes(p));
        if (matchA && !matchB) return -1;
        if (!matchA && matchB) return 1;
        return 0;
      });
    }

    res.json({ success: true, products, user_location: userRows[0]?.location || null });
  } catch (err) {
    console.error('Error fetching all products:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST INQUIRY (FOR USER) ────────────────────────────────────────────────
// POST /api/shop/inquire
router.post('/inquire', authMiddleware, async (req, res) => {
  try {
    const { product_id, shop_owner_id } = req.body;
    
    if (!product_id || !shop_owner_id) {
      return res.status(400).json({ success: false, message: 'Product ID and Shop Owner ID are required' });
    }

    // Get user details
    const [users] = await db.query('SELECT full_name, mobile_number, location FROM users WHERE id = ?', [req.user.userId]);
    if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    
    const user = users[0];

    const [existing] = await db.query(
      'SELECT id FROM shop_inquiries WHERE product_id = ? AND user_id = ?',
      [product_id, req.user.userId]
    );

    if (existing.length > 0) {
      return res.status(200).json({ success: true, message: 'Inquiry already sent previously' });
    }

    await db.query(
      `INSERT INTO shop_inquiries 
       (product_id, shop_owner_id, user_id, user_name, user_mobile, user_location) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [product_id, shop_owner_id, req.user.userId, user.full_name, user.mobile_number, user.location || 'Unknown']
    );

    res.status(201).json({ success: true, message: 'Inquiry sent successfully' });
  } catch (err) {
    console.error('Error sending inquiry:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET INQUIRIES (FOR OWNER) ─────────────────────────────────────────────
// GET /api/shop/inquiries
router.get('/inquiries', authMiddleware, requireShopOwner, async (req, res) => {
  try {
    const query = `
      SELECT i.*, p.name as product_name, p.image_url as product_image
      FROM shop_inquiries i
      JOIN shop_products p ON i.product_id = p.id
      WHERE i.shop_owner_id = ?
      ORDER BY i.created_at DESC
    `;
    const [inquiries] = await db.query(query, [req.user.userId]);
    res.json({ success: true, inquiries });
  } catch (err) {
    console.error('Error fetching inquiries:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
