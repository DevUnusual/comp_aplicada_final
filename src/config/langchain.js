import { ChatOpenAI } from '@langchain/openai';

/**
 * LangChain Configuration
 * múltiplos modelos e providers
 */

// Configurações de modelo
export const MODEL_CONFIG = {
    // OpenAI models
    'gpt-3.5-turbo': { provider: 'openai', maxTokens: 4096 },
    'gpt-4': { provider: 'openai', maxTokens: 8192 },
    'gpt-4-turbo': { provider: 'openai', maxTokens: 128000 },
    'gpt-4o': { provider: 'openai', maxTokens: 128000 },
    'gpt-4o-mini': { provider: 'openai', maxTokens: 128000 },
    'gpt-4.1-nano': { provider: 'openai', maxTokens: 128000 },
};

// Modelo padrão
export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'gpt-3.5-turbo';

/**
 * Verifica se a API está configurada
 */
export function isConfigured() {
    return !!process.env.OPENAI_API_KEY && 
           process.env.OPENAI_API_KEY !== 'sk-your-openai-api-key-here';
}

/**
 * Cria instância do ChatModel
 * @param {object} options - Opções de configuração
 * @returns {ChatOpenAI}
 */
export function createChatModel(options = {}) {
    const {
        model = DEFAULT_MODEL,
        temperature = 0.3,
        maxTokens = 2000,
    } = options;

    if (!isConfigured()) {
        throw new Error('OpenAI API key is not configured. Set OPENAI_API_KEY in .env');
    }

    return new ChatOpenAI({
        modelName: model,
        temperature,
        maxTokens,
        openAIApiKey: process.env.OPENAI_API_KEY,
    });
}

/**
 * Retorna informações sobre o modelo
 */
export function getModelInfo(modelName = DEFAULT_MODEL) {
    return MODEL_CONFIG[modelName] || MODEL_CONFIG[DEFAULT_MODEL];
}

export default {
    isConfigured,
    createChatModel,
    getModelInfo,
    DEFAULT_MODEL,
    MODEL_CONFIG
};
