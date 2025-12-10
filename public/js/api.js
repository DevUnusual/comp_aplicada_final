/**
 * API Client for Document Summary App
 */

const API_BASE_URL = '/api';

// Token management
const TokenManager = {
    get: () => localStorage.getItem('token'),
    set: (token) => localStorage.setItem('token', token),
    remove: () => localStorage.removeItem('token'),
    exists: () => !!localStorage.getItem('token')
};

// User management
const UserManager = {
    get: () => {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },
    set: (user) => localStorage.setItem('user', JSON.stringify(user)),
    remove: () => localStorage.removeItem('user'),
    exists: () => !!localStorage.getItem('user')
};

/**
 * Make API request
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = TokenManager.get();

    const defaultHeaders = {
        'Content-Type': 'application/json'
    };

    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    // Don't set Content-Type for FormData
    if (options.body instanceof FormData) {
        delete defaultHeaders['Content-Type'];
    }

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    };

    try {
        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
            // Handle token expiration
            if (response.status === 401) {
                TokenManager.remove();
                UserManager.remove();
                if (window.location.pathname !== '/login.html' && window.location.pathname !== '/register.html') {
                    window.location.href = '/login.html';
                }
            }
            throw new Error(data.error || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

/**
 * Download file from API
 */
async function downloadFile(endpoint, defaultFilename) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = TokenManager.get();

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Download failed');
        }

        // Get filename from Content-Disposition header if available
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = defaultFilename;
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch && filenameMatch[1]) {
                filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
            }
        }

        // Create blob and download
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        window.URL.revokeObjectURL(downloadUrl);
        
        return { success: true, filename };
    } catch (error) {
        console.error('Download Error:', error);
        throw error;
    }
}

/**
 * Auth API
 */
const AuthAPI = {
    register: async (userData) => {
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        TokenManager.set(data.token);
        UserManager.set(data.user);
        return data;
    },

    login: async (credentials) => {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
        TokenManager.set(data.token);
        UserManager.set(data.user);
        return data;
    },

    logout: () => {
        TokenManager.remove();
        UserManager.remove();
        window.location.href = '/login.html';
    },

    getProfile: async () => {
        return apiRequest('/auth/profile');
    },

    updateProfile: async (profileData) => {
        const data = await apiRequest('/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
        UserManager.set(data.user);
        return data;
    },

    changePassword: async (passwords) => {
        return apiRequest('/auth/password', {
            method: 'PUT',
            body: JSON.stringify(passwords)
        });
    },

    isAuthenticated: () => TokenManager.exists(),
    
    getCurrentUser: () => UserManager.get()
};

/**
 * Documents API
 */
const DocumentsAPI = {
    upload: async (file, onProgress) => {
        const formData = new FormData();
        formData.append('file', file);

        // Use XMLHttpRequest for progress tracking
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    onProgress(percent);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    const error = JSON.parse(xhr.responseText);
                    reject(new Error(error.error || 'Upload failed'));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('Upload failed'));
            });

            xhr.open('POST', `${API_BASE_URL}/documents/upload`);
            xhr.setRequestHeader('Authorization', `Bearer ${TokenManager.get()}`);
            xhr.send(formData);
        });
    },

    uploadMultiple: async (files) => {
        const formData = new FormData();
        for (const file of files) {
            formData.append('files', file);
        }

        return apiRequest('/documents/upload-multiple', {
            method: 'POST',
            body: formData
        });
    },

    getAll: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = queryString ? `/documents?${queryString}` : '/documents';
        return apiRequest(endpoint);
    },

    getOne: async (id, includeText = false) => {
        const query = includeText ? '?includeText=true' : '';
        return apiRequest(`/documents/${id}${query}`);
    },

    delete: async (id) => {
        return apiRequest(`/documents/${id}`, {
            method: 'DELETE'
        });
    },

    deleteMultiple: async (ids) => {
        return apiRequest('/documents', {
            method: 'DELETE',
            body: JSON.stringify({ ids })
        });
    },

    reprocess: async (id) => {
        return apiRequest(`/documents/${id}/reprocess`, {
            method: 'POST'
        });
    },

    // Download original PDF
    download: async (id, filename = 'document.pdf') => {
        return downloadFile(`/documents/${id}/download`, filename);
    },

    // Download extracted text
    downloadText: async (id, filename = 'document_texto.txt') => {
        return downloadFile(`/documents/${id}/download-text`, filename);
    }
};

/**
 * Summaries API
 */
const SummariesAPI = {
    getStatus: async () => {
        return apiRequest('/summaries/status');
    },

    createSingle: async (documentId, title = null) => {
        return apiRequest('/summaries/single', {
            method: 'POST',
            body: JSON.stringify({ documentId, title })
        });
    },

    createMultiple: async (documentIds, title = null) => {
        return apiRequest('/summaries/multiple', {
            method: 'POST',
            body: JSON.stringify({ documentIds, title })
        });
    },

    getAll: async (params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = queryString ? `/summaries?${queryString}` : '/summaries';
        return apiRequest(endpoint);
    },

    getOne: async (id) => {
        return apiRequest(`/summaries/${id}`);
    },

    delete: async (id) => {
        return apiRequest(`/summaries/${id}`, {
            method: 'DELETE'
        });
    },

    // Download summary as file
    download: async (id, format = 'txt', filename = 'resumo.txt') => {
        const endpoint = `/summaries/${id}/download?format=${format}`;
        return downloadFile(endpoint, filename);
    }
};

/**
 * Health check
 */
async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        return response.ok;
    } catch {
        return false;
    }
}

// Export for use in other scripts
window.API = {
    Auth: AuthAPI,
    Documents: DocumentsAPI,
    Summaries: SummariesAPI,
    checkHealth
};