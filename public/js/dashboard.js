/**
 * Dashboard functionality
 */

// State
let documents = [];
let summaries = [];
let selectedDocuments = new Set();
let currentTab = 'documents';

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    if (!API.Auth.isAuthenticated()) {
        window.location.href = '/login.html';
        return;
    }

    // Setup UI
    setupNavbar();
    setupTabs();
    setupUploadArea();
    setupModals();

    // Load initial data
    await loadDashboardData();
});

/**
 * Setup navbar with user info
 */
function setupNavbar() {
    const user = API.Auth.getCurrentUser();
    if (user) {
        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');
        
        if (userNameEl) userNameEl.textContent = user.fullName;
        if (userAvatarEl) userAvatarEl.textContent = user.fullName.charAt(0).toUpperCase();
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            API.Auth.logout();
        });
    }
}

/**
 * Setup tabs navigation
 */
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });
}

/**
 * Switch between tabs
 */
function switchTab(tab) {
    currentTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('hidden', content.id !== `${tab}Tab`);
    });
}

/**
 * Setup upload area with drag and drop
 */
function setupUploadArea() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    if (!uploadArea || !fileInput) return;

    // Click to upload
    uploadArea.addEventListener('click', () => fileInput.click());

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
        if (files.length > 0) {
            await handleFileUpload(files);
        } else {
            showToast('Please upload PDF files only', 'error');
        }
    });

    // File input change
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            await handleFileUpload(files);
        }
        fileInput.value = '';
    });
}

/**
 * Handle file upload
 */
