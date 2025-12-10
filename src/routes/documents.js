import { Router } from 'express';
import * as documentController from '../controllers/documentController.js';
import { authenticate } from '../middlewares/auth.js';
import { upload, handleUploadError } from '../middlewares/upload.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Upload routes
router.post('/upload', upload.single('file'), handleUploadError, documentController.uploadDocument);
router.post('/upload-multiple', upload.array('files', 10), handleUploadError, documentController.uploadMultipleDocuments);

// CRUD routes
router.get('/', documentController.getDocuments);
router.get('/:id', documentController.getDocument);
router.delete('/:id', documentController.deleteDocument);
router.delete('/', documentController.deleteMultipleDocuments);

// Download routes
router.get('/:id/download', documentController.downloadDocument);
router.get('/:id/download-text', documentController.downloadDocumentText);

// Reprocess route
router.post('/:id/reprocess', documentController.reprocessDocument);

export default router;