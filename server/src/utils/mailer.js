const nodemailer = require("nodemailer");
const logger = require("./logger");

let transporter;

function requireMailConfig() {
  const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter(
    (key) => !process.env[key],
  );

  if (missing.length) {
    throw new Error(
      `Email is not configured. Missing environment variables: ${missing.join(
        ", ",
      )}`,
    );
  }
}

function getTransporter() {
  if (transporter) return transporter;

  requireMailConfig();

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendVerificationEmail({ to, username, verificationUrl }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const safeUsername = escapeHtml(username);
  const safeVerificationUrl = escapeHtml(verificationUrl);

  const info = await getTransporter().sendMail({
    from,
    to,
    subject: "Verify your CodeSteam account",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
        <h2>Verify your email</h2>
        <p>Hi ${safeUsername},</p>
        <p>Thanks for registering on CodeSteam.</p>
        <p>Please click the button below to verify your email:</p>
        <p>
          <a href="${safeVerificationUrl}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;">
            Verify Email
          </a>
        </p>
        <p>If the button does not work, open this link manually:</p>
        <p>${safeVerificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
      </div>
    `,
  });

  logger.info(`Verification email queued for ${to}: ${info.messageId || "sent"}`);
}

module.exports = { sendVerificationEmail };