async function handleFileUpload(files) {
    showLoading('Uploading files...');

    try {
        if (files.length === 1) {
            await API.Documents.upload(files[0], (progress) => {
                updateLoadingMessage(`Uploading... ${progress}%`);
            });
            showToast('Document uploaded successfully', 'success');
        } else {
            await API.Documents.uploadMultiple(files);
            showToast(`${files.length} documents uploaded successfully`, 'success');
        }
        
        await loadDocuments();
        await loadStats();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Load dashboard data
 */
async function loadDashboardData() {
    showLoading('Loading dashboard...');
    
    try {
        await Promise.all([
            loadStats(),
            loadDocuments(),
            loadSummaries(),
            checkApiStatus()
        ]);
    } catch (error) {
        showToast('Failed to load dashboard data', 'error');
        console.error(error);
    } finally {
        hideLoading();
    }
}

/**
 * Load statistics
 */
async function loadStats() {
    try {
        const [docsData, summariesData] = await Promise.all([
            API.Documents.getAll({ limit: 1 }),
            API.Summaries.getAll({ limit: 1 })
        ]);

        document.getElementById('totalDocuments').textContent = docsData.pagination.total;
        document.getElementById('totalSummaries').textContent = summariesData.pagination.total;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

/**
 * Check OpenAI API status
 */
async function checkApiStatus() {
    try {
        const status = await API.Summaries.getStatus();
        const statusEl = document.getElementById('apiStatus');
        
        if (statusEl) {
            if (status.langchain && status.langchain.configured) {
                statusEl.innerHTML = '<span class="badge badge-success">OpenAI Connected</span>';
            } else {
                statusEl.innerHTML = '<span class="badge badge-warning">OpenAI Not Configured</span>';
            }
        }
    } catch (error) {
        console.error('Failed to check API status:', error);
    }
}

/**
 * Load documents list
 */
async function loadDocuments() {
    try {
        const data = await API.Documents.getAll({ limit: 50 });
        documents = data.documents;
        renderDocuments();
    } catch (error) {
        console.error('Failed to load documents:', error);
    }
}

/**
 * Render documents list
 */
function renderDocuments() {
    const container = document.getElementById('documentsList');
    if (!container) return;

    if (documents.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📄</div>
                <h3>No documents yet</h3>
                <p>Upload your first PDF to get started</p>
            </div>
        `;
        return;
    }

    container.innerHTML = documents.map(doc => `
        <div class="document-item ${selectedDocuments.has(doc.id) ? 'selected' : ''}" data-id="${doc.id}">
            <input type="checkbox" class="document-checkbox" 
                   ${selectedDocuments.has(doc.id) ? 'checked' : ''} 
                   onchange="toggleDocumentSelection('${doc.id}')">
            <div class="document-icon">PDF</div>
            <div class="document-info">
                <div class="document-name" title="${doc.originalName}">${doc.originalName}</div>
                <div class="document-meta">
                    <span>${formatFileSize(doc.fileSize)}</span>
                    <span>${doc.pageCount ? doc.pageCount + ' pages' : ''}</span>
                    <span class="badge badge-${getStatusBadgeClass(doc.status)}">${doc.status}</span>
                </div>
            </div>
            <div class="document-actions">
                <button class="btn btn-sm btn-primary" onclick="summarizeDocument('${doc.id}')" 
                        ${doc.status !== 'processed' ? 'disabled' : ''} title="Gerar resumo">
                    Summarize
                </button>
                <button class="btn btn-sm btn-outline" onclick="viewDocument('${doc.id}')" title="Visualizar texto">
                    View
                </button>
                <button class="btn btn-sm btn-success" onclick="downloadDocument('${doc.id}', '${doc.originalName}')" title="Baixar PDF original">
                    ⬇ PDF
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteDocument('${doc.id}')" title="Deletar">
                    Delete
                </button>
            </div>
        </div>
    `).join('');

    updateSelectionActions();
}

/**
 * Toggle document selection
 */
function toggleDocumentSelection(docId) {
    if (selectedDocuments.has(docId)) {
        selectedDocuments.delete(docId);
    } else {
        selectedDocuments.add(docId);
    }
    renderDocuments();
}

/**
 * Update selection action buttons
 */
function updateSelectionActions() {
    const actionsEl = document.getElementById('selectionActions');
    if (!actionsEl) return;

    if (selectedDocuments.size > 0) {
        actionsEl.innerHTML = `
            <span>${selectedDocuments.size} selected</span>
            <button class="btn btn-sm btn-primary" onclick="summarizeMultiple()" 
                    ${selectedDocuments.size < 2 ? 'disabled' : ''}>
                Summarize Selected (${selectedDocuments.size})
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteSelected()">
                Delete Selected
            </button>
            <button class="btn btn-sm btn-outline" onclick="clearSelection()">
                Clear Selection
            </button>
        `;
        actionsEl.classList.remove('hidden');
    } else {
        actionsEl.classList.add('hidden');
    }
}

/**
 * Download document PDF
 */
async function downloadDocument(docId, filename) {
    try {
        showToast('Iniciando download...', 'info');
        await API.Documents.download(docId, filename);
        showToast('Download concluído!', 'success');
    } catch (error) {
        showToast(error.message || 'Erro ao baixar documento', 'error');
    }
}

/**
 * Download document extracted text
 */
async function downloadDocumentText(docId, filename) {
    try {
        const baseName = filename.replace('.pdf', '');
        await API.Documents.downloadText(docId, `${baseName}_texto.txt`);
        showToast('Texto baixado com sucesso!', 'success');
    } catch (error) {
        showToast(error.message || 'Erro ao baixar texto', 'error');
    }
}

/**
 * Summarize single document
 */
async function summarizeDocument(docId) {
    showLoading('Generating summary...');

    try {
        const result = await API.Summaries.createSingle(docId);
        showToast('Summary generated successfully', 'success');
        await loadSummaries();
        await loadStats();
        
        // Show the summary
        showSummaryModal(result.summary);
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Summarize multiple documents
 */
async function summarizeMultiple() {
    if (selectedDocuments.size < 2) {
        showToast('Select at least 2 documents', 'warning');
        return;
    }

    showLoading('Generating integrated summary...');

    try {
        const result = await API.Summaries.createMultiple(Array.from(selectedDocuments));
        showToast('Integrated summary generated successfully', 'success');
        selectedDocuments.clear();
        await loadDocuments();
        await loadSummaries();
        await loadStats();
        
        // Show the summary
        showSummaryModal(result.summary);
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * View document text
 */
async function viewDocument(docId) {
    try {
        const data = await API.Documents.getOne(docId, true);
        showDocumentModal(data.document);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * Delete single document
 */
async function deleteDocument(docId) {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
        await API.Documents.delete(docId);
        showToast('Document deleted', 'success');
        await loadDocuments();
        await loadStats();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * Delete selected documents
 */
async function deleteSelected() {
    if (!confirm(`Are you sure you want to delete ${selectedDocuments.size} documents?`)) return;

    try {
        await API.Documents.deleteMultiple(Array.from(selectedDocuments));
        showToast('Documents deleted', 'success');
        selectedDocuments.clear();
        await loadDocuments();
        await loadStats();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * Clear selection
 */
function clearSelection() {
    selectedDocuments.clear();
    renderDocuments();
}

/**
 * Load summaries list
 */
async function loadSummaries() {
    try {
        const data = await API.Summaries.getAll({ limit: 50 });
        summaries = data.summaries;
        renderSummaries();
    } catch (error) {
        console.error('Failed to load summaries:', error);
    }
}

/**
 * Render summaries list
 */
function renderSummaries() {
    const container = document.getElementById('summariesList');
    if (!container) return;

    if (summaries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <h3>No summaries yet</h3>
                <p>Select documents and generate summaries to see them here</p>
            </div>
        `;
        return;
    }

    container.innerHTML = summaries.map(summary => `
        <div class="document-item" data-id="${summary.id}">
            <div class="document-icon" style="background-color: var(--primary-color);">AI</div>
            <div class="document-info">
                <div class="document-name" title="${summary.title}">${summary.title}</div>
                <div class="document-meta">
                    <span class="badge badge-${summary.type === 'single' ? 'info' : 'success'}">${summary.type}</span>
                    <span>${summary.documentIds.length} document(s)</span>
                    <span>${formatDate(summary.createdAt)}</span>
                </div>
            </div>
            <div class="document-actions">
                <button class="btn btn-sm btn-primary" onclick="viewSummary('${summary.id}')" title="Visualizar resumo">
                    View
                </button>
                <button class="btn btn-sm btn-success" onclick="downloadSummary('${summary.id}', 'txt')" title="Baixar como TXT">
                    ⬇ TXT
                </button>
                <button class="btn btn-sm btn-outline" onclick="downloadSummary('${summary.id}', 'md')" title="Baixar como Markdown">
                    ⬇ MD
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteSummary('${summary.id}')" title="Deletar">
                    Delete
                </button>
            </div>
        </div>
    `).join('');
}

/**
 * View summary details
 */
async function viewSummary(summaryId) {
    try {
        const data = await API.Summaries.getOne(summaryId);
        showSummaryModal(data.summary);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * Download summary as file
 */
async function downloadSummary(summaryId, format = 'txt') {
    try {
        showToast('Iniciando download...', 'info');
        const extension = format === 'md' ? 'md' : 'txt';
        await API.Summaries.download(summaryId, format, `resumo.${extension}`);
        showToast('Resumo baixado com sucesso!', 'success');
    } catch (error) {
        showToast(error.message || 'Erro ao baixar resumo', 'error');
    }
}

/**
 * Delete summary
 */
async function deleteSummary(summaryId) {
    if (!confirm('Are you sure you want to delete this summary?')) return;

    try {
        await API.Summaries.delete(summaryId);
        showToast('Summary deleted', 'success');
        await loadSummaries();
        await loadStats();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

/**
 * Setup modals
 */
function setupModals() {
    // Close modal on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeModal(backdrop.id);
            }
        });
    });

    // Close modal buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal-backdrop');
            if (modal) closeModal(modal.id);
        });
    });

    // Profile form
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        setupProfileForm(profileForm);
    }
}

