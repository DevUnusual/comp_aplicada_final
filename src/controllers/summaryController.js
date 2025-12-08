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
            return res.status(400).json({ error: 'Document ID is required' });
        }

        if (!isConfigured()) {
            return res.status(503).json({ 
                error: 'OpenAI API is not configured. Please set OPENAI_API_KEY in environment.' 
            });
        }

        const document = db.findDocumentById(documentId);

        if (!document || document.userId !== req.userId) {
            return res.status(404).json({ error: 'Document not found' });
        }

        if (document.status !== 'processed') {
            return res.status(400).json({ 
                error: `Document is not ready for summarization. Status: ${document.status}` 
            });
        }

        if (!document.extractedText || document.extractedText.trim().length === 0) {
            return res.status(400).json({ 
                error: 'Document has no text content to summarize' 
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
            message: 'Summary generated successfully',
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
        res.status(500).json({ error: error.message || 'Failed to generate summary' });
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
                error: 'At least 2 document IDs are required' 
            });
        }

        if (!isConfigured()) {
            return res.status(503).json({ 
                error: 'OpenAI API is not configured. Please set OPENAI_API_KEY in environment.' 
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
                error: 'At least 2 processed documents with text content are required' 
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
            message: 'Integrated summary generated successfully',
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
        res.status(500).json({ error: error.message || 'Failed to generate integrated summary' });
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
        res.status(500).json({ error: 'Failed to get summaries' });
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
        res.status(500).json({ error: 'Failed to get summary' });
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
            return res.status(404).json({ error: 'Summary not found' });
        }

        db.deleteSummary(id);

        res.json({ message: 'Summary deleted successfully' });
    } catch (error) {
        console.error('Delete summary error:', error);
        res.status(500).json({ error: 'Failed to delete summary' });
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
                message: configured ? 'LangChain/OpenAI API is configured' : 'OpenAI API key not set'
            },
            connectionTest
        });
    } catch (error) {
        console.error('Get API status error:', error);
        res.status(500).json({ error: 'Failed to get API status' });
    }
}

export default {
    createSingleSummary,
    createMultipleSummary,
    getSummaries,
    getSummary,
    deleteSummary,
    getApiStatus
};
