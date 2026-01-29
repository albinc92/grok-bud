import { icons } from './icons';
import { grokApi } from './api';
import * as storage from './storage';
import type { FavoritePost, GrokMessage } from './types';

type ViewType = 'gallery' | 'chat' | 'image-gen' | 'settings';

export class App {
  private currentView: ViewType = 'gallery';
  private chatMessages: GrokMessage[] = [];
  private currentChatId: string | null = null;
  private isLoading = false;
  
  // Image generation state cache
  private imageGenPrompt: string = '';
  private imageGenResults: Array<{ url: string; revised_prompt?: string }> = [];
  private imageGenSavedUrls: Set<string> = new Set();

  constructor() {
    // Initialize API key from storage
    const savedApiKey = storage.getApiKey();
    if (savedApiKey) {
      grokApi.setApiKey(savedApiKey);
    }
    
    // Restore current chat if exists
    this.currentChatId = storage.getCurrentChatId();
    if (this.currentChatId) {
      const chat = storage.getChat(this.currentChatId);
      if (chat?.messages) {
        this.chatMessages = [...chat.messages];
      } else {
        // Chat was deleted, start fresh
        this.currentChatId = null;
        storage.setCurrentChatId(null);
      }
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
    const allFavorites = storage.getFavorites();
    const images = allFavorites.filter(f => f.type === 'image');
    const columns = storage.getGalleryColumns();

    if (images.length === 0) {
      return `
        <div class="page-header">
          <h2>Image Gallery</h2>
          <p>Your generated images</p>
        </div>
        <div class="empty-state">
          ${icons.image}
          <h3>No images yet</h3>
          <p>Generate some images and save them to see them here!</p>
        </div>
      `;
    }

    return `
      <div class="page-header row">
        <div class="flex-1">
          <h2>Image Gallery</h2>
          <p>Your generated images (${images.length} items)</p>
        </div>
        <div class="gallery-controls row-sm">
          <label class="text-sm text-secondary">Columns:</label>
          <select class="input input-select input-sm" id="gallery-columns">
            <option value="2" ${columns === 2 ? 'selected' : ''}>2</option>
            <option value="3" ${columns === 3 ? 'selected' : ''}>3</option>
            <option value="4" ${columns === 4 ? 'selected' : ''}>4</option>
            <option value="5" ${columns === 5 ? 'selected' : ''}>5</option>
            <option value="6" ${columns === 6 ? 'selected' : ''}>6</option>
          </select>
        </div>
      </div>
      <div class="gallery-grid" style="--gallery-columns: ${columns}">
        ${images.map(post => this.renderGalleryCard(post)).join('')}
      </div>
    `;
  }

  private renderGalleryCard(post: FavoritePost): string {
    const date = new Date(post.createdAt).toLocaleDateString();

    return `
      <article class="gallery-card" data-post-id="${post.id}">
        <img src="${post.imageUrl}" alt="Generated image" class="card-image" loading="lazy">
        <div class="card-content">
          <p class="card-prompt">${this.escapeHtml(post.prompt)}</p>
          <div class="card-footer">
            <span class="card-meta">${post.model} • ${date}</span>
            <div class="card-actions">
              <button class="btn btn-ghost btn-icon" data-action="copy" data-post-id="${post.id}" title="Copy prompt">
                ${icons.copy}
              </button>
              <button class="btn btn-danger btn-icon" data-action="delete" data-post-id="${post.id}" title="Delete">
                ${icons.trash}
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  private renderChat(): string {
    const savedChats = storage.getSavedChats();
    const currentChat = this.currentChatId ? storage.getChat(this.currentChatId) : null;
    // Model comes from current chat if loaded, otherwise from global storage
    const selectedModel = currentChat?.model || storage.getSelectedModel();

    // Build chat selector options
    const chatOptions = savedChats.map(chat => {
      const title = chat.title || chat.prompt.slice(0, 40) || 'Untitled';
      const isSelected = chat.id === this.currentChatId;
      return `<option value="${chat.id}" ${isSelected ? 'selected' : ''}>${this.escapeHtml(title)}${title.length >= 40 ? '...' : ''}</option>`;
    }).join('');

    return `
      <div class="chat-view">
        <div class="chat-header">
          <div class="chat-selector">
            <select class="input input-select" id="chat-selector">
              <option value="new" ${!this.currentChatId ? 'selected' : ''}>✨ New Chat</option>
              ${savedChats.length > 0 ? `<optgroup label="Saved Chats">${chatOptions}</optgroup>` : ''}
            </select>
            ${this.currentChatId ? `
              <button class="btn btn-danger btn-icon" id="delete-current-chat" title="Delete this chat">
                ${icons.trash}
              </button>
            ` : ''}
          </div>
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
          <div class="chat-input-area">
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
            <div class="chat-input-controls">
              <select class="input input-select" id="chat-model">
                <option value="grok-4" ${selectedModel === 'grok-4' ? 'selected' : ''}>Grok 4</option>
                <option value="grok-3" ${selectedModel === 'grok-3' ? 'selected' : ''}>Grok 3</option>
                <option value="grok-3-mini" ${selectedModel === 'grok-3-mini' ? 'selected' : ''}>Grok 3 Mini</option>
              </select>
              <button class="btn btn-success" id="save-chat" ${this.chatMessages.length < 2 ? 'disabled' : ''}>
                ${this.currentChatId ? icons.heartFilled : icons.heart} ${this.currentChatId ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderImageGen(): string {
    const imageCount = storage.getImageCount();
    
    return `
      <div class="page-header">
        <h2>Image Generation</h2>
        <p>Create images with Grok's imagination</p>
      </div>
      <section class="card stack">
        <div class="input-group">
          <label for="image-prompt">Image Prompt</label>
          <textarea 
            class="input" 
            id="image-prompt" 
            placeholder="Describe the image you want to generate...\n\nTip: Be specific about style, colors, composition, lighting, and mood for better results."
            rows="4"
          >${this.escapeHtml(this.imageGenPrompt)}</textarea>
        </div>
        
        <div class="input-group">
          <label for="image-count">Number of Images</label>
          <select class="input input-select" id="image-count">
            <option value="1" ${imageCount === 1 ? 'selected' : ''}>1 image</option>
            <option value="2" ${imageCount === 2 ? 'selected' : ''}>2 images</option>
            <option value="3" ${imageCount === 3 ? 'selected' : ''}>3 images</option>
            <option value="4" ${imageCount === 4 ? 'selected' : ''}>4 images</option>
          </select>
          <span class="input-hint">More images = higher cost</span>
        </div>
        
        <button class="btn btn-primary full-width" id="generate-image" ${this.isLoading ? 'disabled' : ''}>
          ${this.isLoading ? icons.loader : icons.sparkles}
          ${this.isLoading ? 'Generating...' : 'Generate Image'}
        </button>
    </section>
      <div id="generated-image-result">${this.renderCachedImageResults()}</div>
    `;
  }

  private renderCachedImageResults(): string {
    if (this.imageGenResults.length === 0) return '';
    
    const images = this.imageGenResults;
    const prompt = this.imageGenPrompt;
    const allSaved = images.every(img => this.imageGenSavedUrls.has(img.url));
    
    const imagesHtml = images.map((img, idx) => {
      const isSaved = this.imageGenSavedUrls.has(img.url);
      return `
        <div class="generated-image-item">
          <img src="${img.url}" alt="Generated image ${idx + 1}" class="generated-image">
          <div class="image-actions">
            <button class="btn btn-success btn-sm save-single-image" data-url="${img.url}" data-prompt="${img.revised_prompt || prompt}" ${isSaved ? 'disabled' : ''}>
              ${isSaved ? icons.heartFilled : icons.heart} ${isSaved ? 'Saved' : 'Save'}
            </button>
            <a href="${img.url}" target="_blank" class="btn btn-ghost btn-sm">
              ${icons.externalLink} Open
            </a>
          </div>
        </div>
      `;
    }).join('');
    
    return `
      <div class="generated-images-grid ${images.length > 1 ? 'multi' : ''}">
        ${imagesHtml}
      </div>
      <div class="row mt-4">
        <button class="btn btn-ghost flex-1" id="regenerate-images">
          ${icons.refresh} Regenerate
        </button>
        <button class="btn btn-primary flex-1" id="save-all-images" ${allSaved ? 'disabled' : ''}>
          ${allSaved ? icons.heartFilled : icons.heart} ${allSaved ? 'Saved' : 'Save'} ${images.length > 1 ? 'All' : ''}
        </button>
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
      <div class="stack-lg">
        <section class="card stack">
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
          <button class="btn btn-primary full-width" id="save-api-key">
            ${icons.check} Save API Key
          </button>
          <span class="input-hint ${hasApiKey ? 'text-success' : 'text-error'}">
            ${hasApiKey ? `${icons.check} API key configured` : `${icons.x} No API key set - Get one from <a href="https://console.x.ai/" target="_blank">console.x.ai</a>`}
          </span>
        </section>

        <section class="card stack">
          <h3>${icons.zap} Usage & Costs</h3>
          ${this.renderUsageDetails()}
          <button class="btn btn-danger full-width" id="reset-usage">
            ${icons.trash} Reset Usage Stats
          </button>
        </section>

        <section class="card stack">
          <h3>${icons.sparkles} About</h3>
          <p class="text-secondary">
            Grok Bud is a personal AI assistant interface powered by xAI's Grok API.
            Save your favorite conversations and generated images in a beautiful gallery.
          </p>
          <span class="input-hint">
            Version 1.0.0 • Built with Vite + TypeScript
          </span>
        </section>
      </div>
    `;
  }

  private renderUsageDetails(): string {
    const usage = storage.getUsageStats();
    
    return `
      <div class="usage-details full-width">
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
            <div class="usage-card-value">${usage.imageCount || 0}</div>
            <div class="usage-card-label">Images Generated</div>
          </div>
        </div>
      </div>
    `;
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
    // Gallery columns control
    const columnsSelect = document.getElementById('gallery-columns') as HTMLSelectElement;
    columnsSelect?.addEventListener('change', () => {
      storage.setGalleryColumns(parseInt(columnsSelect.value));
      this.refreshView();
    });

    document.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const postId = (e.currentTarget as HTMLElement).dataset.postId;
        if (postId && confirm('Delete this image?')) {
          storage.removeFavorite(postId);
          this.refreshView();
          this.showToast('Image deleted', 'success');
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
            await navigator.clipboard.writeText(post.prompt);
            this.showToast('Prompt copied!', 'success');
          }
        }
      });
    });
  }

  private attachChatListeners(): void {
    const sendBtn = document.getElementById('send-message');
    const input = document.getElementById('chat-input') as HTMLTextAreaElement;
    const modelSelect = document.getElementById('chat-model') as HTMLSelectElement;
    const chatSelector = document.getElementById('chat-selector') as HTMLSelectElement;
    const deleteBtn = document.getElementById('delete-current-chat');
    const saveBtn = document.getElementById('save-chat');

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

        // Update existing saved chat if we're in one
        if (this.currentChatId) {
          storage.updateChat(this.currentChatId, this.chatMessages, model);
        }
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

    // Model selector - update current chat's model
    modelSelect?.addEventListener('change', () => {
      const model = modelSelect.value;
      storage.setSelectedModel(model);
      // If we have a current chat, update its model too
      if (this.currentChatId) {
        storage.updateChat(this.currentChatId, this.chatMessages, model);
      }
    });

    // Chat selector - switch between chats or start new
    chatSelector?.addEventListener('change', () => {
      const selectedValue = chatSelector.value;
      
      if (selectedValue === 'new') {
        // Start a new chat
        this.chatMessages = [];
        this.currentChatId = null;
        storage.setCurrentChatId(null);
      } else {
        // Load selected chat
        const chat = storage.getChat(selectedValue);
        if (chat?.messages) {
          this.chatMessages = [...chat.messages];
          this.currentChatId = chat.id;
          storage.setCurrentChatId(chat.id);
        }
      }
      this.refreshView();
    });

    // Delete current chat
    deleteBtn?.addEventListener('click', () => {
      if (this.currentChatId && confirm('Delete this chat?')) {
        storage.removeFavorite(this.currentChatId);
        this.chatMessages = [];
        this.currentChatId = null;
        storage.setCurrentChatId(null);
        this.refreshView();
        this.showToast('Chat deleted', 'success');
      }
    });

    // Save chat as favorite
    saveBtn?.addEventListener('click', () => {
      if (this.chatMessages.length >= 2) {
        const model = modelSelect?.value || storage.getSelectedModel();
        if (this.currentChatId) {
          // Already saved, just update
          storage.updateChat(this.currentChatId, this.chatMessages, model);
          this.showToast('Chat updated!', 'success');
        } else {
          // Save as new favorite
          const newChat = storage.createChat(this.chatMessages, model);
          this.currentChatId = newChat.id;
          storage.setCurrentChatId(newChat.id);
          this.showToast('Chat saved!', 'success');
        }
        this.refreshView();
      }
    });
  }

  private attachImageGenListeners(): void {
    const generateBtn = document.getElementById('generate-image');
    const promptInput = document.getElementById('image-prompt') as HTMLTextAreaElement;
    const countSelect = document.getElementById('image-count') as HTMLSelectElement;

    // Save count preference
    countSelect?.addEventListener('change', () => {
      storage.setImageCount(parseInt(countSelect.value));
    });

    // Save prompt on input
    promptInput?.addEventListener('input', () => {
      this.imageGenPrompt = promptInput.value;
    });

    generateBtn?.addEventListener('click', async () => {
      const prompt = promptInput?.value.trim();
      const imageCount = parseInt(countSelect?.value || '1');
      if (!prompt || this.isLoading) return;

      if (!grokApi.getApiKey()) {
        this.showToast('Please set your API key in Settings first', 'error');
        return;
      }

      this.isLoading = true;
      // Clear previous results when regenerating
      this.imageGenResults = [];
      this.imageGenSavedUrls.clear();
      this.refreshView();

      try {
        const response = await grokApi.generateImage(prompt, 'grok-imagine-image', { n: imageCount });
        const images = response.data;

        if (images.length > 0) {
          // Cache the results
          this.imageGenPrompt = prompt;
          this.imageGenResults = images.map(img => ({
            url: img.url!,
            revised_prompt: img.revised_prompt
          }));
          
          // Re-render to show cached results
          this.isLoading = false;
          this.refreshView();
          this.refreshSidebar();
        }
      } catch (error) {
        this.showToast(`Error: ${(error as Error).message}`, 'error');
        this.isLoading = false;
        this.refreshView();
      }
    });

    // Attach handlers for cached results
    this.attachImageResultHandlers();
  }

  private attachImageResultHandlers(): void {
    const resultDiv = document.getElementById('generated-image-result');
    if (!resultDiv || this.imageGenResults.length === 0) return;

    const generateBtn = document.getElementById('generate-image');
    const prompt = this.imageGenPrompt;
    const images = this.imageGenResults;

    // Regenerate handler
    document.getElementById('regenerate-images')?.addEventListener('click', () => {
      generateBtn?.click();
    });

    // Single image save handlers
    resultDiv.querySelectorAll('.save-single-image').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = (btn as HTMLElement).dataset.url!;
        const revisedPrompt = (btn as HTMLElement).dataset.prompt!;
        storage.addFavorite({
          type: 'image',
          prompt: prompt,
          response: revisedPrompt,
          imageUrl: url,
          model: 'grok-imagine-image',
          tags: [],
        });
        // Track saved state
        this.imageGenSavedUrls.add(url);
        // Update button to show saved state
        btn.innerHTML = `${icons.heartFilled} Saved`;
        (btn as HTMLButtonElement).disabled = true;
        this.showToast('Saved to favorites!', 'success');
      });
    });

    // Save all handler
    const saveAllBtn = document.getElementById('save-all-images');
    saveAllBtn?.addEventListener('click', () => {
      images.forEach((img, idx) => {
        storage.addFavorite({
          type: 'image',
          prompt: prompt,
          response: img.revised_prompt || `Generated image ${idx + 1}`,
          imageUrl: img.url,
          model: 'grok-imagine-image',
          tags: [],
        });
        // Track saved state
        this.imageGenSavedUrls.add(img.url);
      });
      // Update button to show saved state
      saveAllBtn.innerHTML = `${icons.heartFilled} Saved ${images.length > 1 ? 'All' : ''}`;
      (saveAllBtn as HTMLButtonElement).disabled = true;
      // Also disable individual save buttons
      resultDiv.querySelectorAll('.save-single-image').forEach(btn => {
        btn.innerHTML = `${icons.heartFilled} Saved`;
        (btn as HTMLButtonElement).disabled = true;
      });
      this.showToast(`Saved ${images.length} images to favorites!`, 'success');
    });
  }

  private attachSettingsListeners(): void {
    const saveApiKeyBtn = document.getElementById('save-api-key');
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;

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

  private refreshSidebar(): void {
    this.updateUsageDisplay();
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
