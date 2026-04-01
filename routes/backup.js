import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware, isAdmin } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Backup directory — created once on startup
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Compute SHA-256 checksum of a file for integrity verification.
 */
function computeChecksum(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Make a backup file immutable (read-only) so it cannot be modified or deleted
 * accidentally. On Linux/macOS this sets the file to read-only.
 */
function makeImmutable(filePath) {
  try {
    fs.chmodSync(filePath, 0o444); // read-only for everyone
  } catch (err) {
    console.warn('Could not make backup immutable (may need root):', err.message);
  }
}

/**
 * POST /api/admin/backups
 * Create a new database backup (admin only).
 * Copies the current SQLite database file to the backups directory with a
 * timestamp-based filename, computes a SHA-256 checksum, and marks the file
 * as immutable (read-only).
 */
router.post('/', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const adminId = req.user.id;
    const backupId = uuidv4();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `swiftcargo-backup-${timestamp}.db`;
    const filepath = path.join(BACKUP_DIR, filename);

    // Record backup as in-progress
    db.prepare(`
      INSERT INTO backups (id, filename, filepath, size_bytes, checksum, status, created_by)
      VALUES (?, ?, ?, 0, '', 'in_progress', ?)
    `).run(backupId, filename, filepath, adminId);

    // Use SQLite's built-in VACUUM INTO for a consistent, safe backup
    db.exec(`VACUUM INTO '${filepath.replace(/'/g, "''")}'`);

    // Compute checksum
    const checksum = computeChecksum(filepath);
    const stats = fs.statSync(filepath);

    // Make backup immutable
    makeImmutable(filepath);

    // Update the record
    db.prepare(`
      UPDATE backups SET size_bytes = ?, checksum = ?, status = 'completed' WHERE id = ?
    `).run(stats.size, checksum, backupId);

    // Log the admin action
    const logId = uuidv4();
    db.prepare(`
      INSERT INTO admin_logs (id, admin_id, action, details)
      VALUES (?, ?, ?, ?)
    `).run(logId, adminId, 'create_backup', JSON.stringify({
      backup_id: backupId,
      filename,
      size_bytes: stats.size,
      checksum
    }));

    res.status(201).json({
      success: true,
      message: 'Backup created successfully',
      backup: {
        id: backupId,
        filename,
        size_bytes: stats.size,
        checksum,
        status: 'completed',
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Create backup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create backup'
    });
  }
});

/**
 * GET /api/admin/backups
 * List all backups with pagination (admin only).
 * Includes integrity verification — each backup's checksum is re-verified
 * against the stored value so admins can see if any file has been tampered with.
 */
router.get('/', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const countResult = db.prepare('SELECT COUNT(*) as count FROM backups').get();
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    const backups = db.prepare(`
      SELECT b.id, b.filename, b.filepath, b.size_bytes, b.checksum, b.status,
             b.created_at, u.name as created_by_name, u.email as created_by_email
      FROM backups b
      LEFT JOIN users u ON b.created_by = u.id
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    // Verify integrity for each backup
    const backupsWithIntegrity = backups.map(backup => {
      let integrity = 'unknown';
      if (backup.status === 'completed') {
        try {
          if (fs.existsSync(backup.filepath)) {
            const currentChecksum = computeChecksum(backup.filepath);
            integrity = currentChecksum === backup.checksum ? 'verified' : 'tampered';
          } else {
            integrity = 'missing';
          }
        } catch {
          integrity = 'error';
        }
      }
      return {
        id: backup.id,
        filename: backup.filename,
        size_bytes: backup.size_bytes,
        size_mb: parseFloat((backup.size_bytes / (1024 * 1024)).toFixed(2)),
        checksum: backup.checksum,
        status: backup.status,
        integrity,
        created_at: backup.created_at,
        created_by: backup.created_by_name || backup.created_by_email || 'System'
      };
    });

    res.json({
      success: true,
      backups: backupsWithIntegrity,
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('List backups error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch backups'
    });
  }
});

/**
 * GET /api/admin/backups/:id/download
 * Download a backup file (admin only).
 */
router.get('/:id/download', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;

    const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(id);
    if (!backup) {
      return res.status(404).json({ success: false, message: 'Backup not found' });
    }

    if (!fs.existsSync(backup.filepath)) {
      return res.status(404).json({ success: false, message: 'Backup file is missing from disk' });
    }

    res.download(backup.filepath, backup.filename);
  } catch (error) {
    console.error('Download backup error:', error);
    res.status(500).json({ success: false, message: 'Failed to download backup' });
  }
});

/**
 * GET /api/admin/backups/:id/verify
 * Verify the integrity of a specific backup (admin only).
 */
router.get('/:id/verify', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;

    const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(id);
    if (!backup) {
      return res.status(404).json({ success: false, message: 'Backup not found' });
    }

    if (!fs.existsSync(backup.filepath)) {
      return res.json({
        success: true,
        integrity: 'missing',
        message: 'Backup file not found on disk'
      });
    }

    const currentChecksum = computeChecksum(backup.filepath);
    const isValid = currentChecksum === backup.checksum;

    res.json({
      success: true,
      integrity: isValid ? 'verified' : 'tampered',
      stored_checksum: backup.checksum,
      current_checksum: currentChecksum,
      message: isValid
        ? 'Backup integrity verified — file has not been modified'
        : 'WARNING: Backup has been modified since creation'
    });
  } catch (error) {
    console.error('Verify backup error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify backup' });
  }
});

export default router;
