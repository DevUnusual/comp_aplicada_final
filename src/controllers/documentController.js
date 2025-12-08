import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';
import { deleteFile } from '../middlewares/upload.js';
import { loadAndExtractPDF, cleanText } from '../services/pdfService.js';

/**
 * Upload single document
 * POST /api/documents/upload
 */
export async function uploadDocument(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const file = req.file;

        const document = db.createDocument({
            id: uuidv4(),
            userId: req.userId,
            originalName: file.originalname,
            storedName: file.filename,
            filePath: file.path,
            fileSize: file.size,
            mimeType: file.mimetype,
            status: 'processing',
            extractedText: null,
            pageCount: null,
            errorMessage: null
        });

        // Extract text in background using LangChain
        extractTextAsync(document.id);

        res.status(201).json({
            message: 'Document uploaded successfully',
            document: {
                id: document.id,
                originalName: document.originalName,
                fileSize: document.fileSize,
                status: document.status,
                createdAt: document.createdAt
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        
        if (req.file) {
            await deleteFile(req.file.path).catch(console.error);
        }
        
        res.status(500).json({ error: 'Failed to upload document' });
    }
}

/**
 * Upload multiple documents
 * POST /api/documents/upload-multiple
 */
export async function uploadMultipleDocuments(req, res) {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const documents = [];

        for (const file of req.files) {
            const document = db.createDocument({
                id: uuidv4(),
                userId: req.userId,
                originalName: file.originalname,
                storedName: file.filename,
                filePath: file.path,
                fileSize: file.size,
                mimeType: file.mimetype,
                status: 'processing',
                extractedText: null,
                pageCount: null,
                errorMessage: null
            });

            documents.push(document);
            
            // Extract text in background
            extractTextAsync(document.id);
        }

        res.status(201).json({
            message: `${documents.length} documents uploaded successfully`,
            documents: documents.map(doc => ({
                id: doc.id,
                originalName: doc.originalName,
                fileSize: doc.fileSize,
                status: doc.status,
                createdAt: doc.createdAt
            }))
        });
    } catch (error) {
        console.error('Multiple upload error:', error);
        
        if (req.files) {
            for (const file of req.files) {
                await deleteFile(file.path).catch(console.error);
            }
        }
        
        res.status(500).json({ error: 'Failed to upload documents' });
    }
}

/**
 * Extract text from PDF asynchronously using LangChain
 */
async function extractTextAsync(documentId) {
    console.log(`[PDF] Starting extraction for document ${documentId}`);
    
    try {
        const document = db.findDocumentById(documentId);
        if (!document) {
            console.log(`[PDF] Document ${documentId} not found in database`);
            return;
        }

        console.log(`[PDF] Extracting text using LangChain from: ${document.filePath}`);
        
        // Use LangChain PDFLoader
        const result = await loadAndExtractPDF(document.filePath);
        
        console.log(`[PDF] Extracted ${result.text.length} characters, ${result.pages} pages`);
        
        db.updateDocument(documentId, {
            extractedText: result.text,
            pageCount: result.pages,
            status: 'processed'
        });
        
        console.log(`[PDF] ✅ Document ${documentId} processed successfully`);
    } catch (error) {
        console.error(`[PDF] ❌ Error processing document ${documentId}:`, error.message);
        db.updateDocument(documentId, {
            status: 'error',
            errorMessage: error.message
        });
    }
}

/**
 * Get all documents for current user
 * GET /api/documents
 */
export async function getDocuments(req, res) {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        
        const offset = (page - 1) * limit;

        const { documents, total } = db.findDocumentsByUserId(req.userId, {
            status,
            limit: parseInt(limit),
            offset: offset
        });

        res.json({
            documents: documents.map(d => ({
                id: d.id,
                originalName: d.originalName,
                fileSize: d.fileSize,
                pageCount: d.pageCount,
                status: d.status,
                createdAt: d.createdAt,
                updatedAt: d.updatedAt
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Failed to get documents' });
    }
}

/**
 * Get single document by ID
 * GET /api/documents/:id
 */
export async function getDocument(req, res) {
    try {
        const { id } = req.params;
        const { includeText } = req.query;

        const document = db.findDocumentById(id);

        if (!document || document.userId !== req.userId) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const response = {
            id: document.id,
            originalName: document.originalName,
            fileSize: document.fileSize,
            pageCount: document.pageCount,
            status: document.status,
            errorMessage: document.errorMessage,
            createdAt: document.createdAt,
            updatedAt: document.updatedAt
        };

        if (includeText === 'true') {
            response.extractedText = document.extractedText;
        }

        res.json({ document: response });
    } catch (error) {
        console.error('Get document error:', error);
        res.status(500).json({ error: 'Failed to get document' });
    }
}

/**
 * Delete document
 * DELETE /api/documents/:id
 */
export async function deleteDocument(req, res) {
    try {
        const { id } = req.params;

        const document = db.findDocumentById(id);

        if (!document || document.userId !== req.userId) {
            return res.status(404).json({ error: 'Document not found' });
        }

        await deleteFile(document.filePath).catch(console.error);
        db.deleteDocument(id);

        res.json({ message: 'Document deleted successfully' });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
}

/**
 * Delete multiple documents
 * DELETE /api/documents
 */
export async function deleteMultipleDocuments(req, res) {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Document IDs are required' });
        }

        let deletedCount = 0;

        for (const id of ids) {
            const document = db.findDocumentById(id);
            if (document && document.userId === req.userId) {
                await deleteFile(document.filePath).catch(console.error);
                db.deleteDocument(id);
                deletedCount++;
            }
        }

        res.json({ 
            message: `${deletedCount} documents deleted successfully`,
            deletedCount
        });
    } catch (error) {
        console.error('Delete multiple documents error:', error);
        res.status(500).json({ error: 'Failed to delete documents' });
    }
}

/**
 * Reprocess document (re-extract text)
 * POST /api/documents/:id/reprocess
 */
export async function reprocessDocument(req, res) {
    try {
        const { id } = req.params;

        const document = db.findDocumentById(id);

        if (!document || document.userId !== req.userId) {
            return res.status(404).json({ error: 'Document not found' });
        }

        db.updateDocument(id, {
            status: 'processing',
            errorMessage: null
        });

        extractTextAsync(id);

        res.json({ 
            message: 'Document reprocessing started',
            document: {
                id: document.id,
                status: 'processing'
            }
        });
    } catch (error) {
        console.error('Reprocess document error:', error);
        res.status(500).json({ error: 'Failed to reprocess document' });
    }
}

export default {
    uploadDocument,
    uploadMultipleDocuments,
    getDocuments,
    getDocument,
    deleteDocument,
    deleteMultipleDocuments,
    reprocessDocument
};
