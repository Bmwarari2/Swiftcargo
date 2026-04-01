import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

/**
 * Generate unique warehouse ID in format SC-XXXX
 */
function generateWarehouseId() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let warehouseId = 'SC-';
  for (let i = 0; i < 4; i++) {
    warehouseId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return warehouseId;
}

/**
 * Generate unique referral code
 */
function generateReferralCode() {
  return `REF${Date.now()}${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
}

/**
 * POST /api/auth/register
 * Register new customer account
 */
router.post('/register', (req, res) => {
  try {
    const { name, email, password, phone, referral_code } = req.body;
    const db = req.db;

    // Validation
    if (!name || !email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, email, password, phone'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Check if email already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Hash password
    const passwordHash = bcrypt.hashSync(password, 10);

    // Generate IDs and codes
    const userId = uuidv4();
    const warehouseId = generateWarehouseId();
    const newReferralCode = generateReferralCode();

    // Check if referral code is valid (if provided)
    let referredBy = null;
    if (referral_code) {
      const referrer = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(referral_code);
      if (referrer) {
        referredBy = referrer.id;
      }
    }

    // Create user
    const insertUser = db.prepare(`
      INSERT INTO users (
        id, email, password, name, phone, role, warehouse_id,
        language_pref, referral_code, referred_by, wallet_balance, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(
      userId,
      email,
      passwordHash,
      name,
      phone,
      'customer',
      warehouseId,
      'en',
      newReferralCode,
      referredBy,
      0,
      1
    );

    // Create wallet for user
    const walletId = uuidv4();
    const insertWallet = db.prepare(`
      INSERT INTO wallet (id, user_id, balance, currency)
      VALUES (?, ?, ?, ?)
    `);
    insertWallet.run(walletId, userId, 0, 'KES');

    // Handle referral if valid code was provided
    if (referredBy) {
      const referralId = uuidv4();
      const insertReferral = db.prepare(`
        INSERT INTO referrals (
          id, referrer_id, referee_id, referral_code, status, reward_amount
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      insertReferral.run(
        referralId,
        referredBy,
        userId,
        referral_code,
        'completed',
        50
      );

      // Add referral credit to referrer's wallet
      const updateReferrerWallet = db.prepare(`
        UPDATE wallet SET balance = balance + 50 WHERE user_id = ?
      `);
      updateReferrerWallet.run(referredBy);

      // Create transaction for referrer
      const transactionId = uuidv4();
      const insertTransaction = db.prepare(`
        INSERT INTO transactions (
          id, user_id, type, amount, currency, payment_method, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertTransaction.run(
        transactionId,
        referredBy,
        'referral_credit',
        50,
        'KES',
        'wallet',
        'completed'
      );
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: userId, email, name, role: 'customer', warehouse_id: warehouseId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: userId,
        email,
        name,
        phone,
        warehouse_id: warehouseId,
        referral_code: newReferralCode,
        role: 'customer'
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const db = req.db;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password required'
      });
    }

    // Find user — only allow active accounts
    const user = db.prepare(`
      SELECT id, email, password, name, role, warehouse_id, language_pref, wallet_balance, referral_code
      FROM users WHERE email = ? AND is_active = 1
    `).get(email);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const passwordMatch = bcrypt.compareSync(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, warehouse_id: user.warehouse_id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        warehouse_id: user.warehouse_id,
        referral_code: user.referral_code,
        language_pref: user.language_pref,
        wallet_balance: user.wallet_balance
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;

    const user = db.prepare(`
      SELECT
        id, email, name, phone, role, warehouse_id, language_pref,
        referral_code, wallet_balance, created_at, updated_at
      FROM users WHERE id = ?
    `).get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authMiddleware, (req, res) => {
  try {
    const { name, phone, language_pref } = req.body;
    const db = req.db;
    const userId = req.user.id;

    // Validation
    if (!name && !phone && !language_pref) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one field to update'
      });
    }

    const updates = [];
    const params = [];

    if (name) {
      updates.push('name = ?');
      params.push(name);
    }

    if (phone) {
      updates.push('phone = ?');
      params.push(phone);
    }

    if (language_pref) {
      updates.push('language_pref = ?');
      params.push(language_pref);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(userId);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...params);

    // Fetch updated user
    const user = db.prepare(`
      SELECT id, email, name, phone, role, warehouse_id, language_pref, wallet_balance
      FROM users WHERE id = ?
    `).get(userId);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

/**
 * PUT /api/auth/password
 * Change password
 */
router.put('/password', authMiddleware, (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const db = req.db;
    const userId = req.user.id;

    // Validation
    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Current and new password required'
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }

    // Get current password hash
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const passwordMatch = bcrypt.compareSync(current_password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const newPasswordHash = bcrypt.hashSync(new_password, 10);

    // Update password
    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      newPasswordHash,
      userId
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

export default router;
