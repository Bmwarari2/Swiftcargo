import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { calculateShippingCost } from '../utils/pricing.js';

const router = express.Router();

function generateTrackingNumber() {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `SC-${date}-${random}`;
}

/**
 * GET /api/orders
 */
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const market = req.query.market;

    let query = 'SELECT * FROM orders WHERE user_id = ?';
    let countQuery = 'SELECT COUNT(*) as count FROM orders WHERE user_id = ?';
    const params = [userId];

    if (status) { query += ' AND status = ?'; countQuery += ' AND status = ?'; params.push(status); }
    if (market) { query += ' AND market = ?'; countQuery += ' AND market = ?'; params.push(market); }

    const total = db.prepare(countQuery).get(...params).count;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const orders = db.prepare(query).all(...params, limit, offset);

    res.json({
      success: true,
      orders: orders.map(o => ({ ...o, dimensions_json: o.dimensions_json ? JSON.parse(o.dimensions_json) : null })),
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

/**
 * POST /api/orders
 * Creates order and triggers referral credit if this is the referee's first order.
 */
router.post('/', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { retailer, market, description, weight_kg, dimensions, shipping_speed, insurance, declared_value } = req.body;

    if (!retailer || !market || !description) {
      return res.status(400).json({ success: false, message: 'Missing required fields: retailer, market, description' });
    }
    if (!['UK', 'USA', 'China'].includes(market)) {
      return res.status(400).json({ success: false, message: 'Invalid market. Must be UK, USA, or China' });
    }
    const speed = shipping_speed || 'economy';
    if (!['economy', 'express'].includes(speed)) {
      return res.status(400).json({ success: false, message: 'Invalid shipping speed.' });
    }

    const costBreakdown = calculateShippingCost({
      weight_kg: weight_kg || 0,
      dimensions,
      market,
      shipping_speed: speed,
      insurance: insurance || false,
      declared_value: declared_value || 0
    });

    const orderId = uuidv4();
    const trackingNumber = generateTrackingNumber();

    db.prepare(`
      INSERT INTO orders (
        id, user_id, tracking_number, retailer, market, status,
        description, weight_kg, dimensions_json, shipping_speed,
        insurance, declared_value, estimated_cost
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId, userId, trackingNumber, retailer, market,
      description, weight_kg || null,
      dimensions ? JSON.stringify(dimensions) : null,
      speed, insurance ? 1 : 0, declared_value || 0,
      costBreakdown.total
    );

    db.prepare(`
      INSERT INTO packages (id, order_id, user_id, description, weight_kg, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(uuidv4(), orderId, userId, description, weight_kg || null);

    // ── Referral reward logic ──────────────────────────────────────────────────
    // Check if this user was referred and the referral is still pending
    const pendingReferral = db.prepare(`
      SELECT id, referrer_id FROM referrals
      WHERE referee_id = ? AND status = 'pending'
      LIMIT 1
    `).get(userId);

    if (pendingReferral) {
      // Check this is truly their first order (count before this insert resolves to 1)
      const orderCount = db.prepare(
        'SELECT COUNT(*) as cnt FROM orders WHERE user_id = ?'
      ).get(userId).cnt;

      // orderCount is 1 because the INSERT above already committed
      if (orderCount === 1) {
        const REFERRAL_REWARD = 50;

        // Mark referral as completed
        db.prepare(`
          UPDATE referrals SET status = 'completed', completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(pendingReferral.id);

        // Credit the referrer's wallet_balance column
        db.prepare(`
          UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?
        `).run(REFERRAL_REWARD, pendingReferral.referrer_id);

        // Also update wallet table if it exists
        db.prepare(`
          UPDATE wallet SET balance = balance + ? WHERE user_id = ?
        `).run(REFERRAL_REWARD, pendingReferral.referrer_id);

        // Create transaction record for the referrer
        db.prepare(`
          INSERT INTO transactions (id, user_id, type, amount, currency, payment_method, status, description)
          VALUES (?, ?, 'referral_credit', ?, 'KES', 'wallet', 'completed', ?)
        `).run(
          uuidv4(),
          pendingReferral.referrer_id,
          REFERRAL_REWARD,
          `Referral reward — referred user placed first order`
        );
      }
    }
    // ── End referral logic ────────────────────────────────────────────────────

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: {
        id: orderId,
        tracking_number: trackingNumber,
        retailer, market, description, weight_kg, dimensions,
        shipping_speed: speed, insurance, declared_value,
        status: 'pending',
        cost_breakdown: costBreakdown
      }
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
});

/**
 * GET /api/orders/:id
 */
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const packages = db.prepare('SELECT * FROM packages WHERE order_id = ?').all(req.params.id);
    res.json({
      success: true,
      order: { ...order, dimensions_json: order.dimensions_json ? JSON.parse(order.dimensions_json) : null },
      packages
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order' });
  }
});

/**
 * PUT /api/orders/:id  (admin only)
 */
router.put('/:id', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const { status, actual_cost, customs_duty } = req.body;

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const validStatuses = ['pending','received_at_warehouse','consolidating','in_transit','customs','out_for_delivery','delivered','cancelled'];

    const updates = [];
    const params = [];
    if (status) {
      if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
      updates.push('status = ?'); params.push(status);
    }
    if (actual_cost !== undefined) { updates.push('actual_cost = ?'); params.push(actual_cost); }
    if (customs_duty !== undefined) { updates.push('customs_duty = ?'); params.push(customs_duty); }
    if (!updates.length) return res.status(400).json({ success: false, message: 'Provide at least one field to update' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    res.json({
      success: true,
      message: 'Order updated successfully',
      order: { ...updated, dimensions_json: updated.dimensions_json ? JSON.parse(updated.dimensions_json) : null }
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ success: false, message: 'Failed to update order' });
  }
});

export default router;
