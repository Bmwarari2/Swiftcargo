import express from 'express';
import crypto from 'crypto';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';
import { sendAdminPasswordResetEmail, sendPaymentRequestEmail } from '../utils/email.js';
import { calculateShippingCost } from '../utils/pricing.js';
import { sendInAppNotification } from '../utils/notifications.js';

const router = express.Router();

/**
 * GET /api/admin/users
 * List all users with pagination and search
 */
router.get('/users', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const role = req.query.role;

    let query = `SELECT id, email, name, phone, role, warehouse_id,
                        referral_code, wallet_balance, is_active, created_at
                 FROM users WHERE 1=1`;
    let countQuery = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
    const params = [];

    if (search) {
      const searchTerm = `%${search}%`;
      query += ' AND (email LIKE ? OR name LIKE ? OR phone LIKE ?)';
      countQuery += ' AND (email LIKE ? OR name LIKE ? OR phone LIKE ?)';
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (role) {
      query += ' AND role = ?';
      countQuery += ' AND role = ?';
      params.push(role);
    }

    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);

    const offset = (page - 1) * limit;
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const users = db.prepare(query).all(...params, limit, offset);

    res.json({
      success: true,
      users,
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

/**
 * GET /api/admin/users/search
 * Search customers by email or name (for admin order creation)
 * NOTE: Must be registered BEFORE /users/:id to avoid route conflicts
 */
router.get('/users/search', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    const searchTerm = `%${q}%`;
    const customers = db.prepare(`
      SELECT id, email, name, phone, warehouse_id
      FROM users
      WHERE role = 'customer' AND is_active = 1
        AND (email LIKE ? OR name LIKE ?)
      LIMIT 10
    `).all(searchTerm, searchTerm);

    res.json({ success: true, customers });
  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({ success: false, message: 'Failed to search customers' });
  }
});

/**
 * GET /api/admin/users/:id
 * Get user details with their orders
 */
router.get('/users/:id', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;

    const user = db.prepare(`
      SELECT id, email, name, phone, role, warehouse_id, language_pref,
             referral_code, wallet_balance, is_active, created_at, updated_at
      FROM users WHERE id = ?
    `).get(id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const orders = db.prepare(`
      SELECT id, tracking_number, retailer, market, status,
             estimated_cost, actual_cost, created_at
      FROM orders WHERE user_id = ? ORDER BY created_at DESC
    `).all(id);

    const transactions = db.prepare(`
      SELECT id, type, amount, currency, payment_method, status, created_at
      FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(id);

    // Referral summary for this user
    const referralStats = db.prepare(`
      SELECT
        COUNT(*) AS total_referrals,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_referrals,
        SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END) AS pending_referrals,
        SUM(CASE WHEN status = 'completed' THEN reward_amount ELSE 0 END) AS total_earned
      FROM referrals WHERE referrer_id = ?
    `).get(id);

    res.json({
      success: true,
      user: { ...user, ordersCount: orders.length, orders },
      recentTransactions: transactions,
      referralStats
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user details' });
  }
});

/**
 * PUT /api/admin/users/:id
 * Update user (role, status)
 */
router.put('/users/:id', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const { role, is_active } = req.body;

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updates = [];
    const params = [];

    if (role !== undefined) {
      if (!['customer', 'admin'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      updates.push('role = ?');
      params.push(role);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Provide at least one field to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updatedUser = db.prepare(`
      SELECT id, email, name, phone, role, warehouse_id, is_active FROM users WHERE id = ?
    `).get(id);

    res.json({ success: true, message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

/**
 * GET /api/admin/referrals/stats
 * Summary stats for the admin dashboard referral section.
 * NOTE: registered before /referrals to avoid route conflicts.
 */
router.get('/referrals/stats', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;

    const stats = db.prepare(`
      SELECT
        COUNT(*)                                                           AS total_referrals,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)             AS completed_referrals,
        SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END)             AS pending_referrals,
        SUM(CASE WHEN status = 'completed' THEN reward_amount ELSE 0 END) AS total_rewards_paid
      FROM referrals
    `).get();

    // Top referrers
    const topReferrers = db.prepare(`
      SELECT
        u.id, u.name, u.email, u.referral_code,
        COUNT(r.id)                                                           AS total_referrals,
        SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END)              AS completed_referrals,
        SUM(CASE WHEN r.status = 'completed' THEN r.reward_amount ELSE 0 END) AS total_earned
      FROM users u
      JOIN referrals r ON r.referrer_id = u.id
      GROUP BY u.id
      ORDER BY total_referrals DESC
      LIMIT 10
    `).all();

    res.json({
      success: true,
      stats: {
        total_referrals:    stats.total_referrals    || 0,
        completed_referrals: stats.completed_referrals || 0,
        pending_referrals:  stats.pending_referrals  || 0,
        total_rewards_paid: stats.total_rewards_paid || 0
      },
      top_referrers: topReferrers
    });
  } catch (error) {
    console.error('Get referral stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch referral statistics' });
  }
});

/**
 * GET /api/admin/referrals
 * Paginated list of every referral across all customers, with referrer/referee details.
 */
router.get('/referrals', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const page   = parseInt(req.query.page)   || 1;
    const limit  = parseInt(req.query.limit)  || 20;
    const status = req.query.status; // 'pending' | 'completed'
    const search = req.query.search || ''; // search by referrer name/email

    let where = 'WHERE 1=1';
    const params = [];

    if (status) {
      where += ' AND r.status = ?';
      params.push(status);
    }
    if (search) {
      const s = `%${search}%`;
      where += ' AND (referrer.name LIKE ? OR referrer.email LIKE ? OR referrer.referral_code LIKE ?)';
      params.push(s, s, s);
    }

    const total = db.prepare(
      `SELECT COUNT(*) as c
       FROM referrals r
       JOIN users referrer ON r.referrer_id = referrer.id
       ${where}`
    ).get(...params).c;

    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    const referrals = db.prepare(`
      SELECT
        r.id,
        r.referral_code,
        r.status,
        r.reward_amount,
        r.created_at,
        r.completed_at,
        referrer.id    AS referrer_id,
        referrer.name  AS referrer_name,
        referrer.email AS referrer_email,
        referrer.referral_code AS referrer_code,
        referee.id    AS referee_id,
        referee.name  AS referee_name,
        referee.email AS referee_email,
        referee.created_at AS referee_joined_at,
        (SELECT COUNT(*) FROM orders WHERE user_id = r.referee_id) AS referee_orders_count
      FROM referrals r
      JOIN users referrer ON r.referrer_id = referrer.id
      LEFT JOIN users referee ON r.referee_id = referee.id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      success: true,
      referrals: referrals.map(r => ({
        id:                  r.id,
        referral_code:       r.referral_code,
        status:              r.status,
        reward_amount:       r.reward_amount,
        created_at:          r.created_at,
        completed_at:        r.completed_at || null,
        referrer: {
          id:            r.referrer_id,
          name:          r.referrer_name,
          email:         r.referrer_email,
          referral_code: r.referrer_code
        },
        referee: {
          id:           r.referee_id   || null,
          name:         r.referee_name || 'Unknown',
          email:        r.referee_email || '',
          joined_at:    r.referee_joined_at || null,
          orders_count: r.referee_orders_count || 0,
          first_order_placed: (r.referee_orders_count || 0) > 0
        }
      })),
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('Get referrals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch referrals' });
  }
});

