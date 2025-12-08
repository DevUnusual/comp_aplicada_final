import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { loadSummarizationChain } from 'langchain/chains';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from '@langchain/core/documents';
import { isConfigured, DEFAULT_MODEL } from '../config/langchain.js';

/**
 * Prompts para sumarização em português
 */
const SUMMARY_PROMPTS = {
    single: {
        system: `Você é um especialista em análise e síntese de documentos. 
Sua tarefa é criar resumos claros, concisos e abrangentes.

Diretrizes:
- Escreva o resumo em português
- Capture os pontos principais e informações-chave
- Mantenha a estrutura lógica do conteúdo original
- Seja objetivo e preciso
- Mantenha o resumo informativo mas conciso`,
        
        human: `Por favor, forneça um resumo abrangente do seguinte documento:

{text}

RESUMO:`
    },
    
    multiple: {
        system: `Você é um analista de documentos especializado em síntese integrada.
Sua tarefa é analisar múltiplos documentos e criar um resumo integrado.

Diretrizes:
- Escreva o resumo em português
- Identifique temas comuns e conexões entre os documentos
- Destaque diferenças ou contradições importantes
- Sintetize as informações em uma narrativa coerente
- Referencie qual documento contém cada informação quando relevante`,
        
        human: `Analise os seguintes {count} documentos e forneça um resumo integrado que sintetize as informações principais:

{documents}

RESUMO INTEGRADO:`
    },

    // Prompts para MapReduce chain (documentos muito grandes)
    mapPrompt: `Escreva um resumo conciso do seguinte trecho:

"{text}"

RESUMO CONCISO:`,

    combinePrompt: `Os seguintes são resumos de diferentes partes de um documento:

{text}

Combine esses resumos em um resumo final consolidado e coerente em português.

RESUMO FINAL:`
};

/**
 * Cria uma instância do ChatOpenAI
 */
function createModel(options = {}) {
    const {
        model = DEFAULT_MODEL,
        temperature = 0.3,
        maxTokens = 2000,
    } = options;

    return new ChatOpenAI({
        modelName: model,
        temperature,
        maxTokens,
        openAIApiKey: process.env.OPENAI_API_KEY,
    });
}

/**
 * Gera resumo de um único documento
 * @param {string} text - Texto do documento
 * @param {object} options - Opções
 * @returns {Promise<{summary: string, tokensUsed: number, model: string}>}
 */
export async function generateSingleSummary(text, options = {}) {
    if (!isConfigured()) {
        throw new Error('OpenAI API key is not configured');
    }

    const {
        model = DEFAULT_MODEL,
        temperature = 0.3,
        maxTokens = 2000,
    } = options;

    console.log(`[LangChain] Generating single summary with ${model}`);
    const startTime = Date.now();

    try {
        // Para textos muito grandes, usar MapReduce
        const estimatedTokens = Math.ceil(text.length / 4);
        
        if (estimatedTokens > 12000) {
            console.log(`[LangChain] Text too long (${estimatedTokens} tokens), using MapReduce`);
            return await generateMapReduceSummary(text, { model, temperature, maxTokens });
        }

        // Chain simples para textos menores
        const llm = createModel({ model, temperature, maxTokens });
        
        const prompt = PromptTemplate.fromTemplate(
            SUMMARY_PROMPTS.single.system + '\n\n' + SUMMARY_PROMPTS.single.human
        );

        const chain = RunnableSequence.from([
            prompt,
            llm,
            new StringOutputParser(),
        ]);

        const summary = await chain.invoke({ text });

        const duration = Date.now() - startTime;
        console.log(`[LangChain] Summary generated in ${duration}ms`);

        return {
            summary: summary.trim(),
            tokensUsed: estimatedTokens + Math.ceil(summary.length / 4),
            model,
            processingTime: duration,
            method: 'stuff'
        };
    } catch (error) {
        console.error('[LangChain] Error generating summary:', error);
        throw new Error(`Failed to generate summary: ${error.message}`);
    }
}

/**
 * Gera resumo usando MapReduce (para documentos grandes)
 */
async function generateMapReduceSummary(text, options = {}) {
    const {
        model = DEFAULT_MODEL,
        temperature = 0.3,
        maxTokens = 2000,
    } = options;

    console.log(`[LangChain] Using MapReduce chain`);
    const startTime = Date.now();

    // Dividir texto em chunks
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 4000,
        chunkOverlap: 200,
    });

    const chunks = await splitter.splitText(text);
    console.log(`[LangChain] Split into ${chunks.length} chunks`);

    // Criar documentos LangChain
    const docs = chunks.map((chunk, i) => new Document({ 
        pageContent: chunk,
        metadata: { chunk: i + 1 }
    }));

    const llm = createModel({ model, temperature, maxTokens });

    // Usar loadSummarizationChain com tipo map_reduce
    const chain = loadSummarizationChain(llm, {
        type: 'map_reduce',
        verbose: process.env.NODE_ENV === 'development',
    });

    const result = await chain.invoke({
        input_documents: docs,
    });

    const duration = Date.now() - startTime;
    console.log(`[LangChain] MapReduce summary generated in ${duration}ms`);

    return {
        summary: result.text.trim(),
        tokensUsed: Math.ceil(text.length / 4) + Math.ceil(result.text.length / 4),
        model,
        processingTime: duration,
        method: 'map_reduce',
        chunks: chunks.length
    };
}

