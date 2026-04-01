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
import { initializeDatabase } from './database/init.js';

// Load environment variables
dotenv.config();

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database
const db = initializeDatabase();

function generateReferralCode() {
  return `REF${Date.now()}${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
}

function ensureAdminUser(database) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@swiftcargo.co.ke';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const existingAdmin = database
    .prepare('SELECT id, email FROM users WHERE role = ? OR email = ? LIMIT 1')
    .get('admin', adminEmail);

  if (existingAdmin) {
    console.log(`✓ Admin user already exists: ${existingAdmin.email}`);
    return;
  }

  const adminId = uuidv4();
  const adminWalletId = uuidv4();
  const adminHash = bcrypt.hashSync(adminPassword, 10);
  const adminRefCode = generateReferralCode();
  const warehouseId = `SC-ADM-${Date.now()}`;

  const insertAdmin = database.prepare(`
    INSERT INTO users (
      id, email, password, name, phone, role, warehouse_id,
      language_pref, referral_code, wallet_balance, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertWallet = database.prepare(`
    INSERT INTO wallet (id, user_id, balance, currency)
    VALUES (?, ?, ?, ?)
  `);

  const createAdmin = database.transaction(() => {
    insertAdmin.run(
      adminId,
      adminEmail,
      adminHash,
      'SwiftCargo Admin',
      '+254700000000',
      'admin',
      warehouseId,
      'en',
      adminRefCode,
      0,
      1
    );

    insertWallet.run(adminWalletId, adminId, 0, 'KES');
  });

  createAdmin();
  console.log(`✓ Admin user created automatically: ${adminEmail}`);
}

ensureAdminUser(db);

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

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
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

// CORS configuration
const corsOptions = {
  origin: CORS_ORIGIN.split(',').map(o => o.trim()),
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Request logging
app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve React frontend static assets
app.use(express.static(path.join(__dirname, 'client', 'dist')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use((req, res, next) => {
  req.db = db;
  next();
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV
  });
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

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.name === 'MulterError') {
    if (err.code === 'FILE_TOO_LARGE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds maximum allowed'
      });
    }

    return res.status(400).json({
      success: false,
      message: 'File upload error'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(NODE_ENV === 'development' && { error: err })
  });
});

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║         SWIFTCARGO BACKEND            ║
║   Shipping & Forwarding Service       ║
╚════════════════════════════════════════╝

Server running on http://localhost:${PORT}
Environment: ${NODE_ENV}
Database: SQLite (better-sqlite3)
Admin bootstrap: enabled
Warehouse: 31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB

API Documentation:
- Health Check: GET /health
- Auth: POST /api/auth/register, POST /api/auth/login
- Orders: GET|POST /api/orders
- Tracking: GET /api/tracking/:trackingNumber
- Admin: GET /api/admin/* (admin only)
- Wallet: GET|POST /api/wallet
- Referral: GET /api/referral
- Tickets: GET|POST /api/tickets
- Pricing: POST /api/pricing/calculate
- Exchange: GET /api/exchange/rates
- Consolidation: GET|POST /api/consolidation
- Prohibited Items: GET /api/prohibited/check

Ready to accept connections...
`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    db.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    db.close();
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