/**
 * GET /api/admin/orders
 * List all orders with filters
 */
router.get('/orders', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const market = req.query.market;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    let query = `
      SELECT o.id, o.tracking_number, o.retailer, o.market, o.status,
             o.estimated_cost, o.actual_cost, o.created_at,
             u.name, u.email
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;

    let countQuery = 'SELECT COUNT(*) as count FROM orders WHERE 1=1';
    const params = [];

    if (status) { query += ' AND o.status = ?'; countQuery += ' AND status = ?'; params.push(status); }
    if (market) { query += ' AND o.market = ?'; countQuery += ' AND market = ?'; params.push(market); }
    if (startDate) { query += ' AND DATE(o.created_at) >= ?'; countQuery += ' AND DATE(created_at) >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND DATE(o.created_at) <= ?'; countQuery += ' AND DATE(created_at) <= ?'; params.push(endDate); }

    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);

    const offset = (page - 1) * limit;
    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    const orders = db.prepare(query).all(...params, limit, offset);

    res.json({
      success: true,
      orders,
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

/**
 * PUT /api/admin/orders/bulk-update
 * Bulk status update for multiple orders
 */
router.put('/orders/bulk-update', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { order_ids, status } = req.body;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'order_ids array is required and must not be empty' });
    }
    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required' });
    }

    const validStatuses = ['pending', 'received_at_warehouse', 'consolidating', 'in_transit', 'customs', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const placeholders = order_ids.map(() => '?').join(',');
    db.prepare(`UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`).run(status, ...order_ids);

    const updatedOrders = db.prepare(`SELECT id, tracking_number, status FROM orders WHERE id IN (${placeholders})`).all(...order_ids);

    res.json({
      success: true,
      message: `Updated ${updatedOrders.length} orders`,
      updated_count: updatedOrders.length,
      orders: updatedOrders
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ success: false, message: 'Failed to bulk update orders' });
  }
});

/**
 * GET /api/admin/stats
 * Dashboard statistics
 */
router.get('/stats', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;

    const userStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN role = 'customer' THEN 1 ELSE 0 END) as customers,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users
      FROM users
    `).get();

    const orderStats = db.prepare(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit,
        AVG(estimated_cost) as avg_estimated_cost,
        SUM(estimated_cost) as total_estimated_value
      FROM orders
    `).get();

    const marketStats = db.prepare(`
      SELECT market, COUNT(*) as count, SUM(estimated_cost) as value
      FROM orders GROUP BY market
    `).all();

    const statusStats = db.prepare(`
      SELECT status, COUNT(*) as count FROM orders GROUP BY status
    `).all();

    const revenueStats = db.prepare(`
      SELECT
        COUNT(*) as total_transactions,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
        SUM(CASE WHEN type = 'deposit' AND status = 'completed' THEN amount ELSE 0 END) as deposits,
        SUM(CASE WHEN type = 'payment' AND status = 'completed' THEN amount ELSE 0 END) as payments
      FROM transactions
    `).get();

    const referralStats = db.prepare(`
      SELECT
        COUNT(*) AS total_referrals,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_referrals,
        SUM(CASE WHEN status = 'completed' THEN reward_amount ELSE 0 END) AS total_rewards_paid
      FROM referrals
    `).get();

    res.json({
      success: true,
      stats: {
        users: userStats,
        orders: orderStats,
        markets: marketStats,
        order_statuses: statusStats,
        revenue: revenueStats,
        referrals: referralStats
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/admin/revenue
 * Revenue report with date filtering
 */
router.get('/revenue', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    let query = `
      SELECT
        DATE(created_at) as date,
        payment_method,
        type,
        COUNT(*) as count,
        SUM(amount) as total
      FROM transactions
      WHERE status = 'completed'
    `;
    const params = [];
    if (startDate) { query += ' AND DATE(created_at) >= ?'; params.push(startDate); }
    if (endDate)   { query += ' AND DATE(created_at) <= ?'; params.push(endDate); }
    query += ' GROUP BY DATE(created_at), payment_method, type ORDER BY date DESC';
    const revenue = db.prepare(query).all(...params);

    let summaryQuery = `
      SELECT
        payment_method,
        SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END) as deposits,
        SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) as payments,
        SUM(amount) as total
      FROM transactions
      WHERE status = 'completed'
    `;
    const summaryParams = [];
    if (startDate) { summaryQuery += ' AND DATE(created_at) >= ?'; summaryParams.push(startDate); }
    if (endDate)   { summaryQuery += ' AND DATE(created_at) <= ?'; summaryParams.push(endDate); }
    summaryQuery += ' GROUP BY payment_method';
    const summary = db.prepare(summaryQuery).all(...summaryParams);

    res.json({ success: true, revenue, summary });
  } catch (error) {
    console.error('Get revenue error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch revenue data' });
  }
});

/**
 * GET /api/admin/revenue/export
 * CSV export of revenue data
 */
router.get('/revenue/export', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    let query = `
      SELECT
        t.id, u.email, u.name,
        DATE(t.created_at) as date,
        TIME(t.created_at) as time,
        t.type, t.amount, t.currency,
        t.payment_method, t.payment_reference, t.status
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE t.status = 'completed'
    `;
    const params = [];
    if (startDate) { query += ' AND DATE(t.created_at) >= ?'; params.push(startDate); }
    if (endDate)   { query += ' AND DATE(t.created_at) <= ?'; params.push(endDate); }
    query += ' ORDER BY t.created_at DESC';
    const transactions = db.prepare(query).all(...params);

    const headers = ['ID','Email','Name','Date','Time','Type','Amount','Currency','Payment Method','Reference','Status'];
    const csvRows = [headers.join(',')];
    transactions.forEach(row => {
      csvRows.push([
        row.id, `"${row.email}"`, `"${row.name}"`,
        row.date, row.time, row.type, row.amount, row.currency,
        row.payment_method, `"${row.payment_reference || ''}"`, row.status
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="revenue-export.csv"');
    res.send(csvRows.join('\n'));
  } catch (error) {
    console.error('Export revenue error:', error);
    res.status(500).json({ success: false, message: 'Failed to export revenue data' });
  }
});

/**
 * GET /api/admin/logs
 * Admin activity logs
 */
router.get('/logs', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const countResult = db.prepare('SELECT COUNT(*) as count FROM admin_logs').get();
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    const logs = db.prepare(`
      SELECT al.id, al.action, al.details, al.created_at,
             u.email as admin_email, u.name as admin_name
      FROM admin_logs al
      LEFT JOIN users u ON al.admin_id = u.id
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    res.json({ success: true, logs, pagination: { page, limit, total, totalPages } });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch logs' });
  }
});

