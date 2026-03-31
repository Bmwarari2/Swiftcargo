import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/referral
 * Get user's referral code and statistics
 */
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;

    // Get user's referral code
    const user = db.prepare(`
      SELECT referral_code, wallet_balance FROM users WHERE id = ?
    `).get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get referral statistics
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_referrals,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_referrals,
        SUM(CASE WHEN status = 'completed' THEN reward_amount ELSE 0 END) as total_earned
      FROM referrals WHERE referrer_id = ?
    `).get(userId);

    // Get list of referred users
    const referredUsers = db.prepare(`
      SELECT
        r.id,
        r.referee_id,
        r.status,
        r.reward_amount,
        r.created_at,
        u.email,
        u.name,
        COUNT(o.id) as orders_count
      FROM referrals r
      LEFT JOIN users u ON r.referee_id = u.id
      LEFT JOIN orders o ON r.referee_id = o.user_id
      WHERE r.referrer_id = ?
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `).all(userId);

    res.json({
      success: true,
      referral: {
        referral_code: user.referral_code,
        current_balance: user.wallet_balance,
        statistics: {
          total_referrals: stats.total_referrals || 0,
          completed_referrals: stats.completed_referrals || 0,
          total_earned: stats.total_earned || 0,
          pending_referrals: (stats.total_referrals || 0) - (stats.completed_referrals || 0)
        }
      },
      referred_users: referredUsers.map(ru => ({
        id: ru.id,
        referee_id: ru.referee_id,
        referee_email: ru.email,
        referee_name: ru.name,
        orders_placed: ru.orders_count,
        reward_status: ru.status,
        reward_amount: ru.reward_amount,
        referred_at: ru.created_at
      }))
    });
  } catch (error) {
    console.error('Get referral error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch referral information'
    });
  }
});

/**
 * POST /api/referral/apply
 * Apply referral code during registration (handled in auth/register)
 * This endpoint verifies a referral code
 */
router.post('/apply', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const { referral_code } = req.body;
    const userId = req.user.id;

    if (!referral_code) {
      return res.status(400).json({
        success: false,
        message: 'Referral code is required'
      });
    }

    // Check if user already has a referrer
    const user = db.prepare('SELECT referred_by FROM users WHERE id = ?').get(userId);
    if (user.referred_by) {
      return res.status(400).json({
        success: false,
        message: 'You have already applied a referral code'
      });
    }

    // Find the referrer
    const referrer = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(referral_code);
    if (!referrer) {
      return res.status(404).json({
        success: false,
        message: 'Invalid referral code'
      });
    }

    // Cannot refer yourself
    if (referrer.id === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot apply your own referral code'
      });
    }

    // Update user with referrer
    db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(referrer.id, userId);

    res.json({
      success: true,
      message: 'Referral code applied successfully',
      referrer_code: referral_code
    });
  } catch (error) {
    console.error('Apply referral error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply referral code'
    });
  }
});

/**
 * GET /api/referral/history
 * Referral history with details
 */
router.get('/history', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Get total count
    const countResult = db.prepare('SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?').get(userId);
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const offset = (page - 1) * limit;
    const referrals = db.prepare(`
      SELECT
        r.id,
        r.referee_id,
        r.status,
        r.reward_amount,
        r.created_at,
        u.email,
        u.name,
        u.created_at as referee_joined_at,
        COUNT(o.id) as orders_count,
        SUM(o.estimated_cost) as total_order_value
      FROM referrals r
      LEFT JOIN users u ON r.referee_id = u.id
      LEFT JOIN orders o ON r.referee_id = o.user_id
      WHERE r.referrer_id = ?
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    res.json({
      success: true,
      referrals: referrals.map(r => ({
        id: r.id,
        referee_id: r.referee_id,
        referee_email: r.email,
        referee_name: r.name,
        referee_joined: r.referee_joined_at,
        orders_placed: r.orders_count || 0,
        total_order_value: r.total_order_value || 0,
        reward_status: r.status,
        reward_amount: r.reward_amount,
        referred_at: r.created_at
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get referral history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch referral history'
    });
  }
});

export default router;
