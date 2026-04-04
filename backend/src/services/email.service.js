// ============================================================
// nexus/backend/src/services/email.service.js
// Nodemailer with SMTP (Gmail/XAMPP-compatible)
// ============================================================
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

function baseTemplate(content) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  body{margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .wrapper{max-width:560px;margin:40px auto;}
  .card{background:#1a1a2e;border-radius:16px;border:1px solid #2d2d4e;overflow:hidden;}
  .header{background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;}
  .header h1{margin:0;color:#fff;font-size:22px;font-weight:700;}
  .body{padding:32px;}
  .body p{margin:0 0 16px;color:#a0aec0;font-size:15px;line-height:1.7;}
  .btn{display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff!important;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;}
  .code{background:#0f0f1a;border:1px solid #2d2d4e;border-radius:8px;padding:16px;font-family:monospace;font-size:18px;letter-spacing:4px;color:#6366f1;text-align:center;margin:16px 0;}
  .footer{padding:20px 32px;border-top:1px solid #2d2d4e;}
  .footer p{margin:0;color:#4a5568;font-size:12px;}
</style></head>
<body><div class="wrapper"><div class="card">
<div class="header"><h1>⚡ Nexus</h1></div>
<div class="body">${content}</div>
<div class="footer"><p>You received this because you have a Nexus account.</p></div>
</div></div></body></html>`;
}

async function sendEmail({ to, subject, html }) {
  try {
    const info = await getTransporter().sendMail({
      from: `"Nexus" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to, subject, html,
    });
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    logger.error(`Email failed to ${to}:`, err.message);
    throw err;
  }
}

async function sendVerificationEmail({ to, fullName, verifyToken }) {
  const url = `${process.env.APP_URL || 'http://localhost:5173'}/verify-email?token=${verifyToken}`;
  return sendEmail({
    to, subject: 'Verify your Nexus email',
    html: baseTemplate(`
      <p>Hi ${fullName},</p>
      <p>Thanks for signing up! Click the button below to verify your email address.</p>
      <p style="text-align:center;margin:24px 0"><a class="btn" href="${url}">Verify Email →</a></p>
      <p style="font-size:13px;color:#4a5568">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
    `),
  });
}

async function sendWelcomeEmail({ to, fullName }) {
  return sendEmail({
    to, subject: 'Welcome to Nexus 👋',
    html: baseTemplate(`
      <p>Hi ${fullName},</p>
      <p>Your email is verified and your Nexus account is ready. Start managing projects with your team.</p>
      <p style="text-align:center;margin:24px 0"><a class="btn" href="${process.env.APP_URL || 'http://localhost:5173'}/dashboard">Open Dashboard →</a></p>
    `),
  });
}

async function sendPasswordResetEmail({ to, fullName, resetToken }) {
  const url = `${process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
  return sendEmail({
    to, subject: 'Reset your Nexus password',
    html: baseTemplate(`
      <p>Hi ${fullName},</p>
      <p>You requested a password reset. Click below to set a new password. This link expires in <strong>1 hour</strong>.</p>
      <p style="text-align:center;margin:24px 0"><a class="btn" href="${url}">Reset Password →</a></p>
      <p style="font-size:13px;color:#4a5568">If you didn't request this, you can safely ignore this email.</p>
    `),
  });
}

async function sendTaskAssignedEmail({ to, fullName, taskTitle, projectName, taskUrl }) {
  return sendEmail({
    to, subject: `You've been assigned: ${taskTitle}`,
    html: baseTemplate(`
      <p>Hi ${fullName},</p>
      <p>A task in <strong style="color:#e2e8f0">${projectName}</strong> has been assigned to you:</p>
      <div style="background:#0f0f1a;border-left:3px solid #6366f1;padding:12px 16px;border-radius:4px;margin:16px 0;font-weight:500;color:#e2e8f0">${taskTitle}</div>
      <p style="text-align:center;margin:24px 0"><a class="btn" href="${taskUrl}">View Task →</a></p>
    `),
  });
}

module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendTaskAssignedEmail,
};