/**
 * POST /api/admin/users/:id/reset-password
 */
router.post('/users/:id/reset-password', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const adminId = req.user.id;

    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);

    const token = crypto.randomBytes(32).toString('hex');
    const tokenId = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(tokenId, user.id, token, expiresAt);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    sendAdminPasswordResetEmail(user.email, user.name, resetLink).catch(err => {
      console.error('Failed to send admin password reset email:', err);
    });

    const logId = uuidv4();
    db.prepare(`INSERT INTO admin_logs (id, admin_id, action, details) VALUES (?, ?, ?, ?)`)
      .run(logId, adminId, 'admin_reset_user_password', JSON.stringify({ user_id: id, user_email: user.email }));

    res.json({ success: true, message: `Password reset email sent to ${user.email}` });
  } catch (error) {
    console.error('Admin reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to send password reset email' });
  }
});

/**
 * GET /api/admin/exchange-rates
 */
router.get('/exchange-rates', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const rates = db.prepare('SELECT currency_pair, rate, updated_at FROM exchange_rates').all();

    const ratesObj = {};
    let latestUpdate = null;
    rates.forEach(r => {
      ratesObj[r.currency_pair] = r.rate;
      if (!latestUpdate || r.updated_at > latestUpdate) latestUpdate = r.updated_at;
    });

    if (rates.length === 0) {
      ratesObj.USD_KES = 130.5;
      ratesObj.GBP_KES = 164.2;
      ratesObj.EUR_KES = 142.8;
      ratesObj.CNY_KES = 18.2;
    }

    res.json({ success: true, rates: ratesObj, updated_at: latestUpdate });
  } catch (error) {
    console.error('Get exchange rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch exchange rates' });
  }
});