/**
 * Gera resumo integrado de múltiplos documentos
 * @param {Array<{name: string, text: string}>} documents - Array de documentos
 * @param {object} options - Opções
 * @returns {Promise<{summary: string, tokensUsed: number, model: string}>}
 */
export async function generateMultipleSummary(documents, options = {}) {
    if (!isConfigured()) {
        throw new Error('OpenAI API key is not configured');
    }

    if (!documents || documents.length === 0) {
        throw new Error('No documents provided');
    }

    const {
        model = DEFAULT_MODEL,
        temperature = 0.3,
        maxTokens = 3000,
    } = options;

    console.log(`[LangChain] Generating integrated summary for ${documents.length} documents`);
    const startTime = Date.now();

    try {
        // Preparar texto combinado dos documentos
        const documentsText = documents
            .map((doc, index) => `--- Documento ${index + 1}: ${doc.name} ---\n${doc.text}`)
            .join('\n\n');

        const totalTokens = Math.ceil(documentsText.length / 4);

        // Se muito grande, sumarizar cada documento primeiro
        if (totalTokens > 12000) {
            console.log(`[LangChain] Documents too large, using hierarchical summarization`);
            return await generateHierarchicalSummary(documents, options);
        }

        const llm = createModel({ model, temperature, maxTokens });

        const prompt = PromptTemplate.fromTemplate(
            SUMMARY_PROMPTS.multiple.system + '\n\n' + SUMMARY_PROMPTS.multiple.human
        );

        const chain = RunnableSequence.from([
            prompt,
            llm,
            new StringOutputParser(),
        ]);

        const summary = await chain.invoke({ 
            count: documents.length,
            documents: documentsText 
        });

        const duration = Date.now() - startTime;
        console.log(`[LangChain] Integrated summary generated in ${duration}ms`);

        return {
            summary: summary.trim(),
            tokensUsed: totalTokens + Math.ceil(summary.length / 4),
            model,
            processingTime: duration,
            method: 'stuff',
            documentsCount: documents.length
        };
    } catch (error) {
        console.error('[LangChain] Error generating integrated summary:', error);
        throw new Error(`Failed to generate integrated summary: ${error.message}`);
    }
}

/**
 * Sumarização hierárquica para múltiplos documentos grandes
 * Primeiro sumariza cada documento, depois combina
 */
async function generateHierarchicalSummary(documents, options = {}) {
    const {
        model = DEFAULT_MODEL,
        temperature = 0.3,
        maxTokens = 2000,
    } = options;

    console.log(`[LangChain] Using hierarchical summarization`);
    const startTime = Date.now();

    // Primeiro passo: sumarizar cada documento individualmente
    const individualSummaries = [];
    
    for (const doc of documents) {
        console.log(`[LangChain] Summarizing: ${doc.name}`);
        const result = await generateSingleSummary(doc.text, { model, temperature, maxTokens: 1000 });
        individualSummaries.push({
            name: doc.name,
            summary: result.summary
        });
    }

    // Segundo passo: combinar os resumos
    const llm = createModel({ model, temperature, maxTokens });

    const combinedText = individualSummaries
        .map((s, i) => `--- Resumo do Documento ${i + 1}: ${s.name} ---\n${s.summary}`)
        .join('\n\n');

    const combinePrompt = PromptTemplate.fromTemplate(
        `Você recebeu resumos de ${documents.length} documentos diferentes.
Crie um resumo integrado final que:
- Sintetize as informações principais de todos os documentos
- Identifique temas e pontos em comum
- Destaque diferenças importantes
- Seja coerente e bem estruturado

Resumos dos documentos:

{summaries}

RESUMO INTEGRADO FINAL:`
    );

    const chain = RunnableSequence.from([
        combinePrompt,
        llm,
        new StringOutputParser(),
    ]);

    const finalSummary = await chain.invoke({ summaries: combinedText });

    const duration = Date.now() - startTime;
    console.log(`[LangChain] Hierarchical summary completed in ${duration}ms`);

    return {
        summary: finalSummary.trim(),
        tokensUsed: Math.ceil(combinedText.length / 4) + Math.ceil(finalSummary.length / 4),
        model,
        processingTime: duration,
        method: 'hierarchical',
        documentsCount: documents.length
    };
}

/**
 * Testa conexão com a API
 */
export async function testConnection() {
    if (!isConfigured()) {
        return { success: false, error: 'API key not configured' };
    }

    try {
        const llm = createModel({ maxTokens: 10 });
        const result = await llm.invoke('Hello');
        return { 
            success: true, 
            model: DEFAULT_MODEL,
            response: result.content.substring(0, 50)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export default {
    generateSingleSummary,
    generateMultipleSummary,
    testConnection,
    isConfigured
};
