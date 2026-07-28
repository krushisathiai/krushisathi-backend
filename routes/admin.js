const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { adminMiddleware } = require('../middleware/auth');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@krushisathi.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@2024';

// ─── ADMIN LOGIN ──────────────────────────────────────────────────────────────
// POST /api/admin/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    let isMatch = false;
    let adminInfo = null;

    // Check env static credentials first
    if (cleanEmail === ADMIN_EMAIL.trim().toLowerCase() && cleanPassword === ADMIN_PASSWORD) {
      isMatch = true;
      adminInfo = { email: cleanEmail, role: 'admin', name: 'Krushi Sathi Admin' };
    } else {
      // Check database users table for role = 'admin'
      const [users] = await db.query('SELECT * FROM users WHERE LOWER(email) = ? AND role = ?', [cleanEmail, 'admin']);
      if (users.length > 0) {
        const user = users[0];
        const validPassword = await bcrypt.compare(cleanPassword, user.password);
        if (validPassword) {
          isMatch = true;
          adminInfo = { id: user.id, email: user.email, role: 'admin', name: user.full_name || 'Admin User' };
        }
      }
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid admin email or password' });
    }

    const token = jwt.sign(
      { email: adminInfo.email, isAdmin: true, role: 'admin', id: adminInfo.id },
      process.env.JWT_SECRET || 'royal_shetkari_super_secret_key_2024',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Admin login successful',
      token,
      admin: adminInfo
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── ADMIN DASHBOARD STATS ───────────────────────────────────────────────────
// GET /api/admin/dashboard
router.get('/dashboard', adminMiddleware, async (req, res) => {
  try {
    const [totalUsers] = await db.query('SELECT COUNT(*) as count FROM users');
    const [totalScans] = await db.query('SELECT COUNT(*) as count FROM scans');
    const [diseasesDetected] = await db.query("SELECT COUNT(*) as count FROM scans WHERE disease_name != 'Healthy Plant'");
    const [healthyPlants] = await db.query("SELECT COUNT(*) as count FROM scans WHERE disease_name = 'Healthy Plant'");
    const [totalAlerts] = await db.query('SELECT COUNT(*) as count FROM alerts');
    const [totalQuestions] = await db.query('SELECT COUNT(*) as count FROM expert_questions');
    const [pendingQuestions] = await db.query('SELECT COUNT(*) as count FROM expert_questions WHERE answer IS NULL');

    // Recent users (last 5)
    const [recentUsers] = await db.query(
      'SELECT id, full_name, mobile_number, email, created_at FROM users ORDER BY created_at DESC LIMIT 5'
    );

    // Recent scans (last 5)
    const [recentScans] = await db.query(
      `SELECT s.id, s.crop_name, s.disease_name, s.severity, s.scanned_at, u.full_name as user_name
       FROM scans s JOIN users u ON s.user_id = u.id
       ORDER BY s.scanned_at DESC LIMIT 5`
    );

    // Disease distribution
    const [diseaseDistribution] = await db.query(
      `SELECT disease_name, COUNT(*) as count FROM scans
       WHERE disease_name IS NOT NULL
       GROUP BY disease_name ORDER BY count DESC LIMIT 5`
    );

    // Monthly scan count (last 6 months)
    const [monthlyScanData] = await db.query(
      `SELECT TO_CHAR(scanned_at, 'YYYY-MM') as month, COUNT(*) as count
       FROM scans
       WHERE scanned_at >= NOW() - INTERVAL '6 months'
       GROUP BY month ORDER BY month ASC`
    );

    res.json({
      success: true,
      stats: {
        total_users: totalUsers[0].count,
        total_scans: totalScans[0].count,
        diseases_detected: diseasesDetected[0].count,
        healthy_plants: healthyPlants[0].count,
        total_alerts: totalAlerts[0].count,
        total_questions: totalQuestions[0].count,
        pending_questions: pendingQuestions[0].count,
      },
      recent_users: recentUsers,
      recent_scans: recentScans,
      disease_distribution: diseaseDistribution,
      monthly_scan_data: monthlyScanData,
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET ALL USERS ────────────────────────────────────────────────────────────
// GET /api/admin/users
router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];

    if (search) {
      whereClause = 'WHERE full_name LIKE ? OR mobile_number LIKE ? OR email LIKE ?';
      params = [`%${search}%`, `%${search}%`, `%${search}%`];
    }

    const [users] = await db.query(
      `SELECT id, full_name, mobile_number, email, is_verified, location, farm_size, main_crop, created_at
       FROM users ${whereClause}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [total] = await db.query(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    );

    // Get scan count per user
    const userIds = users.map(u => u.id);
    let scanCounts = {};
    if (userIds.length > 0) {
      const [scanData] = await db.query(
        `SELECT user_id, COUNT(*) as count FROM scans WHERE user_id IN (${userIds.map(() => '?').join(',')}) GROUP BY user_id`,
        userIds
      );
      scanData.forEach(s => { scanCounts[s.user_id] = s.count; });
    }

    const usersWithStats = users.map(u => ({ ...u, scan_count: scanCounts[u.id] || 0 }));

    res.json({
      success: true,
      users: usersWithStats,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total[0].count / limit),
        total_users: total[0].count,
        per_page: limit,
      }
    });
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DELETE USER ──────────────────────────────────────────────────────────────
// DELETE /api/admin/users/:id
router.delete('/users/:id', adminMiddleware, async (req, res) => {
  try {
    const [users] = await db.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET ALL SCANS ────────────────────────────────────────────────────────────
// GET /api/admin/scans
router.get('/scans', adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const severity = req.query.severity || '';
    const offset = (page - 1) * limit;

    let conditions = [];
    let params = [];

    if (search) {
      conditions.push('(s.crop_name LIKE ? OR s.disease_name LIKE ? OR u.full_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (severity) {
      conditions.push('s.severity = ?');
      params.push(severity);
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [scans] = await db.query(
      `SELECT s.id, s.crop_name, s.disease_name, s.severity, s.confidence_score, s.image_url, s.scanned_at,
              u.full_name as user_name, u.mobile_number as user_mobile
       FROM scans s JOIN users u ON s.user_id = u.id
       ${whereClause}
       ORDER BY s.scanned_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [total] = await db.query(
      `SELECT COUNT(*) as count FROM scans s JOIN users u ON s.user_id = u.id ${whereClause}`,
      params
    );

    res.json({
      success: true,
      scans,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total[0].count / limit),
        total_scans: total[0].count,
        per_page: limit,
      }
    });
  } catch (err) {
    console.error('Admin get scans error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DELETE SCAN ──────────────────────────────────────────────────────────────
// DELETE /api/admin/scans/:id
router.delete('/scans/:id', adminMiddleware, async (req, res) => {
  try {
    const [scans] = await db.query('SELECT id FROM scans WHERE id = ?', [req.params.id]);
    if (scans.length === 0) {
      return res.status(404).json({ success: false, message: 'Scan not found' });
    }
    await db.query('DELETE FROM scans WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Scan deleted successfully' });
  } catch (err) {
    console.error('Admin delete scan error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET ALL ALERTS ───────────────────────────────────────────────────────────
// GET /api/admin/alerts
router.get('/alerts', adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const [alerts] = await db.query(
      `SELECT a.*, u.full_name as user_name FROM alerts a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [total] = await db.query('SELECT COUNT(*) as count FROM alerts');

    res.json({
      success: true,
      alerts,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total[0].count / limit),
        total_alerts: total[0].count,
        per_page: limit,
      }
    });
  } catch (err) {
    console.error('Admin get alerts error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── CREATE ALERT ─────────────────────────────────────────────────────────────
// POST /api/admin/alerts
router.post('/alerts', adminMiddleware, async (req, res) => {
  try {
    const { title, message, type, user_id, scheduled_at } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    const [result] = await db.query(
      'INSERT INTO alerts (title, message, type, user_id, scheduled_at) VALUES (?, ?, ?, ?, ?)',
      [title, message, type || 'general', user_id || null, scheduled_at || null]
    );

    const [alert] = await db.query('SELECT * FROM alerts WHERE id = ?', [result.insertId]);

    res.status(201).json({ success: true, message: 'Alert created successfully', alert: alert[0] });
  } catch (err) {
    console.error('Admin create alert error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DELETE ALERT ─────────────────────────────────────────────────────────────
// DELETE /api/admin/alerts/:id
router.delete('/alerts/:id', adminMiddleware, async (req, res) => {
  try {
    const [alerts] = await db.query('SELECT id FROM alerts WHERE id = ?', [req.params.id]);
    if (alerts.length === 0) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }
    await db.query('DELETE FROM alerts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Alert deleted successfully' });
  } catch (err) {
    console.error('Admin delete alert error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET ALL EXPERT QUESTIONS ─────────────────────────────────────────────────
// GET /api/admin/expert-questions
router.get('/expert-questions', adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status || ''; // 'answered' | 'pending'
    const offset = (page - 1) * limit;

    let whereClause = '';
    if (status === 'pending') whereClause = 'WHERE eq.answer IS NULL';
    else if (status === 'answered') whereClause = 'WHERE eq.answer IS NOT NULL';

    const [questions] = await db.query(
      `SELECT eq.*, u.full_name as user_name, u.mobile_number as user_mobile
       FROM expert_questions eq JOIN users u ON eq.user_id = u.id
       ${whereClause}
       ORDER BY eq.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [total] = await db.query(
      `SELECT COUNT(*) as count FROM expert_questions eq ${whereClause}`
    );

    res.json({
      success: true,
      questions,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total[0].count / limit),
        total_questions: total[0].count,
        per_page: limit,
      }
    });
  } catch (err) {
    console.error('Admin get expert questions error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── ANSWER EXPERT QUESTION ───────────────────────────────────────────────────
// PUT /api/admin/expert-questions/:id/answer
router.put('/expert-questions/:id/answer', adminMiddleware, async (req, res) => {
  try {
    const { answer, answered_by } = req.body;

    if (!answer) {
      return res.status(400).json({ success: false, message: 'Answer is required' });
    }

    const [questions] = await db.query('SELECT id FROM expert_questions WHERE id = ?', [req.params.id]);
    if (questions.length === 0) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    await db.query(
      'UPDATE expert_questions SET answer = ?, answered_by = ?, answered_at = NOW() WHERE id = ?',
      [answer, answered_by || 'Admin', req.params.id]
    );

    const [updated] = await db.query('SELECT * FROM expert_questions WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'Question answered successfully', question: updated[0] });
  } catch (err) {
    console.error('Admin answer question error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── ADD CROP DISEASE (ADMIN) ──────────────────────────────────────────────────
// POST /api/admin/diseases
router.post('/diseases', adminMiddleware, async (req, res) => {
  try {
    const { crop_name, disease_name, symptoms, treatment, prevention, severity_level = 'Medium' } = req.body;
    if (!crop_name || !disease_name) {
      return res.status(400).json({ success: false, message: 'Crop name and disease name are required' });
    }

    const [result] = await db.query(
      'INSERT INTO crop_diseases (crop_name, disease_name, symptoms, treatment, prevention, severity_level) VALUES (?, ?, ?, ?, ?, ?)',
      [crop_name.trim(), disease_name.trim(), symptoms || '', treatment || '', prevention || '', severity_level]
    );

    res.status(201).json({
      success: true,
      message: 'Disease added successfully',
      disease_id: result.insertId,
    });
  } catch (err) {
    console.error('Admin add disease error:', err);
    res.status(500).json({ success: false, message: 'Failed to add disease' });
  }
});

// ─── UPDATE CROP DISEASE (ADMIN) ───────────────────────────────────────────────
// PUT /api/admin/diseases/:id
router.put('/diseases/:id', adminMiddleware, async (req, res) => {
  try {
    const { crop_name, disease_name, symptoms, treatment, prevention, severity_level } = req.body;

    await db.query(
      'UPDATE crop_diseases SET crop_name=?, disease_name=?, symptoms=?, treatment=?, prevention=?, severity_level=? WHERE id=?',
      [crop_name, disease_name, symptoms, treatment, prevention, severity_level, req.params.id]
    );

    res.json({ success: true, message: 'Disease updated successfully' });
  } catch (err) {
    console.error('Admin update disease error:', err);
    res.status(500).json({ success: false, message: 'Failed to update disease' });
  }
});

// ─── DELETE CROP DISEASE (ADMIN) ───────────────────────────────────────────────
// DELETE /api/admin/diseases/:id
router.delete('/diseases/:id', adminMiddleware, async (req, res) => {
  try {
    await db.query('DELETE FROM crop_diseases WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Disease deleted successfully' });
  } catch (err) {
    console.error('Admin delete disease error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete disease' });
  }
});

// ─── GET UREA REQUESTS (ADMIN) ────────────────────────────────────────────────
// GET /api/admin/urea-requests
router.get('/urea-requests', adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status || '';
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];
    if (status) {
      whereClause = 'WHERE status = ?';
      params.push(status);
    }

    const [requests] = await db.query(
      `SELECT ur.*, u.email as user_email
       FROM urea_requests ur LEFT JOIN users u ON ur.user_id = u.id
       ${whereClause}
       ORDER BY ur.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [total] = await db.query(`SELECT COUNT(*) as count FROM urea_requests ${whereClause}`, params);

    res.json({
      success: true,
      requests,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total[0].count / limit),
        total_requests: total[0].count,
        per_page: limit,
      }
    });
  } catch (err) {
    console.error('Admin get urea requests error:', err);
    res.status(500).json({ success: false, message: 'Failed to load urea requests' });
  }
});

// ─── UPDATE UREA REQUEST STATUS (ADMIN) ────────────────────────────────────────
// PUT /api/admin/urea-requests/:id/status
router.put('/urea-requests/:id/status', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    await db.query('UPDATE urea_requests SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true, message: `Request status updated to ${status}` });
  } catch (err) {
    console.error('Admin update urea request error:', err);
    res.status(500).json({ success: false, message: 'Failed to update request status' });
  }
});

// ─── DELETE UREA REQUEST (ADMIN) ──────────────────────────────────────────────
// DELETE /api/admin/urea-requests/:id
router.delete('/urea-requests/:id', adminMiddleware, async (req, res) => {
  try {
    await db.query('DELETE FROM urea_requests WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Urea request deleted successfully' });
  } catch (err) {
    console.error('Admin delete urea request error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete request' });
  }
});

// ─── GET SHOP PRODUCTS (ADMIN) ────────────────────────────────────────────────
// GET /api/admin/shop-products
router.get('/shop-products', adminMiddleware, async (req, res) => {
  try {
    const [products] = await db.query(
      `SELECT sp.*, u.full_name as owner_name, u.shop_name, u.shop_location
       FROM shop_products sp JOIN users u ON sp.shop_owner_id = u.id
       ORDER BY sp.created_at DESC`
    );
    res.json({ success: true, products });
  } catch (err) {
    console.error('Admin get shop products error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch shop products' });
  }
});

// ─── DELETE SHOP PRODUCT (ADMIN) ──────────────────────────────────────────────
// DELETE /api/admin/shop-products/:id
router.delete('/shop-products/:id', adminMiddleware, async (req, res) => {
  try {
    await db.query('DELETE FROM shop_products WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Shop product deleted successfully' });
  } catch (err) {
    console.error('Admin delete shop product error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});

module.exports = router;
