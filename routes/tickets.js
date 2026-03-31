import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'ticket-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

/**
 * GET /api/tickets
 * List user's tickets
 */
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const priority = req.query.priority;

    let query = 'SELECT * FROM tickets WHERE user_id = ?';
    let countQuery = 'SELECT COUNT(*) as count FROM tickets WHERE user_id = ?';
    const params = [userId];

    if (status) {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(status);
    }

    if (priority) {
      query += ' AND priority = ?';
      countQuery += ' AND priority = ?';
      params.push(priority);
    }

    // Get total count
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const offset = (page - 1) * limit;
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const tickets = db.prepare(query).all(...params, limit, offset);

    res.json({
      success: true,
      tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets'
    });
  }
});

/**
 * POST /api/tickets
 * Create ticket with optional file upload
 */
router.post('/', authMiddleware, upload.single('photo'), (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { subject, description, priority } = req.body;

    // Validation
    if (!subject || !description) {
      return res.status(400).json({
        success: false,
        message: 'Subject and description are required'
      });
    }

    const ticketPriority = priority || 'medium';
    if (!['low', 'medium', 'high'].includes(ticketPriority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid priority'
      });
    }

    const ticketId = uuidv4();
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // Create ticket
    const insertTicket = db.prepare(`
      INSERT INTO tickets (
        id, user_id, subject, description, status, priority, photo_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertTicket.run(
      ticketId,
      userId,
      subject,
      description,
      'open',
      ticketPriority,
      photoUrl
    );

    // Get created ticket
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);

    res.status(201).json({
      success: true,
      message: 'Ticket created successfully',
      ticket
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ticket'
    });
  }
});

/**
 * GET /api/tickets/:id
 * Get ticket with messages
 */
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const userId = req.user.id;

    const ticket = db.prepare(`
      SELECT * FROM tickets WHERE id = ? AND user_id = ?
    `).get(id, userId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Get messages
    const messages = db.prepare(`
      SELECT tm.id, tm.message, tm.created_at,
             u.email, u.name, u.role
      FROM ticket_messages tm
      JOIN users u ON tm.sender_id = u.id
      WHERE tm.ticket_id = ?
      ORDER BY tm.created_at ASC
    `).all(id);

    res.json({
      success: true,
      ticket,
      messages
    });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket'
    });
  }
});

/**
 * POST /api/tickets/:id/message
 * Add message to ticket
 */
router.post('/:id/message', authMiddleware, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const { message } = req.body;
    const userId = req.user.id;

    // Validation
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Get ticket (verify user access)
    const ticket = db.prepare(`
      SELECT * FROM tickets WHERE id = ? AND user_id = ?
    `).get(id, userId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const messageId = uuidv4();

    // Add message
    const insertMessage = db.prepare(`
      INSERT INTO ticket_messages (
        id, ticket_id, sender_id, message
      ) VALUES (?, ?, ?, ?)
    `);

    insertMessage.run(messageId, id, userId, message);

    // Update ticket updated_at
    db.prepare('UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    res.status(201).json({
      success: true,
      message: 'Message added successfully',
      message_id: messageId
    });
  } catch (error) {
    console.error('Add message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add message'
    });
  }
});

/**
 * PUT /api/tickets/:id/status
 * Update ticket status (admin only)
 */
router.put('/:id/status', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const { status, admin_message } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    // Get ticket
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Update ticket status
    db.prepare('UPDATE tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);

    // Add admin message if provided
    if (admin_message) {
      const messageId = uuidv4();
      const insertMessage = db.prepare(`
        INSERT INTO ticket_messages (
          id, ticket_id, sender_id, message
        ) VALUES (?, ?, ?, ?)
      `);
      insertMessage.run(messageId, id, req.user.id, admin_message);
    }

    const updatedTicket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);

    res.json({
      success: true,
      message: 'Ticket status updated successfully',
      ticket: updatedTicket
    });
  } catch (error) {
    console.error('Update ticket status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket status'
    });
  }
});

/**
 * GET /api/tickets/admin/all
 * List all tickets (admin)
 */
router.get('/admin/all', authMiddleware, isAdmin, (req, res) => {
  try {
    const db = req.db;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const priority = req.query.priority;

    let query = 'SELECT * FROM tickets WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as count FROM tickets WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(status);
    }

    if (priority) {
      query += ' AND priority = ?';
      countQuery += ' AND priority = ?';
      params.push(priority);
    }

    // Get total count
    const countResult = db.prepare(countQuery).get(...params);
    const total = countResult.count;
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    const offset = (page - 1) * limit;
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const tickets = db.prepare(query).all(...params, limit, offset);

    // Enrich with user info
    const enrichedTickets = tickets.map(ticket => {
      const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(ticket.user_id);
      return {
        ...ticket,
        customer_name: user?.name,
        customer_email: user?.email
      };
    });

    res.json({
      success: true,
      tickets: enrichedTickets,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get all tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets'
    });
  }
});

export default router;
