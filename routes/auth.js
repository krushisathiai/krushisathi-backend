const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// Helper to generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ─── REGISTER ────────────────────────────────────────────────────────────────
// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { full_name, mobile_number, email, password, role, shop_name, shop_location } = req.body;

    if (!full_name || !mobile_number || !password) {
      return res.status(400).json({ success: false, message: 'Full name, mobile number and password are required' });
    }

    // Check if user already exists
    const [existing] = await db.query('SELECT id FROM users WHERE mobile_number = ?', [mobile_number]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Mobile number already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert user
    const [result] = await db.query(
      'INSERT INTO users (full_name, mobile_number, email, password, role, shop_name, shop_location) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [full_name, mobile_number, email || null, hashedPassword, role || 'user', shop_name || null, shop_location || null]
    );

    // Generate JWT
    const token = jwt.sign(
      { userId: result.insertId, mobile_number },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Fetch created user (without password)
    const [users] = await db.query(
      'SELECT id, full_name, mobile_number, email, role, shop_name, shop_location, is_verified, created_at FROM users WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: users[0],
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { mobile_number, password } = req.body;

    if (!mobile_number || !password) {
      return res.status(400).json({ success: false, message: 'Mobile number and password are required' });
    }

    // Find user by mobile or email
    const [users] = await db.query('SELECT * FROM users WHERE mobile_number = ? OR email = ?', [mobile_number, mobile_number]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = users[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid mobile number or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, mobile_number: user.mobile_number },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Return user without password
    const { password: _, otp: __, otp_expires_at: ___, ...userData } = user;

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: userData,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { mobile_number } = req.body;

    if (!mobile_number) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    const [users] = await db.query('SELECT id, full_name FROM users WHERE mobile_number = ?', [mobile_number]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'No account found with this mobile number' });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.query(
      'UPDATE users SET otp = ?, otp_expires_at = ? WHERE mobile_number = ?',
      [otp, otpExpiry, mobile_number]
    );

    // In production, send OTP via SMS. For now, return it in response (dev mode)
    console.log(`OTP for ${mobile_number}: ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent successfully to your mobile number',
      // Remove this in production:
      dev_otp: otp,
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { mobile_number, otp, new_password } = req.body;

    if (!mobile_number || !otp || !new_password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const [users] = await db.query(
      'SELECT id, otp, otp_expires_at FROM users WHERE mobile_number = ?',
      [mobile_number]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];

    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 12);
    await db.query(
      'UPDATE users SET password = ?, otp = NULL, otp_expires_at = NULL WHERE mobile_number = ?',
      [hashedPassword, mobile_number]
    );

    res.json({ success: true, message: 'Password reset successfully. Please login with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── GET PROFILE ──────────────────────────────────────────────────────────────
// GET /api/auth/profile (protected)
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [users] = await db.query(
      'SELECT id, full_name, mobile_number, email, role, shop_name, shop_location, is_verified, profile_image, location, farm_size, main_crop, soil_type, sowing_date, created_at FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, user: users[0] });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── UPDATE PROFILE ───────────────────────────────────────────────────────────
// PUT /api/auth/profile (protected)
router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const { full_name, mobile_number, email, shop_name, shop_location } = req.body;
    
    await db.query(
      'UPDATE users SET full_name = ?, mobile_number = ?, email = ?, shop_name = ?, shop_location = ? WHERE id = ?',
      [full_name, mobile_number, email || null, shop_name || null, shop_location || null, decoded.userId]
    );

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
// PUT /api/auth/change-password (protected)
router.put('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { old_password, new_password } = req.body;

    if (!old_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Both old and new passwords are required' });
    }

    const [users] = await db.query('SELECT password FROM users WHERE id = ?', [decoded.userId]);
    if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(old_password, users[0].password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect old password' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, decoded.userId]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DELETE ACCOUNT ──────────────────────────────────────────────────────────
// DELETE /api/auth/delete (protected)
router.delete('/delete', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const [result] = await db.query('DELETE FROM users WHERE id = ?', [decoded.userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    console.error('Delete account error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