/**
 * PUT /api/admin/exchange-rates
 */
router.put('/exchange-rates', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { rates } = req.body;
    const adminId = req.user.id;

    if (!rates || typeof rates !== 'object') {
      return res.status(400).json({ success: false, message: 'rates object is required' });
    }

    const validPairs = ['USD_KES', 'GBP_KES', 'EUR_KES', 'CNY_KES'];
    const upsert = db.prepare(`
      INSERT INTO exchange_rates (currency_pair, rate, updated_by, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(currency_pair)
      DO UPDATE SET rate = excluded.rate, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
    `);

    const updateAll = db.transaction(() => {
      for (const [pair, rate] of Object.entries(rates)) {
        if (!validPairs.includes(pair)) throw new Error(`Invalid currency pair: ${pair}`);
        if (typeof rate !== 'number' || rate <= 0) throw new Error(`Invalid rate for ${pair}: must be a positive number`);
        upsert.run(pair, rate, adminId);
      }
    });
    updateAll();

    const logId = uuidv4();
    db.prepare(`INSERT INTO admin_logs (id, admin_id, action, details) VALUES (?, ?, ?, ?)`)
      .run(logId, adminId, 'update_exchange_rates', JSON.stringify(rates));

    res.json({ success: true, message: 'Exchange rates updated successfully', rates });
  } catch (error) {
    console.error('Set exchange rates error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to update exchange rates' });
  }
});

