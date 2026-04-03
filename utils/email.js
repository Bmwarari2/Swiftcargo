/**
 * Email service using Google Workspace SMTP.
 *
 * nodemailer is loaded lazily via dynamic import so the server can
 * start even when the package is not installed. Email-sending calls
 * will log a warning and resolve gracefully in that case.
 *
 * Required environment variables:
 *   SMTP_HOST       – e.g. smtp.gmail.com
 *   SMTP_PORT       – 465 (SSL) or 587 (TLS)
 *   SMTP_USER       – noreply@swiftcargo.co.ke  (the sending account)
 *   SMTP_PASS       – App Password generated in Google Workspace admin
 *   SMTP_FROM_NAME  – Display name, e.g. "SwiftCargo"
 *   SMTP_FROM_EMAIL – From address, e.g. noreply@swiftcargo.co.ke
 *   ADMIN_CONTACT_EMAIL – Admin inbox for notifications, e.g. admin@swiftcargo.co.ke
 */

let transporter = null;
let nodemailerModule = null;
let transporterVerified = false;

// Lazy-load nodemailer: resolves to the module or null if not installed
const nodemailerPromise = import('nodemailer')
  .then(mod => {
    nodemailerModule = mod.default || mod;
    return nodemailerModule;
  })
  .catch(() => {
    console.warn('⚠ nodemailer is not installed — email features will be disabled. Run: npm install nodemailer');
    return null;
  });

/**
 * Get or create the SMTP transporter with connection pooling and verification.
 */
async function getTransporter() {
  if (transporter && transporterVerified) return transporter;

  const nodemailer = await nodemailerPromise;
  if (!nodemailer) {
    throw new Error(
      'nodemailer is not installed. Run: npm install nodemailer'
    );
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = port === 465;

  // Recreate transporter if it existed but failed verification
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Connection pooling for better performance
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    // Timeouts to prevent hanging
    connectionTimeout: 10000,  // 10s to establish connection
    greetingTimeout: 10000,    // 10s for server greeting
    socketTimeout: 30000,      // 30s for socket inactivity
  });

  // Verify SMTP connection on first use
  try {
    await transporter.verify();
    transporterVerified = true;
    console.log('✅ SMTP connection verified successfully');
  } catch (err) {
    console.error('❌ SMTP connection verification failed:', err.message);
    transporter = null;
    transporterVerified = false;
    throw new Error(`SMTP connection failed: ${err.message}`);
  }

  return transporter;
}

function getFromAddress() {
  const name = process.env.SMTP_FROM_NAME || 'SwiftCargo';
  const email = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@swiftcargo.co.ke';
  return `"${name}" <${email}>`;
}

/**
 * Shared email footer HTML.
 */
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

/**
 * Shared email header HTML.
 */
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

/**
 * Wraps body content in the standard SwiftCargo email layout.
 */
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

/**
 * Send an email with retry logic.
 *
 * @param {object} mailOptions  – Nodemailer mail options
 * @param {number} retries      – Number of retries (default 2)
 * @returns {Promise<object>}   – Nodemailer send result
 */
async function sendWithRetry(mailOptions, retries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const transport = await getTransporter();
      const result = await transport.sendMail(mailOptions);
      console.log(`📧 Email sent to ${mailOptions.to}: ${mailOptions.subject} (attempt ${attempt + 1})`);
      return result;
    } catch (err) {
      lastError = err;
      console.warn(`⚠ Email send attempt ${attempt + 1} failed:`, err.message);

      // Reset transporter on connection errors so it reconnects
      if (err.code === 'ECONNECTION' || err.code === 'ESOCKET' || err.code === 'ETIMEDOUT' || err.code === 'EAUTH') {
        transporter = null;
        transporterVerified = false;
      }

      // Wait before retrying (exponential backoff: 1s, 2s)
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  console.error(`❌ Email to ${mailOptions.to} failed after ${retries + 1} attempts:`, lastError.message);
  throw lastError;
}


// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

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
  const speedLabel = shippingSpeed === 'express' ? 'Express (3–5 days)' : 'Economy (7–14 days)';

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Your Order Has Been Created</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      The SwiftCargo team has created a new order on your behalf. Here are the details:
    </p>

    <!-- Order Details Table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Tracking Number</span><br>
          <strong style="color:#1e3a5f;font-size:16px;font-family:monospace;">${trackingNumber}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Retailer</span><br>
          <strong style="color:#111827;font-size:15px;">${retailer}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Shipping From</span><br>
          <strong style="color:#111827;font-size:15px;">${market}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Description</span><br>
          <strong style="color:#111827;font-size:15px;">${description}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;">
          <span style="color:#6b7280;font-size:14px;">Shipping Speed</span><br>
          <strong style="color:#111827;font-size:15px;">${speedLabel}</strong>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
      You will receive further updates as your package moves through our warehouse. Our team will contact you regarding payment once the shipment is confirmed.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${dashboardLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
            View My Orders
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      If you have any questions, please reach out to our support team via the portal.
    </p>`;

  return sendWithRetry({
    from: getFromAddress(),
    to: toEmail,
    subject: `New Order Created for You — ${trackingNumber}`,
    html: emailLayout(bodyHtml),
    text: `Hello ${toName || 'there'},\n\nThe SwiftCargo team has created a new order on your behalf.\n\nTracking Number: ${trackingNumber}\nRetailer: ${retailer}\nShipping From: ${market}\nDescription: ${description}\nShipping Speed: ${speedLabel}\n\nYou will receive updates as your package progresses. Our team will contact you regarding payment once confirmed.\n\nView your orders: ${dashboardLink}\n\n— SwiftCargo Team`,
  });
}

/**
 * Send a welcome email when an admin creates an account for a user.
 * Includes a link to set up their password.
 *
 * @param {string} toEmail         – New user's email
 * @param {string} toName          – New user's name
 * @param {string} warehouseId     – Assigned warehouse ID
 * @param {string} role            – 'customer' or 'admin'
 * @param {string} setPasswordLink – Full URL with token for password setup
 * @returns {Promise<object>}      – Nodemailer send result
 */
export async function sendWelcomeAccountEmail(toEmail, toName, warehouseId, role, setPasswordLink) {
  const roleLabel = role === 'admin' ? 'Administrator' : 'Customer';

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Welcome to SwiftCargo!</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      A SwiftCargo ${roleLabel.toLowerCase()} account has been created for you. Here are your account details:
    </p>

    <!-- Account Details -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Email</span><br>
          <strong style="color:#1e3a5f;font-size:16px;">${toEmail}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Account Type</span><br>
          <strong style="color:#111827;font-size:15px;">${roleLabel}</strong>
        </td>
      </tr>
      ${warehouseId ? `<tr>
        <td style="padding:8px 0;">
          <span style="color:#6b7280;font-size:14px;">Warehouse ID</span><br>
          <strong style="color:#1e3a5f;font-size:16px;font-family:monospace;">${warehouseId}</strong>
        </td>
      </tr>` : ''}
    </table>

    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      To get started, please set up your password by clicking the button below. This link will expire in <strong>24 hours</strong>.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${setPasswordLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
            Create My Password
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Once your password is set, you can log in at any time to manage your shipments, track packages, and more.
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      If the button above doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:8px 0 0;word-break:break-all;color:#f97316;font-size:13px;">
      ${setPasswordLink}
    </p>`;

  return sendWithRetry({
    from: getFromAddress(),
    to: toEmail,
    subject: `Welcome to SwiftCargo — Set Up Your Account`,
    html: emailLayout(bodyHtml),
    text: `Hello ${toName || 'there'},\n\nA SwiftCargo ${roleLabel.toLowerCase()} account has been created for you.\n\nEmail: ${toEmail}\nAccount Type: ${roleLabel}\n${warehouseId ? `Warehouse ID: ${warehouseId}\n` : ''}\nTo get started, please set up your password using this link (expires in 24 hours):\n${setPasswordLink}\n\nOnce your password is set, you can log in to manage your shipments.\n\n— SwiftCargo Team`,
  });
}

/**
 * Send a payment reminder email to a customer.
 *
 * @param {string} toEmail         – Customer email
 * @param {string} toName          – Customer display name
 * @param {string} trackingNumber  – Order tracking number
 * @param {number} amount          – Outstanding amount in KES
 * @param {string} notes           – Optional notes from admin
 * @param {string} paymentLink     – Link to wallet/payment page
 * @returns {Promise<object>}      – Nodemailer send result
 */
export async function sendPaymentReminderEmail(toEmail, toName, trackingNumber, amount, notes, paymentLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Payment Reminder</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      This is a friendly reminder that a payment of <strong>KES ${amount.toLocaleString()}</strong> is outstanding for your order <strong>${trackingNumber}</strong>.
    </p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Please complete this payment at your earliest convenience so we can proceed with processing your shipment.
    </p>
    ${notes ? `
    <div style="margin:0 0 24px;background-color:#fef9c3;padding:12px 16px;border-left:4px solid #f59e0b;border-radius:4px;">
      <p style="margin:0;color:#92400e;font-size:14px;line-height:1.6;"><strong>Note from admin:</strong> ${notes}</p>
    </div>` : ''}
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
    subject: `Payment Reminder for Order ${trackingNumber} — KES ${amount.toLocaleString()}`,
    html: emailLayout(bodyHtml),
    text: `Hello ${toName || 'there'},\n\nThis is a friendly reminder that a payment of KES ${amount.toLocaleString()} is outstanding for your order ${trackingNumber}.\n\nPlease complete this payment at your earliest convenience so we can proceed with processing your shipment.\n\n${notes ? `Note from admin: ${notes}\n\n` : ''}Pay here: ${paymentLink}\n\nYou can also log in and pay from your wallet.\n\n— SwiftCargo Team`,
  });
}

export default {
  sendPasswordResetEmail,
  sendAdminPasswordResetEmail,
  sendPaymentRequestEmail,
  sendOrderCreatedEmail,
  sendWelcomeAccountEmail,
  sendPaymentReminderEmail,
};
