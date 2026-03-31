import express from 'express';

const router = express.Router();

/**
 * Simulated exchange rates (in production, these would come from an API)
 * Rates are slightly randomized to simulate live data
 */
function getExchangeRates() {
  // Base rates with slight randomization (±2%)
  const variation = 0.98 + Math.random() * 0.04;

  return {
    rates: {
      'USD_KES': 130.5 * variation,
      'GBP_KES': 164.2 * variation,
      'EUR_KES': 142.8 * variation,
      'KES_USD': (1 / (130.5 * variation)).toFixed(6),
      'KES_GBP': (1 / (164.2 * variation)).toFixed(6),
      'KES_EUR': (1 / (142.8 * variation)).toFixed(6),
      'CNY_KES': 18.2 * variation
    },
    timestamp: new Date().toISOString(),
    source: 'SwiftCargo Exchange Service'
  };
}

/**
 * GET /api/exchange/rates
 * Get current exchange rates
 */
router.get('/rates', (req, res) => {
  try {
    const ratesData = getExchangeRates();

    res.json({
      success: true,
      message: 'Exchange rates retrieved',
      data: {
        USD_KES: parseFloat(ratesData.rates.USD_KES.toFixed(2)),
        GBP_KES: parseFloat(ratesData.rates.GBP_KES.toFixed(2)),
        EUR_KES: parseFloat(ratesData.rates.EUR_KES.toFixed(2)),
        CNY_KES: parseFloat(ratesData.rates.CNY_KES.toFixed(2)),
        timestamp: ratesData.timestamp,
        last_updated: new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })
      }
    });
  } catch (error) {
    console.error('Get rates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch exchange rates'
    });
  }
});

/**
 * POST /api/exchange/convert
 * Convert amount between currencies
 */
router.post('/convert', (req, res) => {
  try {
    const { amount, from_currency, to_currency } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    if (!from_currency || !to_currency) {
      return res.status(400).json({
        success: false,
        message: 'from_currency and to_currency are required'
      });
    }

    const validCurrencies = ['USD', 'GBP', 'EUR', 'KES', 'CNY'];
    if (!validCurrencies.includes(from_currency) || !validCurrencies.includes(to_currency)) {
      return res.status(400).json({
        success: false,
        message: `Valid currencies are: ${validCurrencies.join(', ')}`
      });
    }

    const ratesData = getExchangeRates();
    let rate = 1;

    // Get the appropriate exchange rate
    if (from_currency === 'USD' && to_currency === 'KES') {
      rate = ratesData.rates.USD_KES;
    } else if (from_currency === 'GBP' && to_currency === 'KES') {
      rate = ratesData.rates.GBP_KES;
    } else if (from_currency === 'EUR' && to_currency === 'KES') {
      rate = ratesData.rates.EUR_KES;
    } else if (from_currency === 'CNY' && to_currency === 'KES') {
      rate = ratesData.rates.CNY_KES;
    } else if (from_currency === 'KES' && to_currency === 'USD') {
      rate = parseFloat(ratesData.rates.KES_USD);
    } else if (from_currency === 'KES' && to_currency === 'GBP') {
      rate = parseFloat(ratesData.rates.KES_GBP);
    } else if (from_currency === 'KES' && to_currency === 'EUR') {
      rate = parseFloat(ratesData.rates.KES_EUR);
    } else if (from_currency === to_currency) {
      rate = 1;
    } else {
      // Handle indirect conversions
      if (from_currency === 'USD' && to_currency === 'GBP') {
        rate = ratesData.rates.USD_KES * parseFloat(ratesData.rates.KES_GBP);
      } else if (from_currency === 'GBP' && to_currency === 'USD') {
        rate = ratesData.rates.GBP_KES * parseFloat(ratesData.rates.KES_USD);
      } else if (from_currency === 'USD' && to_currency === 'EUR') {
        rate = ratesData.rates.USD_KES * parseFloat(ratesData.rates.KES_EUR);
      } else if (from_currency === 'EUR' && to_currency === 'USD') {
        rate = ratesData.rates.EUR_KES * parseFloat(ratesData.rates.KES_USD);
      } else if (from_currency === 'GBP' && to_currency === 'EUR') {
        rate = ratesData.rates.GBP_KES * parseFloat(ratesData.rates.KES_EUR);
      } else if (from_currency === 'EUR' && to_currency === 'GBP') {
        rate = ratesData.rates.EUR_KES * parseFloat(ratesData.rates.KES_GBP);
      } else {
        return res.status(400).json({
          success: false,
          message: 'Conversion not supported'
        });
      }
    }

    const convertedAmount = (amount * rate).toFixed(2);

    res.json({
      success: true,
      conversion: {
        amount: amount,
        from_currency: from_currency,
        to_currency: to_currency,
        rate: parseFloat(rate.toFixed(6)),
        converted_amount: parseFloat(convertedAmount),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Convert error:', error);
    res.status(500).json({
      success: false,
      message: 'Currency conversion failed'
    });
  }
});

export default router;
