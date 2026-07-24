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
