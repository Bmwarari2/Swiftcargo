import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/referral
 * Returns the user's referral code, stats, and full referred-user list
 * with per-person progress tracking (signed_up, first_order_placed).
 */
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;

    const user = db.prepare('SELECT referral_code, wallet_balance FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Overall stats
    const stats = db.prepare(`
      SELECT
        COUNT(*)                                                      AS total_referrals,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)        AS completed_referrals,
        SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END)        AS pending_referrals,
        SUM(CASE WHEN status = 'completed' THEN reward_amount ELSE 0 END) AS total_earned
      FROM referrals WHERE referrer_id = ?
    `).get(userId);

    // Per-referral detail with progress flags
    const referredUsers = db.prepare(`
      SELECT
        r.id,
        r.referee_id,
        r.status,
        r.reward_amount,
        r.created_at        AS referred_at,
        r.completed_at,
        u.name              AS referee_name,
        u.email             AS referee_email,
        u.created_at        AS referee_joined_at,
        COUNT(o.id)         AS orders_count
      FROM referrals r
      LEFT JOIN users  u ON r.referee_id = u.id
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
          total_referrals:     stats.total_referrals     || 0,
          completed_referrals: stats.completed_referrals || 0,
          pending_referrals:   stats.pending_referrals   || 0,
          total_earned:        stats.total_earned        || 0
        }
      },
      referred_users: referredUsers.map(ru => ({
        id:               ru.id,
        referee_id:       ru.referee_id,
        referee_name:     ru.referee_name  || 'Unknown',
        referee_email:    ru.referee_email || '',
        referred_at:      ru.referred_at,
        referee_joined_at: ru.referee_joined_at,
        // Progress steps
        signed_up:        true,                              // always true if row exists
        first_order_placed: ru.orders_count > 0,
        orders_count:     ru.orders_count || 0,
        // Reward
        reward_status:    ru.status,
        reward_amount:    ru.reward_amount,
        completed_at:     ru.completed_at || null
      }))
    });
  } catch (error) {
    console.error('Get referral error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch referral information' });
  }
});

/**
 * GET /api/referral/history  (paginated)
 */
router.get('/history', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 10;

    const total = db.prepare('SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?').get(userId).count;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    const referrals = db.prepare(`
      SELECT
        r.id,
        r.referee_id,
        r.status,
        r.reward_amount,
        r.created_at        AS referred_at,
        r.completed_at,
        u.name              AS referee_name,
        u.email             AS referee_email,
        u.created_at        AS referee_joined_at,
        COUNT(o.id)         AS orders_count
      FROM referrals r
      LEFT JOIN users  u ON r.referee_id = u.id
      LEFT JOIN orders o ON r.referee_id = o.user_id
      WHERE r.referrer_id = ?
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    res.json({
      success: true,
      referrals: referrals.map(r => ({
        id:                 r.id,
        referee_id:         r.referee_id,
        referee_name:       r.referee_name  || 'Unknown',
        referee_email:      r.referee_email || '',
        referred_at:        r.referred_at,
        referee_joined_at:  r.referee_joined_at,
        signed_up:          true,
        first_order_placed: r.orders_count > 0,
        orders_count:       r.orders_count || 0,
        reward_status:      r.status,
        reward_amount:      r.reward_amount,
        completed_at:       r.completed_at || null
      })),
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('Get referral history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch referral history' });
  }
});

/**
 * POST /api/referral/validate
 * Public endpoint — check if a referral code is valid before registration.
 */
router.post('/validate', (req, res) => {
  try {
    const db = req.db;
    const { referral_code } = req.body;
    if (!referral_code) return res.status(400).json({ success: false, valid: false, message: 'Code required' });

    const referrer = db.prepare('SELECT id, name FROM users WHERE referral_code = ?')
      .get(referral_code.trim().toUpperCase());

    if (!referrer) {
      return res.json({ success: true, valid: false, message: 'Referral code not found' });
    }
    res.json({ success: true, valid: true, referrer_name: referrer.name });
  } catch (error) {
    console.error('Validate referral error:', error);
    res.status(500).json({ success: false, valid: false, message: 'Validation failed' });
  }
});

export default router;
