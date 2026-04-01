import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { initializeDatabase, getPool } from './database/init.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateReferralCode() {
  return `REF${Date.now()}${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
}

async function ensureAdminUser(pool) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@swiftcargo.co.ke';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const { rows } = await pool.query(
    `SELECT id, email FROM users WHERE role = $1 OR email = $2 LIMIT 1`,
    ['admin', adminEmail]
  );

  if (rows.length > 0) {
    console.log(`✓ Admin user already exists: ${rows[0].email}`);
    return;
  }

  const adminId = uuidv4();
  const adminWalletId = uuidv4();
  const adminHash = bcrypt.hashSync(adminPassword, 10);
  const adminRefCode = generateReferralCode();
  const warehouseId = `SC-ADM-${Date.now()}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (id, email, password, name, phone, role, warehouse_id, language_pref, referral_code, wallet_balance, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [adminId, adminEmail, adminHash, 'SwiftCargo Admin', '+254700000000', 'admin', warehouseId, 'en', adminRefCode, 0, true]
    );
    await client.query(
      `INSERT INTO wallet (id, user_id, balance, currency) VALUES ($1,$2,$3,$4)`,
      [adminWalletId, adminId, 0, 'KES']
    );
    await client.query('COMMIT');
    console.log(`✓ Admin user created automatically: ${adminEmail}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Import routes
import authRoutes from './routes/auth.js';
import ordersRoutes from './routes/orders.js';
import trackingRoutes from './routes/tracking.js';
import adminRoutes from './routes/admin.js';
import walletRoutes from './routes/wallet.js';
import exchangeRoutes from './routes/exchange.js';
import referralRoutes from './routes/referral.js';
import ticketsRoutes from './routes/tickets.js';
import pricingRoutes from './routes/pricing.js';
import consolidationRoutes from './routes/consolidation.js';
import prohibitedRoutes from './routes/prohibited.js';
import backupRoutes from './routes/backup.js';

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

const corsOptions = {
  origin: CORS_ORIGIN.split(',').map(o => o.trim()),
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(compression());
app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'client', 'dist')));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 5, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Attach pool to every request as req.db
app.use((req, res, next) => { req.db = getPool(); next(); });

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), environment: NODE_ENV, database: 'PostgreSQL (Supabase)' });
});

app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/exchange', exchangeRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/consolidation', consolidationRoutes);
app.use('/api/prohibited', prohibitedRoutes);
app.use('/api/admin/backups', backupRoutes);

app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err.name === 'MulterError') {
    if (err.code === 'FILE_TOO_LARGE') return res.status(400).json({ success: false, message: 'File size exceeds maximum allowed' });
    return res.status(400).json({ success: false, message: 'File upload error' });
  }
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(NODE_ENV === 'development' && { error: err })
  });
});

// Start server after DB is ready
async function start() {
  try {
    await initializeDatabase();
    const pool = getPool();
    await ensureAdminUser(pool);

    const server = app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════╗
║         SWIFTCARGO BACKEND            ║
║   Shipping & Forwarding Service       ║
╚════════════════════════════════════════╝

Server running on http://localhost:${PORT}
Environment:  ${NODE_ENV}
Database:     PostgreSQL (Supabase)
Admin:        bootstrapped

Ready to accept connections...
`);
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM — shutting down gracefully');
      server.close(() => { pool.end(); process.exit(0); });
    });
    process.on('SIGINT', () => {
      console.log('SIGINT — shutting down gracefully');
      server.close(() => { pool.end(); process.exit(0); });
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

export default app;
