import { icons } from './icons';
import { grokApi } from './api';
import * as storage from './storage';
import type { FavoritePost, GrokMessage } from './types';

type ViewType = 'gallery' | 'chat' | 'image-gen' | 'settings';

export class App {
  private currentView: ViewType = 'gallery';
  private chatMessages: GrokMessage[] = [];
  private isLoading = false;

  constructor() {
    // Initialize API key from storage
    const savedApiKey = storage.getApiKey();
    if (savedApiKey) {
      grokApi.setApiKey(savedApiKey);
    }
  }

  mount(selector: string): void {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`Element ${selector} not found`);
    root.innerHTML = this.render();
    this.attachEventListeners();
  }

  private render(): string {
    const usage = storage.getUsageStats();
    
    return `
      <!-- Mobile Usage Bar -->
      <div class="mobile-usage">
        <div class="mobile-usage-stats">
          <div class="mobile-usage-stat">
            <span class="mobile-usage-value">${this.formatTokens(usage.totalTokens)}</span>
            <span class="mobile-usage-label">tokens</span>
          </div>
          <div class="mobile-usage-stat">
            <span class="mobile-usage-value">$${usage.totalCost.toFixed(4)}</span>
            <span class="mobile-usage-label">cost</span>
          </div>
          <div class="mobile-usage-stat">
            <span class="mobile-usage-value">${usage.requestCount}</span>
            <span class="mobile-usage-label">requests</span>
          </div>
        </div>
      </div>

      <!-- Desktop Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-logo">
          <img src="/grok.svg" alt="Grok Bud">
          <h1>Grok Bud</h1>
        </div>
        <nav class="nav-menu">
          <button class="nav-item ${this.currentView === 'gallery' ? 'active' : ''}" data-view="gallery">
            ${icons.grid}
            <span>Gallery</span>
          </button>
          <button class="nav-item ${this.currentView === 'chat' ? 'active' : ''}" data-view="chat">
            ${icons.messageSquare}
            <span>Chat</span>
          </button>
          <button class="nav-item ${this.currentView === 'image-gen' ? 'active' : ''}" data-view="image-gen">
            ${icons.image}
            <span>Image Gen</span>
          </button>
          <button class="nav-item ${this.currentView === 'settings' ? 'active' : ''}" data-view="settings">
            ${icons.settings}
            <span>Settings</span>
          </button>
        </nav>
        <div class="usage-widget">
          <div class="usage-header">
            ${icons.zap}
            <span>Usage</span>
          </div>
          <div class="usage-stats">
            <div class="usage-stat">
              <span class="usage-value">${this.formatTokens(usage.totalTokens)}</span>
              <span class="usage-label">tokens</span>
            </div>
            <div class="usage-stat">
              <span class="usage-value">$${usage.totalCost.toFixed(4)}</span>
              <span class="usage-label">est. cost</span>
            </div>
            <div class="usage-stat">
              <span class="usage-value">${usage.requestCount}</span>
              <span class="usage-label">requests</span>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="main-content">
        ${this.renderCurrentView()}
      </main>

      <!-- Mobile Bottom Navigation -->
      <nav class="mobile-nav">
        <div class="mobile-nav-items">
          <button class="mobile-nav-item ${this.currentView === 'gallery' ? 'active' : ''}" data-view="gallery">
            ${icons.grid}
            <span>Gallery</span>
          </button>
          <button class="mobile-nav-item ${this.currentView === 'chat' ? 'active' : ''}" data-view="chat">
            ${icons.messageSquare}
            <span>Chat</span>
          </button>
          <button class="mobile-nav-item ${this.currentView === 'image-gen' ? 'active' : ''}" data-view="image-gen">
            ${icons.image}
            <span>Image</span>
          </button>
          <button class="mobile-nav-item ${this.currentView === 'settings' ? 'active' : ''}" data-view="settings">
            ${icons.settings}
            <span>Settings</span>
          </button>
        </div>
      </nav>

      <!-- Toast Notifications -->
      <div class="toast-container" id="toast-container"></div>
    `;
  }

  private formatTokens(tokens: number): string {
    if (tokens >= 1_000_000) {
      return (tokens / 1_000_000).toFixed(1) + 'M';
    } else if (tokens >= 1_000) {
      return (tokens / 1_000).toFixed(1) + 'K';
    }
    return tokens.toString();
  }

  private renderCurrentView(): string {
    switch (this.currentView) {
      case 'gallery':
        return this.renderGallery();
      case 'chat':
        return this.renderChat();
      case 'image-gen':
        return this.renderImageGen();
      case 'settings':
        return this.renderSettings();
      default:
        return this.renderGallery();
    }
  }

  private renderGallery(): string {
    const favorites = storage.getFavorites();

    if (favorites.length === 0) {
      return `
        <div class="page-header">
          <h2>Favorites Gallery</h2>
          <p>Your saved conversations and generated images</p>
        </div>
        <div class="empty-state">
          ${icons.heartFilled}
          <h3>No favorites yet</h3>
          <p>Start chatting or generating images and save your favorites here!</p>
        </div>
      `;
    }

    return `
      <div class="page-header">
        <h2>Favorites Gallery</h2>
        <p>Your saved conversations and generated images (${favorites.length} items)</p>
      </div>
      <div class="gallery-grid">
        ${favorites.map(post => this.renderGalleryCard(post)).join('')}
      </div>
    `;
  }

  private renderGalleryCard(post: FavoritePost): string {
    const date = new Date(post.createdAt).toLocaleDateString();
    const typeIcon = post.type === 'image' ? icons.image : icons.messageSquare;

    return `
      <article class="gallery-card" data-post-id="${post.id}">
        ${post.imageUrl 
          ? `<img src="${post.imageUrl}" alt="Generated image" class="card-image">`
          : `<div class="card-image-placeholder">${icons.sparkles}</div>`
        }
        <div class="card-content">
          <div class="card-type">
            ${typeIcon}
            ${post.type === 'image' ? 'Image' : 'Chat'}
          </div>
          <p class="card-prompt">${this.escapeHtml(post.prompt)}</p>
          <p class="card-response">${this.escapeHtml(post.response)}</p>
          ${post.tags.length > 0 ? `
            <div class="card-tags">
              ${post.tags.map(tag => `
                <span class="tag">${icons.tag} ${this.escapeHtml(tag)}</span>
              `).join('')}
            </div>
          ` : ''}
          <div class="card-footer">
            <span class="card-meta">${post.model} • ${date}</span>
            <div class="card-actions">
              <button class="btn btn-ghost btn-icon" data-action="copy" data-post-id="${post.id}" title="Copy response">
                ${icons.copy}
              </button>
              <button class="btn btn-danger btn-icon" data-action="delete" data-post-id="${post.id}" title="Remove from favorites">
                ${icons.trash}
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  private renderChat(): string {
    const selectedModel = storage.getSelectedModel();

    return `
      <div class="page-header">
        <h2>Chat with Grok</h2>
        <p>Have a conversation with Grok AI</p>
      </div>
      <div class="chat-container">
        <div class="chat-messages" id="chat-messages">
          ${this.chatMessages.length === 0 
            ? `<div class="empty-state">
                 ${icons.sparkles}
                 <h3>Start a conversation</h3>
                 <p>Type a message below to begin chatting with Grok</p>
               </div>`
            : this.chatMessages.map(msg => `
                <div class="message message-${msg.role}">
                  <div class="message-content">${this.escapeHtml(msg.content)}</div>
                </div>
              `).join('')
          }
          ${this.isLoading ? `
            <div class="loading">
              ${icons.loader}
              <span>Grok is thinking...</span>
            </div>
          ` : ''}
        </div>
        <div class="chat-input-container">
          <textarea 
            class="input" 
            id="chat-input" 
            placeholder="Type your message..."
            rows="3"
          ></textarea>
          <button class="btn btn-primary" id="send-message" ${this.isLoading ? 'disabled' : ''}>
            ${icons.send}
          </button>
        </div>
        <div class="chat-controls">
          <select class="input input-select" id="chat-model">
            <option value="grok-4" ${selectedModel === 'grok-4' ? 'selected' : ''}>Grok 4</option>
            <option value="grok-3" ${selectedModel === 'grok-3' ? 'selected' : ''}>Grok 3</option>
            <option value="grok-3-mini" ${selectedModel === 'grok-3-mini' ? 'selected' : ''}>Grok 3 Mini</option>
          </select>
          <button class="btn btn-secondary" id="save-chat" ${this.chatMessages.length < 2 ? 'disabled' : ''}>
            ${icons.heart} Save to Favorites
          </button>
          <button class="btn btn-ghost" id="clear-chat" ${this.chatMessages.length === 0 ? 'disabled' : ''}>
            ${icons.trash} Clear
          </button>
        </div>
      </div>
    `;
  }

  private renderImageGen(): string {
    return `
      <div class="page-header">
        <h2>Image Generation</h2>
        <p>Create images with Grok's imagination</p>
      </div>
      <div class="image-gen-container">
        <div class="input-group">
          <label for="image-prompt">Image Prompt</label>
          <textarea 
            class="input" 
            id="image-prompt" 
            placeholder="Describe the image you want to generate..."
            rows="4"
          ></textarea>
        </div>
        <button class="btn btn-primary" id="generate-image" ${this.isLoading ? 'disabled' : ''}>
          ${this.isLoading ? icons.loader : icons.sparkles}
          ${this.isLoading ? 'Generating...' : 'Generate Image'}
        </button>
        <div id="generated-image-result"></div>
      </div>
    `;
  }

  private renderSettings(): string {
    const apiKey = grokApi.getApiKey();
    const hasApiKey = !!apiKey;

    return `
      <div class="page-header">
        <h2>Settings</h2>
        <p>Configure your Grok Bud application</p>
      </div>
      <div class="settings-container">
        <section class="settings-section">
          <h3>${icons.zap} API Configuration</h3>
          <div class="input-group">
            <label for="api-key">Grok API Key</label>
            <input 
              type="password" 
              class="input" 
              id="api-key" 
              placeholder="xai-xxxxxxxxxxxxxxxx"
              value="${apiKey || ''}"
            >
          </div>
          <button class="btn btn-primary" id="save-api-key">
            ${icons.check} Save API Key
          </button>
          ${hasApiKey ? `
            <div class="api-key-status valid">
              ${icons.check} API key configured
            </div>
          ` : `
            <div class="api-key-status invalid">
              ${icons.x} No API key set - Get one from <a href="https://console.x.ai/" target="_blank" style="color: inherit;">console.x.ai</a>
            </div>
          `}
        </section>

        <section class="settings-section">
          <h3>${icons.zap} Usage & Costs</h3>
          ${this.renderUsageDetails()}
          <button class="btn btn-secondary mt-4" id="reset-usage">
            ${icons.trash} Reset Usage Stats
          </button>
        </section>

        <section class="settings-section">
          <h3>${icons.grid} Data Management</h3>
          <p class="text-secondary mb-4">
            You have ${storage.getFavorites().length} saved favorites.
          </p>
          <div class="btn-group">
            <button class="btn btn-secondary" id="export-data">
              ${icons.copy} Export Data
            </button>
            <button class="btn btn-danger" id="clear-all-data">
              ${icons.trash} Clear All Data
            </button>
          </div>
        </section>

        <section class="settings-section">
          <h3>${icons.sparkles} About</h3>
          <p class="text-secondary">
            Grok Bud is a personal AI assistant interface powered by xAI's Grok API.
            Save your favorite conversations and generated images in a beautiful gallery.
          </p>
          <p class="text-muted mt-3 text-sm">
            Version 1.0.0 • Built with Vite + TypeScript
          </p>
        </section>
      </div>
    `;
  }

  private renderUsageDetails(): string {
    const usage = storage.getUsageStats();
    
    return `
      <div class="usage-details">
        <div class="usage-grid">
          <div class="usage-card">
            <div class="usage-card-value">${this.formatTokens(usage.totalTokens)}</div>
            <div class="usage-card-label">Total Tokens</div>
          </div>
          <div class="usage-card">
            <div class="usage-card-value">$${usage.totalCost.toFixed(4)}</div>
            <div class="usage-card-label">Estimated Cost</div>
          </div>
          <div class="usage-card">
            <div class="usage-card-value">${usage.requestCount}</div>
            <div class="usage-card-label">API Requests</div>
          </div>
          <div class="usage-card">
            <div class="usage-card-value">${this.formatTokens(usage.chatTokens)}</div>
            <div class="usage-card-label">Chat Tokens</div>
          </div>
          <div class="usage-card">
            <div class="usage-card-value">${this.formatTokens(usage.imageTokens)}</div>
            <div class="usage-card-label">Image Tokens</div>
          </div>
        </div>
        ${usage.history.length > 0 ? `
          <h4 class="section-title mt-6">Recent Activity</h4>
          <div class="usage-history">
            ${usage.history.slice(0, 10).map(record => `
              <div class="usage-history-item">
                <span class="usage-history-type">${record.endpoint === 'chat' ? icons.messageSquare : icons.image}</span>
                <span class="usage-history-model">${record.model}</span>
                <span class="usage-history-tokens">${this.formatTokens(record.totalTokens)} tokens</span>
                <span class="usage-history-cost">$${record.estimatedCost.toFixed(6)}</span>
                <span class="usage-history-time">${this.formatTime(record.timestamp)}</span>
              </div>
            `).join('')}
          </div>
        ` : `
          <p class="text-muted mt-4">No usage recorded yet. Start chatting or generating images!</p>
        `}
      </div>
    `;
  }

  private formatTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  private attachEventListeners(): void {
    // Desktop Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const view = (e.currentTarget as HTMLElement).dataset.view as ViewType;
        if (view) {
          this.currentView = view;
          this.refreshView();
        }
      });
    });

    // Mobile Navigation
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const view = (e.currentTarget as HTMLElement).dataset.view as ViewType;
        if (view) {
          this.currentView = view;
          this.refreshView();
        }
      });
    });

    // View-specific listeners
    this.attachViewListeners();
  }

  private attachViewListeners(): void {
    switch (this.currentView) {
      case 'gallery':
        this.attachGalleryListeners();
        break;
      case 'chat':
        this.attachChatListeners();
        break;
      case 'image-gen':
        this.attachImageGenListeners();
        break;
      case 'settings':
        this.attachSettingsListeners();
        break;
    }
  }

  private attachGalleryListeners(): void {
    document.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const postId = (e.currentTarget as HTMLElement).dataset.postId;
        if (postId && confirm('Remove this from favorites?')) {
          storage.removeFavorite(postId);
          this.refreshView();
          this.showToast('Removed from favorites', 'success');
        }
      });
    });

    document.querySelectorAll('[data-action="copy"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const postId = (e.currentTarget as HTMLElement).dataset.postId;
        if (postId) {
          const post = storage.getFavorites().find(f => f.id === postId);
          if (post) {
            await navigator.clipboard.writeText(post.response);
            this.showToast('Copied to clipboard!', 'success');
          }
        }
      });
    });
  }

  private attachChatListeners(): void {
    const sendBtn = document.getElementById('send-message');
    const input = document.getElementById('chat-input') as HTMLTextAreaElement;
    const modelSelect = document.getElementById('chat-model') as HTMLSelectElement;
    const saveBtn = document.getElementById('save-chat');
    const clearBtn = document.getElementById('clear-chat');

    const sendMessage = async () => {
      const message = input?.value.trim();
      if (!message || this.isLoading) return;

      if (!grokApi.getApiKey()) {
        this.showToast('Please set your API key in Settings first', 'error');
        return;
      }

      this.chatMessages.push({ role: 'user', content: message });
      input.value = '';
      this.isLoading = true;
      this.refreshView();

      try {
        const model = modelSelect?.value || 'grok-3';
        storage.setSelectedModel(model);

        const response = await grokApi.chatCompletion(
          [
            { role: 'system', content: 'You are a helpful assistant.' },
            ...this.chatMessages
          ],
          model
        );

        const assistantMessage = response.choices[0]?.message.content || 'No response';
        this.chatMessages.push({ role: 'assistant', content: assistantMessage });
      } catch (error) {
        this.showToast(`Error: ${(error as Error).message}`, 'error');
        this.chatMessages.pop(); // Remove the failed user message
      } finally {
        this.isLoading = false;
        this.refreshView();
        // Scroll to bottom
        const messagesDiv = document.getElementById('chat-messages');
        if (messagesDiv) {
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
      }
    };

    sendBtn?.addEventListener('click', sendMessage);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    saveBtn?.addEventListener('click', () => {
      if (this.chatMessages.length >= 2) {
        const lastUserMsg = [...this.chatMessages].reverse().find(m => m.role === 'user');
        const lastAssistantMsg = [...this.chatMessages].reverse().find(m => m.role === 'assistant');

        if (lastUserMsg && lastAssistantMsg) {
          storage.addFavorite({
            type: 'chat',
            prompt: lastUserMsg.content,
            response: lastAssistantMsg.content,
            model: storage.getSelectedModel(),
            tags: [],
          });
          this.showToast('Saved to favorites!', 'success');
        }
      }
    });

    clearBtn?.addEventListener('click', () => {
      this.chatMessages = [];
      this.refreshView();
    });
  }

  private attachImageGenListeners(): void {
    const generateBtn = document.getElementById('generate-image');
    const promptInput = document.getElementById('image-prompt') as HTMLTextAreaElement;

    generateBtn?.addEventListener('click', async () => {
      const prompt = promptInput?.value.trim();
      if (!prompt || this.isLoading) return;

      if (!grokApi.getApiKey()) {
        this.showToast('Please set your API key in Settings first', 'error');
        return;
      }

      this.isLoading = true;
      this.refreshView();

      try {
        const response = await grokApi.generateImage(prompt);
        const imageUrl = response.data[0]?.url;

        if (imageUrl) {
          const resultDiv = document.getElementById('generated-image-result');
          if (resultDiv) {
            resultDiv.innerHTML = `
              <div class="generated-image-container">
                <img src="${imageUrl}" alt="Generated image" class="generated-image">
                <div class="image-actions">
                  <button class="btn btn-primary" id="save-generated-image">
                    ${icons.heart} Save to Favorites
                  </button>
                  <a href="${imageUrl}" target="_blank" class="btn btn-secondary">
                    Open Full Size
                  </a>
                </div>
              </div>
            `;

            document.getElementById('save-generated-image')?.addEventListener('click', () => {
              storage.addFavorite({
                type: 'image',
                prompt: prompt,
                response: response.data[0]?.revised_prompt || 'Generated image',
                imageUrl: imageUrl,
                model: 'grok-imagine-image',
                tags: [],
              });
              this.showToast('Saved to favorites!', 'success');
            });
          }
        }
      } catch (error) {
        this.showToast(`Error: ${(error as Error).message}`, 'error');
      } finally {
        this.isLoading = false;
        const btn = document.getElementById('generate-image');
        if (btn) {
          btn.innerHTML = `${icons.sparkles} Generate Image`;
          btn.removeAttribute('disabled');
        }
      }
    });
  }

  private attachSettingsListeners(): void {
    const saveApiKeyBtn = document.getElementById('save-api-key');
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    const exportBtn = document.getElementById('export-data');
    const clearAllBtn = document.getElementById('clear-all-data');

    saveApiKeyBtn?.addEventListener('click', async () => {
      const apiKey = apiKeyInput?.value.trim();
      if (apiKey) {
        // Temporarily set key to validate it
        grokApi.setApiKey(apiKey);
        saveApiKeyBtn.textContent = 'Validating...';
        saveApiKeyBtn.setAttribute('disabled', 'true');
        
        try {
          const isValid = await grokApi.validateApiKey();
          if (isValid) {
            storage.setApiKey(apiKey);
            this.showToast('API key validated and saved!', 'success');
            this.refreshView();
          } else {
            grokApi.setApiKey(null);
            this.showToast('Invalid API key. Please check and try again.', 'error');
            this.refreshView();
          }
        } catch (error) {
          grokApi.setApiKey(null);
          this.showToast('Failed to validate API key. Please try again.', 'error');
          this.refreshView();
        }
      } else {
        this.showToast('Please enter an API key', 'error');
      }
    });

    exportBtn?.addEventListener('click', () => {
      const data = {
        favorites: storage.getFavorites(),
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grok-bud-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Data exported!', 'success');
    });

    clearAllBtn?.addEventListener('click', () => {
      if (confirm('This will delete all your favorites. Are you sure?')) {
        localStorage.removeItem('grok-bud-state');
        this.showToast('All data cleared', 'success');
        this.refreshView();
      }
    });

    const resetUsageBtn = document.getElementById('reset-usage');
    resetUsageBtn?.addEventListener('click', () => {
      if (confirm('Reset all usage statistics?')) {
        storage.resetUsageStats();
        this.showToast('Usage stats reset', 'success');
        this.refreshView();
      }
    });
  }

  private refreshView(): void {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.innerHTML = this.renderCurrentView();
    }

    // Update desktop nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
      const view = (item as HTMLElement).dataset.view;
      item.classList.toggle('active', view === this.currentView);
    });

    // Update mobile nav active state
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
      const view = (item as HTMLElement).dataset.view;
      item.classList.toggle('active', view === this.currentView);
    });

    // Update usage stats display
    this.updateUsageDisplay();

    this.attachViewListeners();
  }

  private updateUsageDisplay(): void {
    const usage = storage.getUsageStats();
    
    // Update sidebar usage widget
    const sidebarTokens = document.querySelector('.usage-widget .usage-stat:nth-child(1) .usage-value');
    const sidebarCost = document.querySelector('.usage-widget .usage-stat:nth-child(2) .usage-value');
    const sidebarRequests = document.querySelector('.usage-widget .usage-stat:nth-child(3) .usage-value');
    
    if (sidebarTokens) sidebarTokens.textContent = this.formatTokens(usage.totalTokens);
    if (sidebarCost) sidebarCost.textContent = `$${usage.totalCost.toFixed(4)}`;
    if (sidebarRequests) sidebarRequests.textContent = usage.requestCount.toString();
    
    // Update mobile usage bar
    const mobileTokens = document.querySelector('.mobile-usage-stat:nth-child(1) .mobile-usage-value');
    const mobileCost = document.querySelector('.mobile-usage-stat:nth-child(2) .mobile-usage-value');
    const mobileRequests = document.querySelector('.mobile-usage-stat:nth-child(3) .mobile-usage-value');
    
    if (mobileTokens) mobileTokens.textContent = this.formatTokens(usage.totalTokens);
    if (mobileCost) mobileCost.textContent = `$${usage.totalCost.toFixed(4)}`;
    if (mobileRequests) mobileRequests.textContent = usage.requestCount.toString();
  }

  private showToast(message: string, type: 'success' | 'error' = 'success'): void {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      ${type === 'success' ? icons.check : icons.x}
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
