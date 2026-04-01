import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { calculateShippingCost } from '../utils/pricing.js';

const router = express.Router();

/**
 * Generate tracking number in format SC-YYYYMMDD-XXXX
 */
function generateTrackingNumber() {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `SC-${date}-${random}`;
}

/**
 * GET /api/orders
 * List user's orders with pagination and filtering
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

    if (status) {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(status);
    }

    if (market) {
      query += ' AND market = ?';
      countQuery += ' AND market = ?';
      params.push(market);
    }

    // Get total count
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const offset = (page - 1) * limit;
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const orders = db.prepare(query).all(...params, limit, offset);

    res.json({
      success: true,
      orders: orders.map(order => ({
        ...order,
        dimensions_json: order.dimensions_json ? JSON.parse(order.dimensions_json) : null
      })),
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
 * POST /api/orders
 * Create new order
 */
router.post('/', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const {
      retailer,
      market,
      description,
      weight_kg,
      dimensions,
      shipping_speed,
      insurance,
      declared_value
    } = req.body;

    // Validation
    if (!retailer || !market || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: retailer, market, description'
      });
    }

    if (!['UK', 'USA', 'China'].includes(market)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid market. Must be UK, USA, or China'
      });
    }

    const speed = shipping_speed || 'economy';
    if (!['economy', 'express'].includes(speed)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid shipping speed. Must be economy or express'
      });
    }

    // Calculate estimated cost
    const costBreakdown = calculateShippingCost({
      weight_kg: weight_kg || 0,
      dimensions: dimensions,
      market,
      shipping_speed: speed,
      insurance: insurance || false,
      declared_value: declared_value || 0
    });

    const orderId = uuidv4();
    const trackingNumber = generateTrackingNumber();

    // Create order
    const insertOrder = db.prepare(`
      INSERT INTO orders (
        id, user_id, tracking_number, retailer, market, status,
        description, weight_kg, dimensions_json, shipping_speed,
        insurance, declared_value, estimated_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertOrder.run(
      orderId,
      userId,
      trackingNumber,
      retailer,
      market,
      'pending',
      description,
      weight_kg || null,
      dimensions ? JSON.stringify(dimensions) : null,
      speed,
      insurance ? 1 : 0,
      declared_value || 0,
      costBreakdown.total
    );

    // Create package entry
    const packageId = uuidv4();
    const insertPackage = db.prepare(`
      INSERT INTO packages (
        id, order_id, user_id, description, weight_kg, status
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertPackage.run(
      packageId,
      orderId,
      userId,
      description,
      weight_kg || null,
      'pending'
    );

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: {
        id: orderId,
        tracking_number: trackingNumber,
        retailer,
        market,
        description,
        weight_kg,
        dimensions,
        shipping_speed: speed,
        insurance,
        declared_value,
        status: 'pending',
        cost_breakdown: costBreakdown
      }
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order'
    });
  }
});

/**
 * GET /api/orders/:id
 * Get order details
 */
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const userId = req.user.id;

    const order = db.prepare(`
      SELECT * FROM orders WHERE id = ? AND user_id = ?
    `).get(id, userId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get associated packages
    const packages = db.prepare(`
      SELECT * FROM packages WHERE order_id = ?
    `).all(id);

    res.json({
      success: true,
      order: {
        ...order,
        dimensions_json: order.dimensions_json ? JSON.parse(order.dimensions_json) : null
      },
      packages
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order'
    });
  }
});

/**
 * PUT /api/orders/:id
 * Update order (admin only)
 */
router.put('/:id', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const { status, actual_cost, customs_duty } = req.body;

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const updates = [];
    const params = [];

    if (status) {
      if (!['pending', 'received_at_warehouse', 'consolidating', 'in_transit', 'customs', 'out_for_delivery', 'delivered', 'cancelled'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }
      updates.push('status = ?');
      params.push(status);
    }

    if (actual_cost !== undefined) {
      updates.push('actual_cost = ?');
      params.push(actual_cost);
    }

    if (customs_duty !== undefined) {
      updates.push('customs_duty = ?');
      params.push(customs_duty);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one field to update'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const query = `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...params);

    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);

    res.json({
      success: true,
      message: 'Order updated successfully',
      order: {
        ...updatedOrder,
        dimensions_json: updatedOrder.dimensions_json ? JSON.parse(updatedOrder.dimensions_json) : null
      }
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order'
    });
  }
});

export default router;
