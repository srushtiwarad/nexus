// ============================================================
// nexus/backend/src/controllers/attachment.controller.js
// Generates presigned S3 upload URLs and records attachments.
// Files are never routed through the API server — clients
// upload directly to S3, then confirm with POST /confirm.
// ============================================================
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET = process.env.S3_BUCKET;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/csv', 'text/markdown',
  'application/json',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

// ── Request presigned upload URL ──────────────────────────────
async function requestUploadUrl(req, res, next) {
  try {
    const { taskId, projectId } = req.params;
    const { filename, mimeType, sizeBytes } = req.body;

    if (!filename || !mimeType || !sizeBytes) {
      throw new AppError('filename, mimeType and sizeBytes are required', 400);
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new AppError(`File type ${mimeType} is not allowed`, 400);
    }
    if (parseInt(sizeBytes) > MAX_FILE_SIZE) {
      throw new AppError('File exceeds maximum size of 25 MB', 400);
    }

    // Sanitise filename — only alphanumeric, dots, dashes, underscores
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
    const s3Key = `attachments/${projectId}/${taskId}/${uuidv4()}/${safeName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: mimeType,
      ContentLength: parseInt(sizeBytes),
      // Server-side encryption
      ServerSideEncryption: 'AES256',
      // Tag for lifecycle policy
      Tagging: `project=${projectId}&task=${taskId}`,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min

    res.json({ uploadUrl, s3Key, expiresIn: 300 });
  } catch (err) { next(err); }
}

// ── Confirm upload (after client PUT to S3) ───────────────────
async function confirmUpload(req, res, next) {
  try {
    const { taskId } = req.params;
    const { s3Key, filename, mimeType, sizeBytes } = req.body;

    if (!s3Key || !filename || !mimeType || !sizeBytes) {
      throw new AppError('s3Key, filename, mimeType and sizeBytes are required', 400);
    }

    // Verify the object actually exists in S3 before recording it
    try {
      await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
    } catch {
      throw new AppError('Upload not found in S3 — please retry the upload', 400);
    }

    const result = await query(`
      INSERT INTO attachments (task_id, uploader_id, filename, mime_type, size_bytes, s3_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [taskId, req.user.id, filename, mimeType, parseInt(sizeBytes), s3Key]);

    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
}

// ── List attachments for a task ───────────────────────────────
async function listAttachments(req, res, next) {
  try {
    const { taskId } = req.params;
    const result = await query(`
      SELECT a.*, u.full_name AS uploader_name
      FROM attachments a
      JOIN users u ON u.id = a.uploader_id
      WHERE a.task_id = $1
      ORDER BY a.created_at DESC
    `, [taskId]);

    // Generate short-lived download URLs for each attachment
    const attachments = await Promise.all(result.rows.map(async (att) => {
      const cmd = new GetObjectCommand({
        Bucket: BUCKET,
        Key: att.s3_key,
        ResponseContentDisposition: `attachment; filename="${att.filename}"`,
      });
      const downloadUrl = await getSignedUrl(s3, cmd, { expiresIn: 900 }); // 15 min
      return { ...att, downloadUrl };
    }));

    res.json(attachments);
  } catch (err) { next(err); }
}

// ── Delete attachment ─────────────────────────────────────────
async function deleteAttachment(req, res, next) {
  try {
    const { attachmentId } = req.params;

    const result = await query(
      'SELECT * FROM attachments WHERE id = $1',
      [attachmentId]
    );
    if (!result.rows.length) throw new AppError('Attachment not found', 404);
    const att = result.rows[0];

    // Only uploader or project admin can delete
    const isAdmin = ['admin', 'owner'].includes(req.projectRole);
    if (att.uploader_id !== req.user.id && !isAdmin) {
      throw new AppError('Cannot delete another user\'s attachment', 403);
    }

    // Delete from S3 first, then DB
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: att.s3_key }));
    await query('DELETE FROM attachments WHERE id = $1', [attachmentId]);

    res.json({ message: 'Attachment deleted' });
  } catch (err) { next(err); }
}

module.exports = { requestUploadUrl, confirmUpload, listAttachments, deleteAttachment };
