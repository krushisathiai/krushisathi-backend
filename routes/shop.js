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
    if (file.mimetype.startsWith('image/')) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
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
    
    // Low stock products
    const [lowStockProducts] = await db.query('SELECT id, name, stock_quantity, unit FROM shop_products WHERE shop_owner_id = ? AND stock_quantity <= 10', [req.user.userId]);

    res.json({ 
      success: true, 
      stats: {
        totalProducts: parseInt(totalProductsRow.count),
        outOfStock: parseInt(outOfStockRow.count),
        availableStock: parseInt(availableStockRow.count),
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

    res.status(201).json({ success: true, message: 'Product added successfully', productId: result.insertId });
  } catch (err) {
    console.error('Error adding product:', err);
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

// ─── GET ALL PRODUCTS (FOR ALL USERS) ───────────────────────────────────────
// GET /api/shop/all-products
// This is for normal users to browse products and see shop owner info
router.get('/all-products', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT p.*, u.shop_name, u.shop_location, u.mobile_number 
      FROM shop_products p
      JOIN users u ON p.shop_owner_id = u.id
      ORDER BY p.created_at DESC
    `;
    const [products] = await db.query(query);
    res.json({ success: true, products });
  } catch (err) {
    console.error('Error fetching all products:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