/**
 * POST /api/admin/orders/create-for-client
 * NOTE: Must be registered BEFORE /orders/:id routes to avoid route conflicts
 */
router.post('/orders/create-for-client', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const adminId = req.user.id;
    const {
      customer_email, customer_name, retailer, market, description,
      weight_kg, dimensions, shipping_speed, insurance, declared_value
    } = req.body;

    if (!customer_email && !customer_name) {
      return res.status(400).json({ success: false, message: 'customer_email or customer_name is required to identify the client' });
    }

    let customer;
    if (customer_email) {
      customer = db.prepare('SELECT id, email, name FROM users WHERE email = ? AND role = ?').get(customer_email, 'customer');
    }
    if (!customer && customer_name) {
      customer = db.prepare('SELECT id, email, name FROM users WHERE name LIKE ? AND role = ?').get(`%${customer_name}%`, 'customer');
    }
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found. Please check the email or name.' });
    }

    if (!retailer || !market || !description) {
      return res.status(400).json({ success: false, message: 'Missing required fields: retailer, market, description' });
    }
    if (!['UK', 'USA', 'China'].includes(market)) {
      return res.status(400).json({ success: false, message: 'Invalid market. Must be UK, USA, or China' });
    }
    const speed = shipping_speed || 'economy';
    if (!['economy', 'express'].includes(speed)) {
      return res.status(400).json({ success: false, message: 'Invalid shipping speed' });
    }

    const costBreakdown = calculateShippingCost({
      weight_kg: weight_kg || 0, dimensions, market,
      shipping_speed: speed, insurance: insurance || false,
      declared_value: declared_value || 0
    });

    const orderId = uuidv4();
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    const trackingNumber = `SC-${date}-${random}`;

    const createOrder = db.transaction(() => {
      db.prepare(`
        INSERT INTO orders (
          id, user_id, tracking_number, retailer, market, status,
          description, weight_kg, dimensions_json, shipping_speed,
          insurance, declared_value, estimated_cost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId, customer.id, trackingNumber, retailer, market, 'pending',
        description, weight_kg || null,
        dimensions ? JSON.stringify(dimensions) : null,
        speed, insurance ? 1 : 0, declared_value || 0, costBreakdown.total
      );

      const packageId = uuidv4();
      db.prepare(`INSERT INTO packages (id, order_id, user_id, description, weight_kg, status) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(packageId, orderId, customer.id, description, weight_kg || null, 'pending');

      const logId = uuidv4();
      db.prepare(`INSERT INTO admin_logs (id, admin_id, action, details) VALUES (?, ?, ?, ?)`)
        .run(logId, adminId, 'create_order_for_client', JSON.stringify({
          order_id: orderId, tracking_number: trackingNumber,
          customer_id: customer.id, customer_email: customer.email
        }));
    });
    createOrder();

    sendInAppNotification(customer.id, `A new order (${trackingNumber}) has been created for you by SwiftCargo.`);

    res.status(201).json({
      success: true,
      message: `Order created for ${customer.name} (${customer.email})`,
      order: {
        id: orderId, tracking_number: trackingNumber,
        customer: { id: customer.id, name: customer.name, email: customer.email },
        retailer, market, description, weight_kg, dimensions,
        shipping_speed: speed, insurance, declared_value,
        status: 'pending', estimated_cost: costBreakdown.total,
        cost_breakdown: costBreakdown
      }
    });
  } catch (error) {
    console.error('Create order for client error:', error);
    res.status(500).json({ success: false, message: 'Failed to create order for client' });
  }
});

