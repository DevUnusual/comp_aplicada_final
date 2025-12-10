import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';
import { 
    generateSingleSummary, 
    generateMultipleSummary, 
    testConnection 
} from '../services/langchainService.js';
import { isConfigured, DEFAULT_MODEL } from '../config/langchain.js';
import { truncateText } from '../services/pdfService.js';

// Maximum text length for LLM
const MAX_TEXT_LENGTH = 50000;

/**
 * Generate summary for a single document
 * POST /api/summaries/single
 */
export async function createSingleSummary(req, res) {
    try {
        const { documentId, title, model } = req.body;

        if (!documentId) {
            return res.status(400).json({ error: 'ID do documento é obrigatório' });
        }

        if (!isConfigured()) {
            return res.status(503).json({ 
                error: 'API da OpenAI não está configurada. Por favor, defina OPENAI_API_KEY no ambiente.' 
            });
        }

        const document = db.findDocumentById(documentId);

        if (!document || document.userId !== req.userId) {
            return res.status(404).json({ error: 'Documento não encontrado' });
        }

        if (document.status !== 'processed') {
            return res.status(400).json({ 
                error: `Documento não está pronto para resumo. Status: ${document.status}` 
            });
        }

        if (!document.extractedText || document.extractedText.trim().length === 0) {
            return res.status(400).json({ 
                error: 'Documento não possui conteúdo de texto para resumir' 
            });
        }

        console.log(`[Summary] Generating single summary for document ${documentId}`);

        // Generate summary using LangChain
        const result = await generateSingleSummary(document.extractedText, {
            model: model || DEFAULT_MODEL
        });

        // Create summary record
        const summary = db.createSummary({
            id: uuidv4(),
            userId: req.userId,
            title: title || `Summary of ${document.originalName}`,
            content: result.summary,
            type: 'single',
            documentIds: JSON.stringify([documentId]),
            model: result.model,
            tokensUsed: result.tokensUsed,
            processingTime: result.processingTime,
            method: result.method
        });

        res.status(201).json({
            message: 'Resumo gerado com sucesso',
            summary: {
                id: summary.id,
                title: summary.title,
                content: summary.content,
                type: summary.type,
                documentIds: [documentId],
                model: summary.model,
                tokensUsed: summary.tokensUsed,
                processingTime: summary.processingTime,
                method: result.method,
                createdAt: summary.createdAt
            }
        });
    } catch (error) {
        console.error('Create single summary error:', error);
        res.status(500).json({ error: error.message || 'Falha ao gerar resumo' });
    }
}

/**
 * Generate integrated summary for multiple documents
 * POST /api/summaries/multiple
 */
export async function createMultipleSummary(req, res) {
    try {
        const { documentIds, title, model } = req.body;

        if (!documentIds || !Array.isArray(documentIds) || documentIds.length < 2) {
            return res.status(400).json({ 
                error: 'Pelo menos 2 IDs de documentos são obrigatórios' 
            });
        }

        if (!isConfigured()) {
            return res.status(503).json({ 
                error: 'API da OpenAI não está configurada. Por favor, defina OPENAI_API_KEY no ambiente.' 
            });
        }

        // Get documents
        const documents = [];
        for (const id of documentIds) {
            const doc = db.findDocumentById(id);
            if (doc && doc.userId === req.userId && doc.status === 'processed' && doc.extractedText) {
                documents.push(doc);
            }
        }

        if (documents.length < 2) {
            return res.status(400).json({ 
                error: 'Pelo menos 2 documentos processados com conteúdo de texto são obrigatórios' 
            });
        }

        console.log(`[Summary] Generating integrated summary for ${documents.length} documents`);

        // Prepare documents for LangChain
        const docsForSummary = documents.map(doc => ({
            name: doc.originalName,
            text: doc.extractedText
        }));

        // Generate integrated summary using LangChain
        const result = await generateMultipleSummary(docsForSummary, {
            model: model || DEFAULT_MODEL
        });

        // Create summary record
        const summary = db.createSummary({
            id: uuidv4(),
            userId: req.userId,
            title: title || `Integrated Summary (${documents.length} documents)`,
            content: result.summary,
            type: 'multiple',
            documentIds: JSON.stringify(documents.map(d => d.id)),
            model: result.model,
            tokensUsed: result.tokensUsed,
            processingTime: result.processingTime,
            method: result.method
        });

        res.status(201).json({
            message: 'Resumo integrado gerado com sucesso',
            summary: {
                id: summary.id,
                title: summary.title,
                content: summary.content,
                type: summary.type,
                documentIds: documents.map(d => d.id),
                documentsIncluded: documents.map(d => ({
                    id: d.id,
                    name: d.originalName
                })),
                model: summary.model,
                tokensUsed: summary.tokensUsed,
                processingTime: summary.processingTime,
                method: result.method,
                createdAt: summary.createdAt
            }
        });
    } catch (error) {
        console.error('Create multiple summary error:', error);
        res.status(500).json({ error: error.message || 'Falha ao gerar resumo integrado' });
    }
}

