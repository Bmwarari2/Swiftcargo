/**
 * Email service using Google SMTP via Nodemailer.
 *
 * Required environment variables:
 *   SMTP_HOST         – e.g. smtp.gmail.com
 *   SMTP_PORT         – 587 (TLS) or 465 (SSL)
 *   SMTP_USER         – your Gmail address
 *   SMTP_PASS         – your Gmail App Password (not your account password)
 *   EMAIL_FROM        – e.g. "SwiftCargo <noreply@swiftcargo.co.ke>"
 *   ADMIN_CONTACT_EMAIL – Admin inbox for notifications
 */

import nodemailer from 'nodemailer';

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function getFromAddress() {
  return process.env.EMAIL_FROM
    || process.env.SMTP_FROM_EMAIL
    || `SwiftCargo <${process.env.SMTP_USER}>`;
}

/**
 * Send an email via Google SMTP with retry logic.
 */
async function sendWithRetry(mailOptions, retries = 2) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    const msg = 'SMTP_USER or SMTP_PASS is not set. Email sending is disabled.';
    console.error(`\u274c ${msg}`);
    throw new Error(msg);
  }

  const transporter = createTransport();
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const info = await transporter.sendMail({
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text,
      });
      console.log(`\ud83d\udce7 Email sent to ${mailOptions.to}: ${mailOptions.subject} (attempt ${attempt + 1}) [id: ${info.messageId}]`);
      return info;
    } catch (err) {
      lastError = err;
      console.warn(`\u26a0 Email send attempt ${attempt + 1} failed:`, err.message);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  console.error(`\u274c Email to ${mailOptions.to} failed after ${retries + 1} attempts:`, lastError.message);
  throw lastError;
}


// ===============================================================================
// SHARED HTML HELPERS
// ===============================================================================

function emailFooter() {
  return `
    <tr>
      <td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
          SwiftCargo Shipping &amp; Forwarding &bull; Nairobi, Kenya<br>
          This is an automated message. Please do not reply to this email.
        </p>
      </td>
    </tr>`;
}

function emailHeader() {
  return `
    <tr>
      <td style="background-color:#1e3a5f;padding:32px 40px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:bold;">
          Swift<span style="color:#f97316;">Cargo</span>
        </h1>
      </td>
    </tr>`;
}

function emailLayout(bodyHtml) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
              ${emailHeader()}
              <tr>
                <td style="padding:40px;">
                  ${bodyHtml}
                </td>
              </tr>
              ${emailFooter()}
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
}


// ===============================================================================
// EMAIL TEMPLATES
// ===============================================================================

/**
 * Send a TEST email to verify SMTP configuration.
 * Clearly marked so recipients know to ignore it.
 */
export async function sendTestEmail(toEmail) {
  const sentAt = new Date().toUTCString();
  const bodyHtml = `
    <!-- TEST BANNER -->
    <div style="background-color:#fef3c7;border:2px dashed #f59e0b;border-radius:8px;padding:16px 20px;margin-bottom:28px;text-align:center;">
      <p style="margin:0;font-size:14px;font-weight:bold;color:#92400e;letter-spacing:0.05em;">\u26a0\ufe0f THIS IS A TEST EMAIL — PLEASE IGNORE \u26a0\ufe0f</p>
      <p style="margin:6px 0 0;font-size:12px;color:#b45309;">This message was sent from the SwiftCargo admin panel to verify email delivery. No action is required.</p>
    </div>

    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Email Configuration Test</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      If you are reading this, your SMTP email configuration is working correctly.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:13px;">Sent to</span><br>
          <strong style="color:#111827;font-size:15px;">${toEmail}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:13px;">Sent at</span><br>
          <strong style="color:#111827;font-size:15px;">${sentAt}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;">
          <span style="color:#6b7280;font-size:13px;">Status</span><br>
          <strong style="color:#16a34a;font-size:15px;">\u2713 Delivered successfully</strong>
        </td>
      </tr>
    </table>

    <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
      You received this because an administrator triggered a test from the SwiftCargo admin panel.
      No further action is needed.
    </p>`;

  return sendWithRetry({
    from: getFromAddress(),
    to: toEmail,
    subject: '[TEST] SwiftCargo Email Configuration Test — Please Ignore',
    html: emailLayout(bodyHtml),
    text: `[TEST EMAIL — PLEASE IGNORE]\n\nThis is a test email sent from the SwiftCargo admin panel to verify email delivery.\n\nSent to: ${toEmail}\nSent at: ${sentAt}\nStatus: Delivered successfully\n\nNo action is required.\n\n— SwiftCargo System`,
  });
}