/**
 * DELETE /api/admin/orders/:id
 */
router.delete('/orders/:id', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const adminId = req.user.id;

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const deleteOrder = db.transaction(() => {
      db.prepare('DELETE FROM packages WHERE order_id = ?').run(id);
      db.prepare('DELETE FROM orders WHERE id = ?').run(id);
      const logId = uuidv4();
      db.prepare(`INSERT INTO admin_logs (id, admin_id, action, details) VALUES (?, ?, ?, ?)`)
        .run(logId, adminId, 'delete_order', JSON.stringify({
          order_id: id, tracking_number: order.tracking_number, user_id: order.user_id
        }));
    });
    deleteOrder();

    sendInAppNotification(order.user_id, `Order ${order.tracking_number} has been deleted by an administrator.`);
    res.json({ success: true, message: `Order ${order.tracking_number} deleted successfully` });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete order' });
  }
});

/**
 * PUT /api/admin/orders/:id/cancel
 */
router.put('/orders/:id/cancel', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const adminId = req.user.id;
    const { reason } = req.body;

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status === 'delivered') return res.status(400).json({ success: false, message: 'Cannot cancel a delivered order' });
    if (order.status === 'cancelled') return res.status(400).json({ success: false, message: 'Order is already cancelled' });

    const cancelOrder = db.transaction(() => {
      db.prepare(`UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
      db.prepare(`UPDATE packages SET status = 'lost', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`).run(id);
      const logId = uuidv4();
      db.prepare(`INSERT INTO admin_logs (id, admin_id, action, details) VALUES (?, ?, ?, ?)`)
        .run(logId, adminId, 'cancel_order', JSON.stringify({
          order_id: id, tracking_number: order.tracking_number,
          reason: reason || 'No reason provided'
        }));
    });
    cancelOrder();

    sendInAppNotification(order.user_id, `Order ${order.tracking_number} has been cancelled.${reason ? ` Reason: ${reason}` : ''}`);

    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    res.json({
      success: true,
      message: `Order ${order.tracking_number} cancelled successfully`,
      order: { ...updatedOrder, dimensions_json: updatedOrder.dimensions_json ? JSON.parse(updatedOrder.dimensions_json) : null }
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
});

/**
 * POST /api/admin/orders/:id/request-payment
 */
router.post('/orders/:id/request-payment', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const adminId = req.user.id;
    const { amount, notes } = req.body;

    const order = db.prepare(`
      SELECT o.*, u.email, u.name as customer_name
      FROM orders o JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `).get(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const paymentAmount = amount || order.actual_cost || order.estimated_cost;
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ success: false, message: 'A valid payment amount is required. Set actual_cost on the order or provide amount.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const paymentLink = `${frontendUrl}/wallet?pay=${id}&amount=${paymentAmount}`;

    sendPaymentRequestEmail(
      order.email, order.customer_name, order.tracking_number,
      paymentAmount, notes || '', paymentLink
    ).catch(err => { console.error('Failed to send payment request email:', err); });

    sendInAppNotification(
      order.user_id,
      `Payment of KES ${paymentAmount.toLocaleString()} requested for order ${order.tracking_number}.${notes ? ` Note: ${notes}` : ''}`
    );

    const logId = uuidv4();
    db.prepare(`INSERT INTO admin_logs (id, admin_id, action, details) VALUES (?, ?, ?, ?)`)
      .run(logId, adminId, 'request_payment', JSON.stringify({
        order_id: id, tracking_number: order.tracking_number,
        customer_email: order.email, amount: paymentAmount, notes: notes || ''
      }));

    res.json({
      success: true,
      message: `Payment request of KES ${paymentAmount.toLocaleString()} sent to ${order.email}`,
      payment_request: {
        order_id: id, tracking_number: order.tracking_number,
        customer: { email: order.email, name: order.customer_name },
        amount: paymentAmount, currency: 'KES'
      }
    });
  } catch (error) {
    console.error('Request payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to send payment request' });
  }
});

export default router;