/**
 * Get all summaries for current user
 * GET /api/summaries
 */
export async function getSummaries(req, res) {
    try {
        const { type, page = 1, limit = 20 } = req.query;
        
        const offset = (page - 1) * limit;

        const { summaries, total } = db.findSummariesByUserId(req.userId, {
            type,
            limit: parseInt(limit),
            offset: offset
        });

        res.json({
            summaries: summaries.map(s => ({
                id: s.id,
                title: s.title,
                type: s.type,
                documentIds: JSON.parse(s.documentIds || '[]'),
                model: s.model,
                tokensUsed: s.tokensUsed,
                processingTime: s.processingTime,
                method: s.method,
                createdAt: s.createdAt
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get summaries error:', error);
        res.status(500).json({ error: 'Falha ao obter resumos' });
    }
}

/**
 * Get single summary by ID
 * GET /api/summaries/:id
 */
export async function getSummary(req, res) {
    try {
        const { id } = req.params;

        const summary = db.findSummaryById(id);

        if (!summary || summary.userId !== req.userId) {
            return res.status(404).json({ error: 'Summary not found' });
        }

        const documentIds = JSON.parse(summary.documentIds || '[]');
        
        // Get associated documents info
        const documents = documentIds
            .map(docId => db.findDocumentById(docId))
            .filter(Boolean)
            .map(d => ({
                id: d.id,
                originalName: d.originalName,
                pageCount: d.pageCount
            }));

        res.json({
            summary: {
                id: summary.id,
                title: summary.title,
                content: summary.content,
                type: summary.type,
                documentIds,
                documents,
                model: summary.model,
                tokensUsed: summary.tokensUsed,
                processingTime: summary.processingTime,
                method: summary.method,
                createdAt: summary.createdAt
            }
        });
    } catch (error) {
        console.error('Get summary error:', error);
        res.status(500).json({ error: 'Falha ao obter resumo' });
    }
}

/**
 * Download summary as TXT file
 * GET /api/summaries/:id/download
 */
export async function downloadSummary(req, res) {
    try {
        const { id } = req.params;
        const { format = 'txt' } = req.query;

        const summary = db.findSummaryById(id);

        if (!summary || summary.userId !== req.userId) {
            return res.status(404).json({ error: 'Resumo não encontrado' });
        }

        // Get associated documents info
        const documentIds = JSON.parse(summary.documentIds || '[]');
        const documents = documentIds
            .map(docId => db.findDocumentById(docId))
            .filter(Boolean);

        // Build file content
        let content = '';
        const createdDate = new Date(summary.createdAt).toLocaleString('pt-BR');
        
        if (format === 'md') {
            // Markdown format
            content = `# ${summary.title}\n\n`;
            content += `**Data:** ${createdDate}\n`;
            content += `**Tipo:** ${summary.type === 'single' ? 'Resumo Individual' : 'Resumo Integrado'}\n`;
            content += `**Modelo:** ${summary.model}\n`;
            
            if (documents.length > 0) {
                content += `\n## Documentos Fonte\n\n`;
                documents.forEach((doc, i) => {
                    content += `${i + 1}. ${doc.originalName}\n`;
                });
            }
            
            content += `\n## Resumo\n\n`;
            content += summary.content;
            
            if (summary.tokensUsed || summary.processingTime) {
                content += `\n\n---\n\n`;
                content += `**Metadados:**\n`;
                if (summary.tokensUsed) content += `- Tokens utilizados: ${summary.tokensUsed}\n`;
                if (summary.processingTime) content += `- Tempo de processamento: ${(summary.processingTime / 1000).toFixed(1)}s\n`;
                if (summary.method) content += `- Método: ${summary.method}\n`;
            }
        } else {
            // Plain text format
            content = `${summary.title}\n`;
            content += `${'='.repeat(summary.title.length)}\n\n`;
            content += `Data: ${createdDate}\n`;
            content += `Tipo: ${summary.type === 'single' ? 'Resumo Individual' : 'Resumo Integrado'}\n`;
            content += `Modelo: ${summary.model}\n`;
            
            if (documents.length > 0) {
                content += `\nDocumentos Fonte:\n`;
                documents.forEach((doc, i) => {
                    content += `  ${i + 1}. ${doc.originalName}\n`;
                });
            }
            
            content += `\n${'─'.repeat(50)}\n\n`;
            content += `RESUMO:\n\n`;
            content += summary.content;
            
            if (summary.tokensUsed || summary.processingTime) {
                content += `\n\n${'─'.repeat(50)}\n\n`;
                content += `Metadados:\n`;
                if (summary.tokensUsed) content += `  - Tokens utilizados: ${summary.tokensUsed}\n`;
                if (summary.processingTime) content += `  - Tempo de processamento: ${(summary.processingTime / 1000).toFixed(1)}s\n`;
                if (summary.method) content += `  - Método: ${summary.method}\n`;
            }
        }

        // Generate filename
        const safeTitle = summary.title
            .replace(/[^a-zA-Z0-9\s\-_àáâãéêíóôõúüçÀÁÂÃÉÊÍÓÔÕÚÜÇ]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);
        const extension = format === 'md' ? 'md' : 'txt';
        const filename = `${safeTitle}_resumo.${extension}`;

        // Set headers for download
        const contentType = format === 'md' ? 'text/markdown' : 'text/plain';
        res.setHeader('Content-Type', `${contentType}; charset=utf-8`);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

        // Send the content
        res.send(content);

    } catch (error) {
        console.error('Download summary error:', error);
        res.status(500).json({ error: 'Falha ao baixar resumo' });
    }
}

/**
 * Delete summary
 * DELETE /api/summaries/:id
 */
export async function deleteSummary(req, res) {
    try {
        const { id } = req.params;

        const summary = db.findSummaryById(id);

        if (!summary || summary.userId !== req.userId) {
            return res.status(404).json({ error: 'Resumo não encontrado' });
        }

        db.deleteSummary(id);

        res.json({ message: 'Resumo deletado com sucesso' });
    } catch (error) {
        console.error('Delete summary error:', error);
        res.status(500).json({ error: 'Falha ao deletar resumo' });
    }
}

/**
 * Check LangChain/OpenAI API status
 * GET /api/summaries/status
 */
export async function getApiStatus(req, res) {
    try {
        const configured = isConfigured();
        
        let connectionTest = null;
        if (configured) {
            connectionTest = await testConnection();
        }
        
        res.json({
            langchain: {
                configured,
                defaultModel: DEFAULT_MODEL,
                message: configured ? 'LangChain/API da OpenAI está configurada' : 'Chave da API OpenAI não definida'
            },
            connectionTest
        });
    } catch (error) {
        console.error('Get API status error:', error);
        res.status(500).json({ error: 'Falha ao obter status da API' });
    }
}

export default {
    createSingleSummary,
    createMultipleSummary,
    getSummaries,
    getSummary,
    downloadSummary,
    deleteSummary,
    getApiStatus
};