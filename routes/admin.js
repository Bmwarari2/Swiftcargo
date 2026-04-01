import express from 'express';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

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

    let query = 'SELECT id, email, name, phone, role, warehouse_id, wallet_balance, is_active, created_at FROM users WHERE 1=1';
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

    // Get total count
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const offset = (page - 1) * limit;
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const users = db.prepare(query).all(...params, limit, offset);

    res.json({
      success: true,
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
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
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's orders
    const orders = db.prepare(`
      SELECT id, tracking_number, retailer, market, status,
             estimated_cost, actual_cost, created_at
      FROM orders WHERE user_id = ? ORDER BY created_at DESC
    `).all(id);

    // Get wallet transactions
    const transactions = db.prepare(`
      SELECT id, type, amount, currency, payment_method, status, created_at
      FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(id);

    res.json({
      success: true,
      user: {
        ...user,
        ordersCount: orders.length,
        orders
      },
      recentTransactions: transactions
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details'
    });
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
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const updates = [];
    const params = [];

    if (role !== undefined) {
      if (!['customer', 'admin'].includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role'
        });
      }
      updates.push('role = ?');
      params.push(role);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one field to update'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...params);

    const updatedUser = db.prepare(`
      SELECT id, email, name, phone, role, warehouse_id, is_active FROM users WHERE id = ?
    `).get(id);

    res.json({
      success: true,
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
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

    if (status) {
      query += ' AND o.status = ?';
      countQuery += ' AND status = ?';
      params.push(status);
    }

    if (market) {
      query += ' AND o.market = ?';
      countQuery += ' AND market = ?';
      params.push(market);
    }

    if (startDate) {
      query += ' AND DATE(o.created_at) >= ?';
      countQuery += ' AND DATE(created_at) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND DATE(o.created_at) <= ?';
      countQuery += ' AND DATE(created_at) <= ?';
      params.push(endDate);
    }

    // Get total count
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const offset = (page - 1) * limit;
    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    const orders = db.prepare(query).all(...params, limit, offset);

    res.json({
      success: true,
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
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
      return res.status(400).json({
        success: false,
        message: 'order_ids array is required and must not be empty'
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status is required'
      });
    }

    const validStatuses = ['pending', 'received_at_warehouse', 'consolidating', 'in_transit', 'customs', 'out_for_delivery', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const placeholders = order_ids.map(() => '?').join(',');
    const query = `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`;

    db.prepare(query).run(status, ...order_ids);

    const updatedOrders = db.prepare(`
      SELECT id, tracking_number, status FROM orders WHERE id IN (${placeholders})
    `).all(...order_ids);

    res.json({
      success: true,
      message: `Updated ${updatedOrders.length} orders`,
      updated_count: updatedOrders.length,
      orders: updatedOrders
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk update orders'
    });
  }
});

/**
 * GET /api/admin/stats
 * Dashboard statistics
 */
router.get('/stats', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;

    // Total users
    const userStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN role = 'customer' THEN 1 ELSE 0 END) as customers,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users
      FROM users
    `).get();

    // Order statistics
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

    // Orders by market
    const marketStats = db.prepare(`
      SELECT market, COUNT(*) as count, SUM(estimated_cost) as value
      FROM orders
      GROUP BY market
    `).all();

    // Orders by status
    const statusStats = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM orders
      GROUP BY status
    `).all();

    // Revenue statistics
    const revenueStats = db.prepare(`
      SELECT
        COUNT(*) as total_transactions,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
        SUM(CASE WHEN type = 'deposit' AND status = 'completed' THEN amount ELSE 0 END) as deposits,
        SUM(CASE WHEN type = 'payment' AND status = 'completed' THEN amount ELSE 0 END) as payments
      FROM transactions
    `).get();

    res.json({
      success: true,
      stats: {
        users: userStats,
        orders: orderStats,
        markets: marketStats,
        order_statuses: statusStats,
        revenue: revenueStats
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
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

    if (startDate) {
      query += ' AND DATE(created_at) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND DATE(created_at) <= ?';
      params.push(endDate);
    }

    query += ' GROUP BY DATE(created_at), payment_method, type ORDER BY date DESC';

    const revenue = db.prepare(query).all(...params);

    // Get summary
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

    if (startDate) {
      summaryQuery += ' AND DATE(created_at) >= ?';
      summaryParams.push(startDate);
    }

    if (endDate) {
      summaryQuery += ' AND DATE(created_at) <= ?';
      summaryParams.push(endDate);
    }

    summaryQuery += ' GROUP BY payment_method';

    const summary = db.prepare(summaryQuery).all(...summaryParams);

    res.json({
      success: true,
      revenue: revenue,
      summary: summary
    });
  } catch (error) {
    console.error('Get revenue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue data'
    });
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
        t.id,
        u.email,
        u.name,
        DATE(t.created_at) as date,
        TIME(t.created_at) as time,
        t.type,
        t.amount,
        t.currency,
        t.payment_method,
        t.payment_reference,
        t.status
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE t.status = 'completed'
    `;

    const params = [];

    if (startDate) {
      query += ' AND DATE(t.created_at) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND DATE(t.created_at) <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY t.created_at DESC';

    const transactions = db.prepare(query).all(...params);

    // Build CSV
    const headers = ['ID', 'Email', 'Name', 'Date', 'Time', 'Type', 'Amount', 'Currency', 'Payment Method', 'Reference', 'Status'];
    const csvRows = [headers.join(',')];

    transactions.forEach(row => {
      const values = [
        row.id,
        `"${row.email}"`,
        `"${row.name}"`,
        row.date,
        row.time,
        row.type,
        row.amount,
        row.currency,
        row.payment_method,
        `"${row.payment_reference || ''}"`,
        row.status
      ];
      csvRows.push(values.join(','));
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="revenue-export.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Export revenue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export revenue data'
    });
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

    // Get total count
    const countResult = db.prepare('SELECT COUNT(*) as count FROM admin_logs').get();
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const offset = (page - 1) * limit;
    const logs = db.prepare(`
      SELECT al.id, al.action, al.details, al.created_at,
             u.email as admin_email, u.name as admin_name
      FROM admin_logs al
      LEFT JOIN users u ON al.admin_id = u.id
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    res.json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch logs'
    });
  }
});

/**
 * GET /api/admin/exchange-rates
 * Get current admin-set exchange rates
 */
router.get('/exchange-rates', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;

    const rates = db.prepare('SELECT currency_pair, rate, updated_at FROM exchange_rates').all();

    const ratesObj = {};
    let latestUpdate = null;

    rates.forEach((r) => {
      ratesObj[r.currency_pair] = r.rate;
      if (!latestUpdate || r.updated_at > latestUpdate) {
        latestUpdate = r.updated_at;
      }
    });

    // If no rates have been set yet, return the default base rates
    if (rates.length === 0) {
      ratesObj.USD_KES = 130.5;
      ratesObj.GBP_KES = 164.2;
      ratesObj.EUR_KES = 142.8;
      ratesObj.CNY_KES = 18.2;
    }

    res.json({
      success: true,
      rates: ratesObj,
      updated_at: latestUpdate
    });
  } catch (error) {
    console.error('Get exchange rates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch exchange rates'
    });
  }
});

/**
 * PUT /api/admin/exchange-rates
 * Set exchange rates for the day
 */
router.put('/exchange-rates', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { rates } = req.body;
    const adminId = req.user.id;

    if (!rates || typeof rates !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'rates object is required'
      });
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
        if (!validPairs.includes(pair)) {
          throw new Error(`Invalid currency pair: ${pair}`);
        }
        if (typeof rate !== 'number' || rate <= 0) {
          throw new Error(`Invalid rate for ${pair}: must be a positive number`);
        }
        upsert.run(pair, rate, adminId);
      }
    });

    updateAll();

    // Log the action
    const logId = uuidv4();
    db.prepare(`
      INSERT INTO admin_logs (id, admin_id, action, details)
      VALUES (?, ?, ?, ?)
    `).run(logId, adminId, 'update_exchange_rates', JSON.stringify(rates));

    res.json({
      success: true,
      message: 'Exchange rates updated successfully',
      rates
    });
  } catch (error) {
    console.error('Set exchange rates error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update exchange rates'
    });
  }
});

export default router;
