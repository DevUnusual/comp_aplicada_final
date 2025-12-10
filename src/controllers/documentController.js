import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
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
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
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
            message: 'Documento enviado com sucesso',
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
        
        res.status(500).json({ error: 'Falha ao enviar documento' });
    }
}

/**
 * Upload multiple documents
 * POST /api/documents/upload-multiple
 */
export async function uploadMultipleDocuments(req, res) {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
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
            message: `${documents.length} documentos enviados com sucesso`,
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
        
        res.status(500).json({ error: 'Falha ao enviar documentos' });
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
        res.status(500).json({ error: 'Falha ao obter documentos' });
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
            return res.status(404).json({ error: 'Documento não encontrado' });
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
        res.status(500).json({ error: 'Falha ao obter documento' });
    }
}

/**
 * Download document PDF
 * GET /api/documents/:id/download
 */
export async function downloadDocument(req, res) {
    try {
        const { id } = req.params;

        const document = db.findDocumentById(id);

        if (!document || document.userId !== req.userId) {
            return res.status(404).json({ error: 'Documento não encontrado' });
        }

        // Check if file exists
        if (!fs.existsSync(document.filePath)) {
            return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
        }

        // Set headers for download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.originalName)}"`);
        res.setHeader('Content-Length', document.fileSize);

        // Stream the file
        const fileStream = fs.createReadStream(document.filePath);
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error('File stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Erro ao baixar arquivo' });
            }
        });

    } catch (error) {
        console.error('Download document error:', error);
        res.status(500).json({ error: 'Falha ao baixar documento' });
    }
}

/**
 * Download extracted text from document
 * GET /api/documents/:id/download-text
 */
export async function downloadDocumentText(req, res) {
    try {
        const { id } = req.params;

        const document = db.findDocumentById(id);

        if (!document || document.userId !== req.userId) {
            return res.status(404).json({ error: 'Documento não encontrado' });
        }

        if (!document.extractedText) {
            return res.status(400).json({ error: 'Documento não possui texto extraído' });
        }

        // Generate filename
        const baseName = path.basename(document.originalName, '.pdf');
        const filename = `${baseName}_texto.txt`;

        // Set headers for download
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

        // Send the text
        res.send(document.extractedText);

    } catch (error) {
        console.error('Download document text error:', error);
        res.status(500).json({ error: 'Falha ao baixar texto do documento' });
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
            return res.status(404).json({ error: 'Documento não encontrado' });
        }

        await deleteFile(document.filePath).catch(console.error);
        db.deleteDocument(id);

        res.json({ message: 'Documento deletado com sucesso' });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: 'Falha ao deletar documento' });
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
            return res.status(400).json({ error: 'IDs de documentos são obrigatórios' });
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
            message: `${deletedCount} documentos deletados com sucesso`,
            deletedCount
        });
    } catch (error) {
        console.error('Delete multiple documents error:', error);
        res.status(500).json({ error: 'Falha ao deletar documentos' });
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
            return res.status(404).json({ error: 'Documento não encontrado' });
        }

        db.updateDocument(id, {
            status: 'processing',
            errorMessage: null
        });

        extractTextAsync(id);

        res.json({ 
            message: 'Reprocessamento do documento iniciado',
            document: {
                id: document.id,
                status: 'processing'
            }
        });
    } catch (error) {
        console.error('Reprocess document error:', error);
        res.status(500).json({ error: 'Falha ao reprocessar documento' });
    }
}

export default {
    uploadDocument,
    uploadMultipleDocuments,
    getDocuments,
    getDocument,
    downloadDocument,
    downloadDocumentText,
    deleteDocument,
    deleteMultipleDocuments,
    reprocessDocument
};