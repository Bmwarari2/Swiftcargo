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

// Lazy-load nodemailer: resolves to the module or null if not installed
const nodemailerPromise = import('nodemailer')
  .then(mod => mod.default || mod)
  .catch(() => {
    console.warn('⚠ nodemailer is not installed — email features will be disabled. Run: npm install nodemailer');
    return null;
  });

async function getTransporter() {
  if (transporter) return transporter;

  const nodemailer = await nodemailerPromise;
  if (!nodemailer) {
    throw new Error(
      'nodemailer is not installed. Run: npm install nodemailer'
    );
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = port === 465;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

function getFromAddress() {
  const name = process.env.SMTP_FROM_NAME || 'SwiftCargo';
  const email = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@swiftcargo.co.ke';
  return `"${name}" <${email}>`;
}

/**
 * Send a password-reset email to a user.
 *
 * @param {string} toEmail     – Recipient email
 * @param {string} toName      – Recipient display name
 * @param {string} resetLink   – Full URL with token, e.g. https://app.swiftcargo.co.ke/reset-password?token=abc
 * @returns {Promise<object>}  – Nodemailer send result
 */
export async function sendPasswordResetEmail(toEmail, toName, resetLink) {
  const transport = await getTransporter();

  const mailOptions = {
    from: getFromAddress(),
    to: toEmail,
    subject: 'Reset Your SwiftCargo Password',
    html: `
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
                <!-- Header -->
                <tr>
                  <td style="background-color:#1e3a5f;padding:32px 40px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:bold;">
                      Swift<span style="color:#f97316;">Cargo</span>
                    </h1>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:40px;">
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
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
                    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                      SwiftCargo Shipping &amp; Forwarding &bull; Nairobi, Kenya<br>
                      This is an automated message. Please do not reply to this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Hello ${toName || 'there'},\n\nWe received a request to reset your SwiftCargo password.\n\nClick this link to reset your password (expires in 1 hour):\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.\n\n— SwiftCargo Team`,
  };

  return transport.sendMail(mailOptions);
}

/**
 * Send admin-triggered password-reset notification.
 * Same email as user-initiated, but with slightly different wording.
 */
export async function sendAdminPasswordResetEmail(toEmail, toName, resetLink) {
  const transport = await getTransporter();

  const mailOptions = {
    from: getFromAddress(),
    to: toEmail,
    subject: 'Your SwiftCargo Password Has Been Reset',
    html: `
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
                <!-- Header -->
                <tr>
                  <td style="background-color:#1e3a5f;padding:32px 40px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:bold;">
                      Swift<span style="color:#f97316;">Cargo</span>
                    </h1>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:40px;">
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
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
                    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                      SwiftCargo Shipping &amp; Forwarding &bull; Nairobi, Kenya<br>
                      This is an automated message. Please do not reply to this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Hello ${toName || 'there'},\n\nA SwiftCargo administrator has initiated a password reset for your account.\n\nClick this link to set a new password (expires in 1 hour):\n${resetLink}\n\nIf you believe this was done in error, please contact support.\n\n— SwiftCargo Team`,
  };

  return transport.sendMail(mailOptions);
}

/**
 * Send a payment request email to a customer.
 *
 * @param {string} toEmail         – Customer email
 * @param {string} toName          – Customer display name
 * @param {string} trackingNumber  – Order tracking number
 * @param {number} amount          – Amount due in KES
 * @param {string} notes           – Optional notes from admin
 * @param {string} paymentLink     – Link to wallet/payment page
 * @returns {Promise<object>}      – Nodemailer send result
 */
export async function sendPaymentRequestEmail(toEmail, toName, trackingNumber, amount, notes, paymentLink) {
  const transport = await getTransporter();

  const mailOptions = {
    from: getFromAddress(),
    to: toEmail,
    subject: `Payment Request for Order ${trackingNumber} — KES ${amount.toLocaleString()}`,
    html: `
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
                <!-- Header -->
                <tr>
                  <td style="background-color:#1e3a5f;padding:32px 40px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:bold;">
                      Swift<span style="color:#f97316;">Cargo</span>
                    </h1>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:40px;">
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
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
                    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                      SwiftCargo Shipping &amp; Forwarding &bull; Nairobi, Kenya<br>
                      This is an automated message. Please do not reply to this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Hello ${toName || 'there'},\n\nA payment of KES ${amount.toLocaleString()} is due for your order ${trackingNumber}.\n\n${notes ? `Note: ${notes}\n\n` : ''}Pay here: ${paymentLink}\n\nYou can also log in and pay from your wallet.\n\n— SwiftCargo Team`,
  };

  return transport.sendMail(mailOptions);
}

export default { sendPasswordResetEmail, sendAdminPasswordResetEmail, sendPaymentRequestEmail };
