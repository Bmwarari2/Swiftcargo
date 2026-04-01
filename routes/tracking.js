import express from 'express';
import { authMiddleware, isAdmin, optionalAuth } from '../middleware/auth.js';
import { sendInAppNotification } from '../utils/notifications.js';

const router = express.Router();

/**
 * GET /api/tracking/:trackingNumber
 * Public tracking endpoint (no authentication required)
 */
router.get('/:trackingNumber', optionalAuth, (req, res) => {
  try {
    const db = req.db;
    const { trackingNumber } = req.params;

    const order = db.prepare(`
      SELECT
        id, user_id, tracking_number, retailer, market, status,
        description, weight_kg, dimensions_json, shipping_speed,
        insurance, declared_value, estimated_cost, actual_cost,
        customs_duty, created_at, updated_at
      FROM orders WHERE tracking_number = ?
    `).get(trackingNumber);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Tracking number not found'
      });
    }

    // Get associated packages
    const packages = db.prepare(`
      SELECT * FROM packages WHERE order_id = ?
    `).all(order.id);

    res.json({
      success: true,
      tracking: {
        ...order,
        dimensions_json: order.dimensions_json ? JSON.parse(order.dimensions_json) : null,
        packages
      }
    });
  } catch (error) {
    console.error('Tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tracking information'
    });
  }
});

/**
 * GET /api/tracking/user/packages
 * Get all user's packages with current status
 */
router.get('/user/packages', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;

    let query = `
      SELECT p.*, o.tracking_number, o.retailer, o.market
      FROM packages p
      JOIN orders o ON p.order_id = o.id
      WHERE p.user_id = ?
    `;

    let countQuery = 'SELECT COUNT(*) as count FROM packages WHERE user_id = ?';
    const params = [userId];

    if (status) {
      query += ' AND p.status = ?';
      countQuery += ' AND status = ?';
      params.push(status);
    }

    // Get total count
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const offset = (page - 1) * limit;
    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    const packages = db.prepare(query).all(...params, limit, offset);

    res.json({
      success: true,
      packages,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get packages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch packages'
    });
  }
});

/**
 * PUT /api/tracking/:id/status
 * Update package status (admin only)
 */
router.put('/:id/status', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const { status, warehouse_location } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const validStatuses = ['pending', 'received', 'consolidating', 'in_transit', 'customs', 'out_for_delivery', 'delivered', 'lost'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    // Get package details
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(id);
    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    // Update package
    const updates = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [status];

    if (warehouse_location) {
      updates.push('warehouse_location = ?');
      params.push(warehouse_location);
    }

    if (status === 'received') {
      updates.push('received_at = CURRENT_TIMESTAMP');
    }

    params.push(id);

    const query = `UPDATE packages SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...params);

    // Get order details for notification
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(pkg.order_id);

    // Send notification to customer
    sendInAppNotification(pkg.user_id, `Package status updated to ${status}. Tracking: ${order.tracking_number}`);

    const updatedPackage = db.prepare('SELECT * FROM packages WHERE id = ?').get(id);

    res.json({
      success: true,
      message: 'Package status updated successfully',
      package: updatedPackage
    });
  } catch (error) {
    console.error('Update package status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update package status'
    });
  }
});

export default router;
