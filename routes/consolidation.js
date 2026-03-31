import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/consolidation
 * Get packages waiting at warehouse for user
 */
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;

    // Get packages that are at warehouse and not yet consolidated
    const packages = db.prepare(`
      SELECT
        p.id,
        p.description,
        p.weight_kg,
        p.received_at,
        p.warehouse_location,
        o.tracking_number,
        o.retailer,
        o.market,
        o.created_at as order_created_at
      FROM packages p
      JOIN orders o ON p.order_id = o.id
      WHERE p.user_id = ?
        AND p.status IN ('received', 'consolidating')
        AND p.is_consolidated = 0
      ORDER BY p.received_at DESC
    `).all(userId);

    // Calculate statistics
    let totalWeight = 0;
    packages.forEach(pkg => {
      if (pkg.weight_kg) totalWeight += pkg.weight_kg;
    });

    res.json({
      success: true,
      packages_waiting: packages.length,
      total_weight_kg: parseFloat(totalWeight.toFixed(2)),
      packages: packages
    });
  } catch (error) {
    console.error('Get consolidation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch consolidation information'
    });
  }
});

/**
 * POST /api/consolidation/request
 * Request consolidation of selected packages
 */
router.post('/request', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { package_ids } = req.body;

    // Validation
    if (!package_ids || !Array.isArray(package_ids) || package_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'package_ids array is required and must not be empty'
      });
    }

    if (package_ids.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'At least 2 packages are required for consolidation'
      });
    }

    // Verify all packages belong to user and are eligible
    const placeholders = package_ids.map(() => '?').join(',');
    const packages = db.prepare(`
      SELECT id, weight_kg FROM packages
      WHERE id IN (${placeholders}) AND user_id = ? AND is_consolidated = 0
    `).all(...package_ids, userId);

    if (packages.length !== package_ids.length) {
      return res.status(400).json({
        success: false,
        message: 'Some packages not found or already consolidated'
      });
    }

    // Calculate total weight
    let totalWeight = 0;
    packages.forEach(pkg => {
      if (pkg.weight_kg) totalWeight += pkg.weight_kg;
    });

    // Create consolidation record (we'll use a virtual consolidation ID)
    const consolidationId = uuidv4();
    const consolidatedWeight = parseFloat(totalWeight.toFixed(2));

    // Mark packages as consolidated
    const updateQuery = `UPDATE packages SET is_consolidated = 1, consolidated_with = ? WHERE id IN (${placeholders})`;
    db.prepare(updateQuery).run(consolidationId, ...package_ids);

    // Update status to consolidating for all packages
    const statusQuery = `UPDATE packages SET status = 'consolidating' WHERE id IN (${placeholders})`;
    db.prepare(statusQuery).run(...package_ids);

    res.status(201).json({
      success: true,
      message: 'Consolidation request created',
      consolidation: {
        consolidation_id: consolidationId,
        packages_count: packages.length,
        total_weight_kg: consolidatedWeight,
        status: 'consolidating',
        created_at: new Date().toISOString(),
        note: 'Your packages are being consolidated at the warehouse. You will be notified once consolidation is complete.'
      }
    });
  } catch (error) {
    console.error('Consolidation request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request consolidation'
    });
  }
});

/**
 * GET /api/consolidation/:id
 * Get consolidation details
 */
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const userId = req.user.id;

    // Get all packages in this consolidation
    const packages = db.prepare(`
      SELECT
        p.id,
        p.description,
        p.weight_kg,
        p.status,
        p.received_at,
        p.warehouse_location,
        o.tracking_number,
        o.retailer,
        o.market
      FROM packages p
      JOIN orders o ON p.order_id = o.id
      WHERE p.user_id = ?
        AND p.consolidated_with = ?
      ORDER BY p.created_at ASC
    `).all(userId, id);

    if (packages.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Consolidation not found'
      });
    }

    // Calculate statistics
    let totalWeight = 0;
    packages.forEach(pkg => {
      if (pkg.weight_kg) totalWeight += pkg.weight_kg;
    });

    // Determine overall status
    const statuses = packages.map(p => p.status);
    let consolidationStatus = 'consolidating';
    if (statuses.every(s => s === 'in_transit')) consolidationStatus = 'in_transit';
    if (statuses.every(s => s === 'out_for_delivery')) consolidationStatus = 'out_for_delivery';
    if (statuses.every(s => s === 'delivered')) consolidationStatus = 'delivered';

    res.json({
      success: true,
      consolidation: {
        consolidation_id: id,
        status: consolidationStatus,
        packages_count: packages.length,
        total_weight_kg: parseFloat(totalWeight.toFixed(2)),
        packages: packages
      }
    });
  } catch (error) {
    console.error('Get consolidation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch consolidation details'
    });
  }
});

export default router;
