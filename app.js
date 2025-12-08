import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ES Module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import database
import db from './src/config/database.js';

// Import routes
import authRoutes from './src/routes/auth.js';
import documentRoutes from './src/routes/documents.js';
import summaryRoutes from './src/routes/summaries.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files (protected - apenas para debug, remover em produção)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/summaries', summaryRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Document Summary API is running with LangChain',
        version: '2.0.0',
        timestamp: new Date().toISOString()
    });
});

// Debug route - verificar status do sistema
app.get('/api/debug', (req, res) => {
    const allDocs = db.data.documents || [];
    const allUsers = db.data.users || [];
    
    // Verificar pasta uploads
    const uploadsPath = path.join(__dirname, 'uploads');
    let uploadedFiles = [];
    try {
        const readDir = (dir, prefix = '') => {
            const items = fs.readdirSync(dir);
            items.forEach(item => {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    readDir(fullPath, prefix + item + '/');
                } else {
                    uploadedFiles.push({
                        path: prefix + item,
                        size: stat.size,
                        modified: stat.mtime
                    });
                }
            });
        };
        readDir(uploadsPath);
    } catch (e) {
        uploadedFiles = [{ error: e.message }];
    }
    
    res.json({
        timestamp: new Date().toISOString(),
        stats: {
            totalUsers: allUsers.length,
            totalDocuments: allDocs.length,
            byStatus: {
                uploaded: allDocs.filter(d => d.status === 'uploaded').length,
                processing: allDocs.filter(d => d.status === 'processing').length,
                processed: allDocs.filter(d => d.status === 'processed').length,
                error: allDocs.filter(d => d.status === 'error').length
            }
        },
        documents: allDocs.map(d => ({
            id: d.id,
            originalName: d.originalName,
            status: d.status,
            fileSize: d.fileSize,
            pageCount: d.pageCount,
            hasText: !!(d.extractedText && d.extractedText.length > 0),
            textLength: d.extractedText?.length || 0,
            errorMessage: d.errorMessage,
            filePath: d.filePath,
            fileExists: fs.existsSync(d.filePath),
            createdAt: d.createdAt,
            updatedAt: d.updatedAt
        })),
        uploadedFiles: uploadedFiles,
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            uptime: process.uptime() + ' seconds'
        }
    });
});

// Debug route - forçar reprocessamento de todos os documentos travados
app.post('/api/debug/reprocess-stuck', async (req, res) => {
    const { loadAndExtractPDF } = await import('./src/services/pdfService.js');
    
    const stuckDocs = (db.data.documents || []).filter(d => d.status === 'processing');
    
    console.log(`[DEBUG] Found ${stuckDocs.length} stuck documents`);
    
    const results = [];
    
    for (const doc of stuckDocs) {
        console.log(`[DEBUG] Reprocessing: ${doc.originalName}`);
        try {
            if (!fs.existsSync(doc.filePath)) {
                throw new Error(`File not found: ${doc.filePath}`);
            }
            
            const result = await loadAndExtractPDF(doc.filePath);
            
            db.updateDocument(doc.id, {
                extractedText: result.text,
                pageCount: result.pages,
                status: 'processed'
            });
            
            results.push({ id: doc.id, name: doc.originalName, status: 'processed', pages: result.pages });
            console.log(`[DEBUG] ✅ ${doc.originalName} processed`);
        } catch (error) {
            db.updateDocument(doc.id, {
                status: 'error',
                errorMessage: error.message
            });
            results.push({ id: doc.id, name: doc.originalName, status: 'error', error: error.message });
            console.log(`[DEBUG] ❌ ${doc.originalName} failed: ${error.message}`);
        }
    }
    
    res.json({
        message: `Reprocessed ${stuckDocs.length} stuck documents`,
        results
    });
});

// Debug route - testar extração de PDF específico
app.get('/api/debug/test-pdf/:docId', async (req, res) => {
    const { loadAndExtractPDF } = await import('./src/services/pdfService.js');
    
    const doc = db.findDocumentById(req.params.docId);
    
    if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
    }
    
    const fileExists = fs.existsSync(doc.filePath);
    
    if (!fileExists) {
        return res.json({
            document: doc,
            fileExists: false,
            error: 'File does not exist on disk'
        });
    }
    
    const fileStats = fs.statSync(doc.filePath);
    
    try {
        console.log(`[DEBUG] Testing PDF extraction with LangChain: ${doc.filePath}`);
        const startTime = Date.now();
        const result = await loadAndExtractPDF(doc.filePath);
        const duration = Date.now() - startTime;
        
        res.json({
            document: {
                id: doc.id,
                originalName: doc.originalName,
                status: doc.status
            },
            file: {
                exists: true,
                path: doc.filePath,
                sizeBytes: fileStats.size,
                sizeMB: (fileStats.size / 1024 / 1024).toFixed(2)
            },
            extraction: {
                success: true,
                method: 'LangChain PDFLoader',
                durationMs: duration,
                pages: result.pages,
                textLength: result.text.length,
                textPreview: result.text.substring(0, 500) + '...',
                metadata: result.metadata
            }
        });
    } catch (error) {
        res.json({
            document: {
                id: doc.id,
                originalName: doc.originalName,
                status: doc.status
            },
            file: {
                exists: true,
                path: doc.filePath,
                sizeBytes: fileStats.size,
                sizeMB: (fileStats.size / 1024 / 1024).toFixed(2)
            },
            extraction: {
                success: false,
                error: error.message,
                stack: error.stack
            }
        });
    }
});

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle SPA routes - serve index.html for unmatched routes
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint not found' });
    }
    const htmlFile = path.join(__dirname, 'public', req.path);
    res.sendFile(htmlFile, (err) => {
        if (err) {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start server
console.log('✅ Database initialized (JSON file-based)');
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 LangChain integration enabled`);
});
