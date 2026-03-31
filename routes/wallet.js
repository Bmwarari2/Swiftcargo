import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/wallet
 * Get user's wallet balance and recent transactions
 */
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;

    // Get wallet
    const wallet = db.prepare(`
      SELECT id, user_id, balance, currency, last_updated
      FROM wallet WHERE user_id = ?
    `).get(userId);

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Get recent transactions
    const transactions = db.prepare(`
      SELECT id, type, amount, currency, payment_method, status, created_at
      FROM transactions WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 5
    `).all(userId);

    res.json({
      success: true,
      wallet,
      recent_transactions: transactions
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet'
    });
  }
});

/**
 * POST /api/wallet/deposit
 * Deposit funds (with payment method placeholders)
 */
router.post('/deposit', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { amount, payment_method, payment_details } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    if (!payment_method) {
      return res.status(400).json({
        success: false,
        message: 'Payment method is required'
      });
    }

    if (!['mpesa', 'stripe', 'paypal'].includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method. Must be mpesa, stripe, or paypal'
      });
    }

    const transactionId = uuidv4();
    let paymentReference = `${payment_method.toUpperCase()}-${transactionId.slice(0, 8)}`;
    let status = 'pending';

    // Create transaction (placeholder for actual payment processing)
    const insertTransaction = db.prepare(`
      INSERT INTO transactions (
        id, user_id, type, amount, currency, payment_method,
        payment_reference, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertTransaction.run(
      transactionId,
      userId,
      'deposit',
      amount,
      'KES',
      payment_method,
      paymentReference,
      status
    );

    // Process based on payment method
    let processingResult = {
      success: false,
      message: 'Payment processing placeholder',
      requiresAction: false
    };

    if (payment_method === 'mpesa') {
      // M-Pesa STK Push placeholder
      processingResult = {
        success: true,
        message: 'M-Pesa STK push initiated',
        requiresAction: true,
        details: {
          method: 'MPESA_STK_PUSH',
          phone: payment_details?.phone || '',
          amount: amount,
          instruction: 'Check your phone for M-Pesa prompt'
        }
      };
    } else if (payment_method === 'stripe') {
      // Stripe placeholder
      processingResult = {
        success: true,
        message: 'Stripe payment processing',
        requiresAction: true,
        details: {
          method: 'STRIPE_CHECKOUT',
          sessionId: `cs_test_${transactionId.slice(0, 12)}`,
          redirectUrl: '/stripe-checkout',
          instruction: 'You will be redirected to Stripe checkout'
        }
      };
    } else if (payment_method === 'paypal') {
      // PayPal placeholder
      processingResult = {
        success: true,
        message: 'PayPal payment processing',
        requiresAction: true,
        details: {
          method: 'PAYPAL_REDIRECT',
          redirectUrl: '/paypal-checkout',
          instruction: 'You will be redirected to PayPal'
        }
      };
    }

    res.status(202).json({
      success: true,
      message: 'Deposit initiated',
      transaction_id: transactionId,
      processing: processingResult
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({
      success: false,
      message: 'Deposit failed'
    });
  }
});

/**
 * POST /api/wallet/pay
 * Pay for an order from wallet
 */
router.post('/pay', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { order_id, amount } = req.body;

    // Validation
    if (!order_id || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'order_id and amount are required'
      });
    }

    // Get order
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(order_id, userId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get wallet
    const wallet = db.prepare('SELECT balance FROM wallet WHERE user_id = ?').get(userId);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Check balance
    if (wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance',
        current_balance: wallet.balance,
        required_amount: amount,
        shortfall: amount - wallet.balance
      });
    }

    // Deduct from wallet and create transaction
    const transactionId = uuidv4();

    // Update wallet balance
    db.prepare('UPDATE wallet SET balance = balance - ?, last_updated = CURRENT_TIMESTAMP WHERE user_id = ?').run(
      amount,
      userId
    );

    // Create transaction
    const insertTransaction = db.prepare(`
      INSERT INTO transactions (
        id, user_id, type, amount, currency, payment_method, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertTransaction.run(
      transactionId,
      userId,
      'payment',
      amount,
      'KES',
      'wallet',
      'completed'
    );

    // Get updated wallet
    const updatedWallet = db.prepare('SELECT balance FROM wallet WHERE user_id = ?').get(userId);

    res.json({
      success: true,
      message: 'Payment completed from wallet',
      transaction_id: transactionId,
      amount_paid: amount,
      order_id: order_id,
      new_balance: updatedWallet.balance
    });
  } catch (error) {
    console.error('Pay from wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment failed'
    });
  }
});

/**
 * GET /api/wallet/transactions
 * Transaction history with pagination
 */
router.get('/transactions', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const type = req.query.type;
    const status = req.query.status;

    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    let countQuery = 'SELECT COUNT(*) as count FROM transactions WHERE user_id = ?';
    const params = [userId];

    if (type) {
      query += ' AND type = ?';
      countQuery += ' AND type = ?';
      params.push(type);
    }

    if (status) {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(status);
    }

    // Get total count
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const offset = (page - 1) * limit;
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const transactions = db.prepare(query).all(...params, limit, offset);

    res.json({
      success: true,
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions'
    });
  }
});

export default router;
