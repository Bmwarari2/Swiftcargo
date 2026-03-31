import express from 'express';
import { calculateShippingCost } from '../utils/pricing.js';

const router = express.Router();

/**
 * POST /api/pricing/calculate
 * Calculate shipping cost with detailed breakdown
 */
router.post('/calculate', (req, res) => {
  try {
    const {
      weight_kg = 0,
      dimensions,
      market,
      shipping_speed = 'economy',
      insurance = false,
      declared_value = 0
    } = req.body;

    // Validation
    if (!market || !['UK', 'USA', 'China'].includes(market)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid market. Must be UK, USA, or China'
      });
    }

    if (!['economy', 'express'].includes(shipping_speed)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid shipping_speed. Must be economy or express'
      });
    }

    const breakdown = calculateShippingCost({
      weight_kg,
      dimensions,
      market,
      shipping_speed,
      insurance,
      declared_value
    });

    res.json({
      success: true,
      pricing: breakdown
    });
  } catch (error) {
    console.error('Calculate pricing error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate pricing'
    });
  }
});

export default router;