/**
 * Setup profile form
 */
function setupProfileForm(form) {
    const user = API.Auth.getCurrentUser();
    if (user) {
        form.querySelector('#profileFullName').value = user.fullName;
        form.querySelector('#profileEmail').value = user.email;
        form.querySelector('#profileDescription').value = user.description || '';
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            fullName: form.querySelector('#profileFullName').value,
            email: form.querySelector('#profileEmail').value,
            description: form.querySelector('#profileDescription').value
        };

        try {
            await API.Auth.updateProfile(formData);
            showToast('Profile updated successfully', 'success');
            closeModal('profileModal');
            setupNavbar(); // Refresh navbar
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

/**
 * Show profile modal
 */
function showProfileModal() {
    openModal('profileModal');
}

/**
 * Show summary modal
 */
function showSummaryModal(summary) {
    const modal = document.getElementById('summaryModal');
    if (!modal) return;

    modal.querySelector('.modal-header h2').textContent = summary.title;
    modal.querySelector('.summary-content').textContent = summary.content;
    modal.querySelector('.summary-meta').innerHTML = `
        <span><strong>Type:</strong> ${summary.type}</span>
        <span><strong>Model:</strong> ${summary.model}</span>
        <span><strong>Tokens:</strong> ${summary.tokensUsed || 'N/A'}</span>
        <span><strong>Time:</strong> ${summary.processingTime ? (summary.processingTime / 1000).toFixed(1) + 's' : 'N/A'}</span>
    `;

    // Add download buttons to modal
    const modalActions = modal.querySelector('.modal-actions');
    if (modalActions) {
        modalActions.innerHTML = `
            <button class="btn btn-success" onclick="downloadSummary('${summary.id}', 'txt')">
                ⬇ Download TXT
            </button>
            <button class="btn btn-outline" onclick="downloadSummary('${summary.id}', 'md')">
                ⬇ Download Markdown
            </button>
            <button class="btn btn-secondary" onclick="closeModal('summaryModal')">
                Fechar
            </button>
        `;
    }

    openModal('summaryModal');
}

/**
 * Show document modal
 */
function showDocumentModal(doc) {
    const modal = window.document.getElementById('documentModal');
    if (!modal) return;

    modal.querySelector('.modal-header h2').textContent = doc.originalName;
    modal.querySelector('.document-text').textContent = doc.extractedText || 'No text extracted';

    // Add download buttons to modal
    const modalActions = modal.querySelector('.modal-actions');
    if (modalActions) {
        modalActions.innerHTML = `
            <button class="btn btn-success" onclick="downloadDocument('${doc.id}', '${doc.originalName}')">
                ⬇ Download PDF
            </button>
            <button class="btn btn-outline" onclick="downloadDocumentText('${doc.id}', '${doc.originalName}')">
                ⬇ Download Texto
            </button>
            <button class="btn btn-secondary" onclick="closeModal('documentModal')">
                Fechar
            </button>
        `;
    }

    openModal('documentModal');
}

/**
 * Open modal
 */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Close modal
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * Show loading overlay
 */
function showLoading(message = 'Loading...') {
    let overlay = document.getElementById('loadingOverlay');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="spinner"></div>
            <div id="loadingMessage">${message}</div>
        `;
        document.body.appendChild(overlay);
    } else {
        overlay.querySelector('#loadingMessage').textContent = message;
        overlay.style.display = 'flex';
    }
}

/**
 * Update loading message
 */
function updateLoadingMessage(message) {
    const messageEl = document.getElementById('loadingMessage');
    if (messageEl) messageEl.textContent = message;
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast alert-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);

    // Remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format date
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Get status badge class
 */
function getStatusBadgeClass(status) {
    const classes = {
        'uploaded': 'info',
        'processing': 'warning',
        'processed': 'success',
        'error': 'danger'
    };
    return classes[status] || 'info';
}

// Make functions available globally
window.toggleDocumentSelection = toggleDocumentSelection;
window.summarizeDocument = summarizeDocument;
window.summarizeMultiple = summarizeMultiple;
window.viewDocument = viewDocument;
window.deleteDocument = deleteDocument;
window.deleteSelected = deleteSelected;
window.clearSelection = clearSelection;
window.viewSummary = viewSummary;
window.deleteSummary = deleteSummary;
window.downloadDocument = downloadDocument;
window.downloadDocumentText = downloadDocumentText;
window.downloadSummary = downloadSummary;
window.showProfileModal = showProfileModal;
window.closeModal = closeModal;