/**
 * Send a password-reset email to a user.
 */
export async function sendPasswordResetEmail(toEmail, toName, resetLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Password Reset Request</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      We received a request to reset the password for your SwiftCargo account.
      Click the button below to create a new password. This link will expire in <strong>1 hour</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${resetLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
            Reset My Password
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you didn't request this, you can safely ignore this email. Your password will not be changed.
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      If the button above doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:8px 0 0;word-break:break-all;color:#f97316;font-size:13px;">
      ${resetLink}
    </p>`;

  return sendWithRetry({
    from: getFromAddress(),
    to: toEmail,
    subject: 'Reset Your SwiftCargo Password',
    html: emailLayout(bodyHtml),
    text: `Hello ${toName || 'there'},\n\nWe received a request to reset your SwiftCargo password.\n\nClick this link to reset your password (expires in 1 hour):\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.\n\n— SwiftCargo Team`,
  });
}

/**
 * Send admin-triggered password-reset notification.
 */
export async function sendAdminPasswordResetEmail(toEmail, toName, resetLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Password Reset by Administrator</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      A SwiftCargo administrator has initiated a password reset for your account.
      Click the button below to set a new password. This link will expire in <strong>1 hour</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${resetLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
            Set New Password
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you believe this was done in error, please contact our support team.
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      If the button above doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:8px 0 0;word-break:break-all;color:#f97316;font-size:13px;">
      ${resetLink}
    </p>`;

  return sendWithRetry({
    from: getFromAddress(),
    to: toEmail,
    subject: 'Your SwiftCargo Password Has Been Reset',
    html: emailLayout(bodyHtml),
    text: `Hello ${toName || 'there'},\n\nA SwiftCargo administrator has initiated a password reset for your account.\n\nClick this link to set a new password (expires in 1 hour):\n${resetLink}\n\nIf you believe this was done in error, please contact support.\n\n— SwiftCargo Team`,
  });
}

/**
 * Send a payment request email to a customer.
 */
export async function sendPaymentRequestEmail(toEmail, toName, trackingNumber, amount, notes, paymentLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Payment Request</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      A payment of <strong>KES ${amount.toLocaleString()}</strong> is due for your order <strong>${trackingNumber}</strong>.
    </p>
    ${notes ? `<p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;background-color:#f9fafb;padding:12px 16px;border-left:4px solid #f97316;border-radius:4px;"><em>${notes}</em></p>` : ''}
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${paymentLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
            Pay Now
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      You can also log in to your SwiftCargo account and pay from your wallet.
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      If the button above doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:8px 0 0;word-break:break-all;color:#f97316;font-size:13px;">
      ${paymentLink}
    </p>`;

  return sendWithRetry({
    from: getFromAddress(),
    to: toEmail,
    subject: `Payment Request for Order ${trackingNumber} — KES ${amount.toLocaleString()}`,
    html: emailLayout(bodyHtml),
    text: `Hello ${toName || 'there'},\n\nA payment of KES ${amount.toLocaleString()} is due for your order ${trackingNumber}.\n\n${notes ? `Note: ${notes}\n\n` : ''}Pay here: ${paymentLink}\n\nYou can also log in and pay from your wallet.\n\n— SwiftCargo Team`,
  });
}

/**
 * Notify a customer that SwiftCargo has created a new order on their behalf.
 */
export async function sendOrderCreatedEmail(toEmail, toName, trackingNumber, retailer, market, description, shippingSpeed, dashboardLink) {
  const speedLabel = shippingSpeed === 'express' ? 'Express (3\u20135 days)' : 'Economy (7\u201314 days)';

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Your Order Has Been Created</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      The SwiftCargo team has created a new order on your behalf. Here are the details:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;font-size:14px;">Tracking Number</span><br><strong style="color:#1e3a5f;font-size:16px;font-family:monospace;">${trackingNumber}</strong></td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;font-size:14px;">Retailer</span><br><strong style="color:#111827;font-size:15px;">${retailer}</strong></td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;font-size:14px;">Shipping From</span><br><strong style="color:#111827;font-size:15px;">${market}</strong></td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;font-size:14px;">Description</span><br><strong style="color:#111827;font-size:15px;">${description}</strong></td></tr>
      <tr><td style="padding:8px 0;"><span style="color:#6b7280;font-size:14px;">Shipping Speed</span><br><strong style="color:#111827;font-size:15px;">${speedLabel}</strong></td></tr>
    </table>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
      You will receive further updates as your package moves through our warehouse.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${dashboardLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">View My Orders</a>
        </td>
      </tr>
    </table>`;

  return sendWithRetry({
    from: getFromAddress(),
    to: toEmail,
    subject: `New Order Created for You — ${trackingNumber}`,
    html: emailLayout(bodyHtml),
    text: `Hello ${toName || 'there'},\n\nThe SwiftCargo team has created a new order on your behalf.\n\nTracking Number: ${trackingNumber}\nRetailer: ${retailer}\nShipping From: ${market}\nDescription: ${description}\nShipping Speed: ${speedLabel}\n\nView your orders: ${dashboardLink}\n\n— SwiftCargo Team`,
  });
}

/**
 * Send a welcome email when an admin creates an account for a user.
 */
export async function sendWelcomeAccountEmail(toEmail, toName, warehouseId, role, setPasswordLink) {
  const roleLabel = role === 'admin' ? 'Administrator' : 'Customer';

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Welcome to SwiftCargo!</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      A SwiftCargo ${roleLabel.toLowerCase()} account has been created for you.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;font-size:14px;">Email</span><br><strong style="color:#1e3a5f;font-size:16px;">${toEmail}</strong></td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;font-size:14px;">Account Type</span><br><strong style="color:#111827;font-size:15px;">${roleLabel}</strong></td></tr>
      ${warehouseId ? `<tr><td style="padding:8px 0;"><span style="color:#6b7280;font-size:14px;">Warehouse ID</span><br><strong style="color:#1e3a5f;font-size:16px;font-family:monospace;">${warehouseId}</strong></td></tr>` : ''}
    </table>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      Please set up your password by clicking the button below. This link will expire in <strong>24 hours</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${setPasswordLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">Create My Password</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#6b7280;font-size:14px;">
      If the button above doesn't work, copy and paste this link:<br>
      <span style="word-break:break-all;color:#f97316;font-size:13px;">${setPasswordLink}</span>
    </p>`;

  return sendWithRetry({
    from: getFromAddress(),
    to: toEmail,
    subject: 'Welcome to SwiftCargo — Set Up Your Account',
    html: emailLayout(bodyHtml),
    text: `Hello ${toName || 'there'},\n\nA SwiftCargo ${roleLabel.toLowerCase()} account has been created for you.\n\nEmail: ${toEmail}\nAccount Type: ${roleLabel}\n${warehouseId ? `Warehouse ID: ${warehouseId}\n` : ''}\nSet up your password here (expires in 24 hours):\n${setPasswordLink}\n\n— SwiftCargo Team`,
  });
}

/**
 * Send a payment reminder email to a customer.
 */
export async function sendPaymentReminderEmail(toEmail, toName, trackingNumber, amount, notes, paymentLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Payment Reminder</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      This is a friendly reminder that a payment of <strong>KES ${amount.toLocaleString()}</strong>
      is outstanding for your order <strong>${trackingNumber}</strong>.
    </p>
    ${notes ? `<div style="margin:0 0 24px;background-color:#fef9c3;padding:12px 16px;border-left:4px solid #f59e0b;border-radius:4px;"><p style="margin:0;color:#92400e;font-size:14px;"><strong>Note from admin:</strong> ${notes}</p></div>` : ''}
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${paymentLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">Pay Now</a>
        </td>
      </tr>
    </table>`;

  return sendWithRetry({
    from: getFromAddress(),
    to: toEmail,
    subject: `Payment Reminder for Order ${trackingNumber} — KES ${amount.toLocaleString()}`,
    html: emailLayout(bodyHtml),
    text: `Hello ${toName || 'there'},\n\nPayment of KES ${amount.toLocaleString()} is outstanding for order ${trackingNumber}.\n\n${notes ? `Note: ${notes}\n\n` : ''}Pay here: ${paymentLink}\n\n— SwiftCargo Team`,
  });
}

export default {
  sendTestEmail,
  sendPasswordResetEmail,
  sendAdminPasswordResetEmail,
  sendPaymentRequestEmail,
  sendOrderCreatedEmail,
  sendWelcomeAccountEmail,
  sendPaymentReminderEmail,
};
