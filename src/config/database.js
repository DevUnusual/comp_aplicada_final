import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_STORAGE || path.join(__dirname, '../../database.json');

// Initialize database
const initDB = () => {
    if (!fs.existsSync(DB_PATH)) {
        const initialData = {
            users: [],
            documents: [],
            summaries: []
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
};

// Save database
const saveDB = (data) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// Database instance
let data = initDB();

const db = {
    get data() {
        return data;
    },

    // User operations
    createUser(user) {
        user.createdAt = new Date().toISOString();
        user.updatedAt = new Date().toISOString();
        data.users.push(user);
        saveDB(data);
        return user;
    },

    findUserById(id) {
        return data.users.find(u => u.id === id);
    },

    findUserByUsername(username) {
        return data.users.find(u => u.username === username);
    },

    findUserByEmail(email) {
        return data.users.find(u => u.email === email);
    },

    findUserByUsernameOrEmail(identifier) {
        return data.users.find(u => u.username === identifier || u.email === identifier);
    },

    updateUser(id, updates) {
        const index = data.users.findIndex(u => u.id === id);
        if (index !== -1) {
            data.users[index] = { ...data.users[index], ...updates, updatedAt: new Date().toISOString() };
            saveDB(data);
            return data.users[index];
        }
        return null;
    },

    // Document operations
    createDocument(doc) {
        doc.createdAt = new Date().toISOString();
        doc.updatedAt = new Date().toISOString();
        data.documents.push(doc);
        saveDB(data);
        return doc;
    },

    findDocumentById(id) {
        return data.documents.find(d => d.id === id);
    },

    findDocumentsByUserId(userId, options = {}) {
        let docs = data.documents.filter(d => d.userId === userId);
        
        if (options.status) {
            docs = docs.filter(d => d.status === options.status);
        }
        
        // Sort by createdAt descending
        docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        const total = docs.length;
        
        if (options.offset) {
            docs = docs.slice(options.offset);
        }
        if (options.limit) {
            docs = docs.slice(0, options.limit);
        }
        
        return { documents: docs, total };
    },

    updateDocument(id, updates) {
        const index = data.documents.findIndex(d => d.id === id);
        if (index !== -1) {
            data.documents[index] = { ...data.documents[index], ...updates, updatedAt: new Date().toISOString() };
            saveDB(data);
            return data.documents[index];
        }
        return null;
    },

    deleteDocument(id) {
        const index = data.documents.findIndex(d => d.id === id);
        if (index !== -1) {
            data.documents.splice(index, 1);
            saveDB(data);
            return true;
        }
        return false;
    },

    // Summary operations
    createSummary(summary) {
        summary.createdAt = new Date().toISOString();
        summary.updatedAt = new Date().toISOString();
        data.summaries.push(summary);
        saveDB(data);
        return summary;
    },

    findSummaryById(id) {
        return data.summaries.find(s => s.id === id);
    },

    findSummariesByUserId(userId, options = {}) {
        let summaries = data.summaries.filter(s => s.userId === userId);
        
        if (options.type) {
            summaries = summaries.filter(s => s.type === options.type);
        }
        
        // Sort by createdAt descending
        summaries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        const total = summaries.length;
        
        if (options.offset) {
            summaries = summaries.slice(options.offset);
        }
        if (options.limit) {
            summaries = summaries.slice(0, options.limit);
        }
        
        return { summaries, total };
    },

    deleteSummary(id) {
        const index = data.summaries.findIndex(s => s.id === id);
        if (index !== -1) {
            data.summaries.splice(index, 1);
            saveDB(data);
            return true;
        }
        return false;
    },

    // Reload data from disk
    reload() {
        data = initDB();
    }
};

export default db;
