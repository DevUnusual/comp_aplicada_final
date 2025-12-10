# Document Summary App 📄

Aplicação web para gerenciamento e análise de documentos PDF com capacidade de geração de resumos individuais e integrados utilizando **LangChain** + LLM (OpenAI GPT).

## 🚀 Features

- **Autenticação completa**: Registro, login, edição de perfil
- **Upload de PDFs**: Drag & drop, até 50MB por arquivo
- **Extração de texto**: Usando LangChain PDFLoader
- **Resumo individual**: Gerar resumo de um documento
- **Resumo integrado**: Gerar resumo consolidado de múltiplos documentos
- **Documentos grandes**: Suporte automático via MapReduce chain
- **Dashboard**: Interface para gerenciar documentos e resumos

## 🛠️ Tecnologias

- **Backend**: Node.js + Express.js (ES Modules)
- **LangChain**: v0.3.x - Framework para LLM
  - `@langchain/openai` - Integração com OpenAI
  - `@langchain/community` - PDFLoader
  - `langchain` - Chains e Text Splitters
- **Banco de Dados**: JSON file-based (simples, sem dependências)
- **Autenticação**: JWT + bcrypt
- **Upload**: Multer
- **Frontend**: HTML5 + CSS3 + JavaScript vanilla

## 📁 Estrutura do Projeto

```
document-summary-app/
├── src/
│   ├── config/
│   │   ├── database.js      # JSON file database
│   │   └── langchain.js     # LangChain configuration
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── documentController.js
│   │   └── summaryController.js
│   ├── middlewares/
│   │   ├── auth.js          # JWT authentication
│   │   └── upload.js        # Multer configuration
│   ├── routes/
│   │   ├── auth.js
│   │   ├── documents.js
│   │   └── summaries.js
│   └── services/
│       ├── pdfService.js       # LangChain PDFLoader
│       └── langchainService.js # Summarization chains
├── public/
│   ├── css/style.css
│   ├── js/
│   │   ├── api.js
│   │   ├── auth.js
│   │   └── dashboard.js
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   └── dashboard.html
├── uploads/
├── .env.example
├── package.json
├── app.js
└── README.md
```

## ⚙️ Instalação Local

### Pré-requisitos

- Node.js 18+ 
- npm ou yarn
- Chave de API OpenAI

### Passos

1. **Clone o repositório**
```bash
git clone <repo-url>
cd document-summary-app
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure as variáveis de ambiente**
```bash
cp .env.example .env
```

Edite o arquivo `.env`:
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=sua-chave-secreta-aqui
JWT_EXPIRES_IN=24h
OPENAI_API_KEY=sk-sua-chave-openai-aqui
DEFAULT_MODEL=gpt-3.5-turbo
DB_STORAGE=./database.json
MAX_FILE_SIZE=52428800
UPLOAD_PATH=./uploads
```

4. **Inicie a aplicação**
```bash
# Desenvolvimento (com watch mode)
npm run dev

# Produção
npm start
```

5. **Acesse no navegador**
```
http://localhost:3000
```

## 🔗 LangChain Features

### Modelos Suportados

| Modelo | Descrição |
|--------|-----------|
| `gpt-3.5-turbo` | Rápido e econômico (padrão) |
| `gpt-4` | Mais inteligente |
| `gpt-4-turbo` | Rápido com contexto grande |
| `gpt-4o` | Mais recente e capaz |
| `gpt-4o-mini` | Bom custo-benefício |

### Estratégias de Sumarização

| Estratégia | Uso |
|------------|-----|
| **Stuff** | Documentos pequenos/médios (< 12k tokens) |
| **MapReduce** | Documentos grandes automaticamente |
| **Hierarchical** | Múltiplos documentos grandes |

### Componentes LangChain Utilizados

```javascript
// PDF Loading
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

// Text Splitting
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// LLM
import { ChatOpenAI } from '@langchain/openai';

// Chains
import { loadSummarizationChain } from 'langchain/chains';

// Prompts
import { PromptTemplate } from '@langchain/core/prompts';
```

## 🔌 API Endpoints

### Autenticação
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/auth/register` | Registrar usuário |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/profile` | Obter perfil |
| PUT | `/api/auth/profile` | Atualizar perfil |

### Documentos
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/documents/upload` | Upload único |
| POST | `/api/documents/upload-multiple` | Upload múltiplo |
| GET | `/api/documents` | Listar documentos |
| GET | `/api/documents/:id` | Obter documento |
| DELETE | `/api/documents/:id` | Deletar documento |
| POST | `/api/documents/:id/reprocess` | Reprocessar |

### Resumos
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/summaries/status` | Status do LangChain/OpenAI |
| POST | `/api/summaries/single` | Resumo individual |
| POST | `/api/summaries/multiple` | Resumo integrado |
| GET | `/api/summaries` | Listar resumos |
| GET | `/api/summaries/:id` | Obter resumo |
| DELETE | `/api/summaries/:id` | Deletar resumo |

### Debug
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/debug` | Status do sistema |
| POST | `/api/debug/reprocess-stuck` | Reprocessar travados |
| GET | `/api/debug/test-pdf/:id` | Testar extração PDF |

## ☁️ Deploy na AWS EC2

### 1. Preparar a Instância EC2

```bash
# Conectar na instância
ssh -i sua-chave.pem ubuntu@seu-ip-publico

# Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Clonar e Configurar

```bash
cd /home/ubuntu/app
git clone <repo-url> document-summary-app
cd document-summary-app

npm install --production

cp .env.example .env
nano .env  # Configurar variáveis
```

### 3. Configurar Systemd

```bash
sudo nano /etc/systemd/system/document-summary.service
```

```ini
[Unit]
Description=Document Summary App
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/document-summary-app
ExecStart=/usr/bin/node app.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable document-summary
sudo systemctl start document-summary
```

## 📝 Uso

1. **Registrar/Login**
2. **Upload**: Arrastar PDFs ou clicar para selecionar
3. **Aguardar**: Status muda para "processed"
4. **Summarize**: Clicar no botão de um documento
5. **Multi-Summary**: Selecionar 2+ docs → "Generate Integrated Summary"

## 🔒 Segurança

- Senhas com bcrypt (10 rounds)
- JWT com expiração configurável
- Arquivos isolados por usuário
- Validação de tipo (apenas PDF)
- Limite de 50MB por arquivo

## 📄 Licença

ISC
