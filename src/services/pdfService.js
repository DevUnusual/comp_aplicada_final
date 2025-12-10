import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

/**
 * Carrega e extrai texto de um PDF usando LangChain PDFLoader
 * @param {string} filePath - Caminho do arquivo PDF
 * @returns {Promise<{text: string, pages: number, documents: Array, metadata: object}>}
 */
export async function loadAndExtractPDF(filePath) {
    console.log(`[PDFService] Loading PDF: ${filePath}`);
    
    try {
        // Usar PDFLoader do LangChain
        const loader = new PDFLoader(filePath, {
            splitPages: true,  // Divide por páginas
        });

        // Carregar documentos
        const docs = await loader.load();
        
        console.log(`[PDFService] Loaded ${docs.length} pages`);

        // Combinar texto de todas as páginas
        const fullText = docs.map(doc => doc.pageContent).join('\n\n');
        
        // Extrair metadados do primeiro documento
        const metadata = docs[0]?.metadata || {};

        return {
            text: cleanText(fullText),
            pages: docs.length,
            documents: docs,
            metadata: {
                source: metadata.source,
                pdf: metadata.pdf,
            }
        };
    } catch (error) {
        console.error(`[PDFService] Error loading PDF:`, error.message);
        throw new Error(`Failed to load PDF: ${error.message}`);
    }
}

/**
 * Divide texto em chunks para processamento
 * Útil para documentos grandes que excedem o limite de tokens
 * @param {string} text - Texto a ser dividido
 * @param {object} options - Opções de divisão
 * @returns {Promise<Array<string>>}
 */
export async function splitText(text, options = {}) {
    const {
        chunkSize = 4000,
        chunkOverlap = 200,
    } = options;

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ['\n\n', '\n', '. ', ' ', ''],
    });

    const chunks = await splitter.splitText(text);
    
    console.log(`[PDFService] Split text into ${chunks.length} chunks`);
    
    return chunks;
}

/**
 * Divide documentos LangChain em chunks menores
 * @param {Array} documents - Array de documentos LangChain
 * @param {object} options - Opções de divisão
 * @returns {Promise<Array>}
 */
export async function splitDocuments(documents, options = {}) {
    const {
        chunkSize = 4000,
        chunkOverlap = 200,
    } = options;

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
    });

    const splitDocs = await splitter.splitDocuments(documents);
    
    console.log(`[PDFService] Split into ${splitDocs.length} document chunks`);
    
    return splitDocs;
}

/**
 * Limpa texto extraído (remove espaços excessivos, etc.)
 * @param {string} text - Texto a ser limpo
 * @returns {string}
 */
export function cleanText(text) {
    if (!text) return '';
    
    return text
        // Replace multiple spaces with single space
        .replace(/[ \t]+/g, ' ')
        // Replace multiple newlines with double newline
        .replace(/\n{3,}/g, '\n\n')
        // Trim whitespace from each line
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        // Final trim
        .trim();
}

/**
 * Trunca texto para um tamanho máximo
 * @param {string} text - Texto a ser truncado
 * @param {number} maxLength - Tamanho máximo em caracteres
 * @returns {string}
 */
export function truncateText(text, maxLength = 100000) {
    if (!text || text.length <= maxLength) {
        return text || '';
    }
    
    // Tenta truncar no fim de uma sentença
    const truncated = text.substring(0, maxLength);
    const lastSentence = truncated.lastIndexOf('.');
    
    if (lastSentence > maxLength * 0.8) {
        return truncated.substring(0, lastSentence + 1);
    }
    
    return truncated + '...';
}

/**
 * Estima o número de tokens em um texto
 * Aproximação: ~4 caracteres por token para português/inglês
 * @param {string} text - Texto para estimar
 * @returns {number}
 */
export function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

export default {
    loadAndExtractPDF,
    splitText,
    splitDocuments,
    cleanText,
    truncateText,
    estimateTokens
};
