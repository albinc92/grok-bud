import { icons } from './icons';
import { grokApi } from './api';
import * as storage from './storage';
import * as cloudStorage from './cloudStorage';
import { videoJobManager } from './videoJobManager';
import { authService, type AuthUser } from './auth';
import type { FavoritePost, GrokMessage, VideoJob } from './types';

type ViewType = 'gallery' | 'chat' | 'image-gen' | 'settings' | 'post';
type MediaViewType = 'image' | 'video';
type AuthModalMode = 'login' | 'signup' | 'magic-link' | null;

export class App {
  private currentView: ViewType = 'gallery';
  private chatMessages: GrokMessage[] = [];
  private currentChatId: string | null = null;
  private currentPostId: string | null = null;
  private isLoading = false;
  private sidebarCollapsed = false;
  
  // Post media viewer state
  private mediaView: MediaViewType = 'image';
  private currentVideoIndex: number = 0;
  
  // Image generation state cache
  private imageGenPrompt: string = '';
  private imageGenResults: Array<{ url: string; revised_prompt?: string }> = [];
  private imageGenSavedUrls: Set<string> = new Set();
  
  // Auth state
  private currentUser: AuthUser | null = null;
  private authModalMode: AuthModalMode = null;
  private authLoading = false;
  private isSyncing = false;
  
  // DOM root reference
  private rootElement: Element | null = null;

  constructor() {
    // Initialize API key from storage
    const savedApiKey = storage.getApiKey();
    if (savedApiKey) {
      grokApi.setApiKey(savedApiKey);
    }
    
    // Restore sidebar state
    this.sidebarCollapsed = storage.getSidebarCollapsed();
    
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
    
    // Restore image generation state (survives HMR)
    const imageGenCache = storage.getImageGenCache();
    if (imageGenCache) {
      this.imageGenPrompt = imageGenCache.prompt;
      this.imageGenResults = imageGenCache.results;
      this.imageGenSavedUrls = new Set(imageGenCache.savedUrls);
    }
    
    // Start video job manager and subscribe to updates
    videoJobManager.start();
    videoJobManager.onUpdate((job: VideoJob) => {
      this.handleVideoJobUpdate(job);
    });
    
    // Initialize auth and sync
    this.initAuth();
  }
  
  private async initAuth(): Promise<void> {
    // Initialize auth service
    this.currentUser = await authService.initialize();
    
    // Subscribe to auth changes
    authService.onAuthChange(async (user) => {
      this.currentUser = user;
      this.fullRender();
      
      if (user) {
        // Sync data when user logs in
        await this.syncWithCloud();
      }
    });
    
    // If already logged in, sync
    if (this.currentUser) {
      await this.syncWithCloud();
    }
    
    // Re-render to show auth state
    this.fullRender();
  }
  
  private async syncWithCloud(): Promise<void> {
    if (this.isSyncing) return;
    
    try {
      this.isSyncing = true;
      this.fullRender();
      
      await cloudStorage.performFullSync();
      
      this.showToast('Synced with cloud', 'success');
    } catch (error) {
      console.error('[App] Sync failed:', error);
      this.showToast('Sync failed', 'error');
    } finally {
      this.isSyncing = false;
      this.fullRender();
    }
  }
  
  private handleVideoJobUpdate(job: VideoJob): void {
    // Refresh gallery view to update spinner status
    if (this.currentView === 'gallery') {
      this.refreshView();
    }
    
    // If we're viewing the post that this job is for, refresh and notify
    if (this.currentView === 'post' && this.currentPostId === job.postId) {
      if (job.status === 'done') {
        // Auto-switch to video view and show the latest video
        const post = storage.getFavorites().find(f => f.id === job.postId);
        const videos = post?.videos || [];
        this.mediaView = 'video';
        this.currentVideoIndex = Math.max(0, videos.length - 1);
        this.showToast('Video generated successfully!', 'success');
      } else if (job.status === 'error') {
        this.showToast(job.errorMessage || 'Video generation failed', 'error');
      }
      this.refreshView();
    } else if (job.status === 'done') {
      // Notify even when not viewing the post
      this.showToast('Video ready! Check the post to view it.', 'success');
    } else if (job.status === 'error') {
      this.showToast(job.errorMessage || 'Video generation failed', 'error');
    }
  }

  mount(selector: string): void {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`Element ${selector} not found`);
    this.rootElement = root;
    root.innerHTML = this.render();
    this.attachEventListeners();
    this.setupResizeListener();
  }
  
  // Full re-render with event listener reattachment
  private fullRender(): void {
    if (!this.rootElement) return;
    this.rootElement.innerHTML = this.render();
    this.attachEventListeners();
  }

  private getMaxColumnsForWidth(width: number): number {
    if (width < 768) return 1;      // Mobile: always 1
    if (width < 1024) return 3;     // Tablet: max 3
    if (width < 1440) return 4;     // Small desktop: max 4
    return 6;                       // Large desktop: max 6
  }

  private setupResizeListener(): void {
    let resizeTimeout: number;
    
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        const maxColumns = this.getMaxColumnsForWidth(window.innerWidth);
        const currentColumns = storage.getGalleryColumns();
        
        // Clamp current columns to max allowed
        if (currentColumns > maxColumns) {
          storage.setGalleryColumns(maxColumns);
        }
        
        // Update the gallery grid and select if on gallery view
        if (this.currentView === 'gallery') {
          this.updateGalleryColumns();
        }
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    // Initial check
    handleResize();
  }

  private updateGalleryColumns(): void {
    const maxColumns = this.getMaxColumnsForWidth(window.innerWidth);
    let columns = storage.getGalleryColumns();
    
    // Clamp to max
    if (columns > maxColumns) {
      columns = maxColumns;
      storage.setGalleryColumns(columns);
    }
    
    // Update the grid
    const grid = document.querySelector('.gallery-grid') as HTMLElement;
    if (grid) {
      grid.style.setProperty('--gallery-columns', String(columns));
    }
    
    // Update the select options
    const select = document.getElementById('gallery-columns') as HTMLSelectElement;
    if (select) {
      // Rebuild options based on max
      select.innerHTML = '';
      for (let i = 1; i <= maxColumns; i++) {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = String(i);
        option.selected = i === columns;
        select.appendChild(option);
      }
    }
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
      <aside class="sidebar${this.sidebarCollapsed ? ' collapsed' : ''}" id="sidebar">
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
        
        <!-- Account Section -->
        <div class="account-widget">
          ${this.currentUser ? `
            <div class="account-info account-widget-expanded">
              <div class="account-avatar">
                ${this.currentUser.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div class="account-details">
                <span class="account-email">${this.currentUser.email}</span>
                <span class="account-sync">
                  ${this.isSyncing ? `${icons.loader} Syncing...` : `${icons.cloud} Synced`}
                </span>
              </div>
            </div>
            <div class="account-actions account-widget-expanded">
              <button class="btn btn-ghost btn-sm" id="sync-now" title="Sync now" ${this.isSyncing ? 'disabled' : ''}>
                ${icons.refresh}
              </button>
              <button class="btn btn-ghost btn-sm" id="sign-out" title="Sign out">
                ${icons.logOut}
              </button>
            </div>
            <div class="account-collapsed-user account-widget-collapsed">
              <div class="account-avatar" title="${this.currentUser.email}">
                ${this.currentUser.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <button class="btn btn-ghost btn-icon" id="sync-now-collapsed" title="Sync now" ${this.isSyncing ? 'disabled' : ''}>
                ${this.isSyncing ? icons.loader : icons.refresh}
              </button>
              <button class="btn btn-ghost btn-icon" id="sign-out-collapsed" title="Sign out">
                ${icons.logOut}
              </button>
            </div>
          ` : `
            <button class="btn btn-primary w-full open-auth-modal account-widget-expanded">
              ${icons.user} Sign In
            </button>
            <button class="btn btn-primary btn-icon open-auth-modal account-widget-collapsed" title="Sign In">
              ${icons.user}
            </button>
            <p class="account-hint">Sign in to sync across devices</p>
          `}
        </div>
        
        <button class="sidebar-toggle" id="sidebar-toggle" title="Toggle sidebar">
          ${this.sidebarCollapsed ? icons.chevronRight : icons.chevronLeft}
        </button>
      </aside>

      <!-- Main Content -->
      <main class="main-content${this.sidebarCollapsed ? ' sidebar-collapsed' : ''}">
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
          <button class="mobile-nav-item mobile-account-btn open-auth-modal ${this.currentUser ? 'logged-in' : ''}" ${this.currentUser ? 'disabled' : ''}>
            ${this.currentUser ? `
              <span class="mobile-account-avatar">${this.currentUser.email?.charAt(0).toUpperCase() || 'U'}</span>
            ` : icons.user}
            <span>${this.currentUser ? 'Synced' : 'Account'}</span>
          </button>
        </div>
      </nav>

      <!-- Toast Notifications -->
      <div class="toast-container" id="toast-container"></div>

      <!-- Confirmation Modal -->
      <div class="modal-overlay" id="confirm-modal" style="display: none;">
        <div class="modal confirm-modal">
          <div class="modal-header">
            <h3 id="confirm-modal-title">Confirm</h3>
          </div>
          <div class="modal-body">
            <p id="confirm-modal-message"></p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" id="confirm-modal-cancel">Cancel</button>
            <button class="btn btn-danger" id="confirm-modal-confirm">Delete</button>
          </div>
        </div>
      </div>
      
      <!-- Auth Modal -->
      ${this.renderAuthModal()}
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
      case 'post':
        return this.renderPost();
      default:
        return this.renderGallery();
    }
  }

  private renderGallery(): string {
    const allFavorites = storage.getFavorites();
    const images = allFavorites.filter(f => f.type === 'image');
    let columns = storage.getGalleryColumns();

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

    const maxColumns = this.getMaxColumnsForWidth(window.innerWidth);
    // Clamp columns to max for current screen
    if (columns > maxColumns) {
      columns = maxColumns;
      storage.setGalleryColumns(columns);
    }
    
    // Generate column options dynamically
    const columnOptions = Array.from({ length: maxColumns }, (_, i) => i + 1)
      .map(n => `<option value="${n}" ${columns === n ? 'selected' : ''}>${n}</option>`)
      .join('');

    return `
      <div class="page-header row">
        <div class="flex-1">
          <h2>Image Gallery</h2>
          <p>Your generated images (${images.length} items)</p>
        </div>
        <div class="gallery-controls row-sm">
          <label class="text-sm text-secondary">Columns:</label>
          <select class="input input-select input-sm" id="gallery-columns">
            ${columnOptions}
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
    const videoJob = videoJobManager.getJobForPost(post.id);
    const isGeneratingVideo = videoJob?.status === 'pending';

    return `
      <article class="gallery-card" data-post-id="${post.id}">
        <div class="card-image-container">
          <img src="${post.imageUrl}" alt="Generated image" class="card-image" loading="lazy">
          ${isGeneratingVideo ? `
            <div class="card-video-overlay">
              <div class="card-video-spinner">
                ${icons.loader}
                <span>Generating video...</span>
              </div>
            </div>
          ` : ''}
        </div>
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
    const aspectRatio = storage.getAspectRatio();
    
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
        
        <div class="row">
          <div class="input-group flex-1">
            <label for="image-count">Images</label>
            <select class="input input-select" id="image-count">
              <option value="1" ${imageCount === 1 ? 'selected' : ''}>1</option>
              <option value="2" ${imageCount === 2 ? 'selected' : ''}>2</option>
              <option value="3" ${imageCount === 3 ? 'selected' : ''}>3</option>
              <option value="4" ${imageCount === 4 ? 'selected' : ''}>4</option>
            </select>
          </div>
          
          <div class="input-group flex-1">
            <label for="aspect-ratio">Aspect Ratio</label>
            <select class="input input-select" id="aspect-ratio">
              <option value="1:1" ${aspectRatio === '1:1' ? 'selected' : ''}>1:1 (Square)</option>
              <option value="16:9" ${aspectRatio === '16:9' ? 'selected' : ''}>16:9 (Landscape)</option>
              <option value="9:16" ${aspectRatio === '9:16' ? 'selected' : ''}>9:16 (Portrait)</option>
              <option value="4:3" ${aspectRatio === '4:3' ? 'selected' : ''}>4:3 (Classic)</option>
              <option value="3:4" ${aspectRatio === '3:4' ? 'selected' : ''}>3:4 (Portrait)</option>
            </select>
          </div>
        </div>
        
        <button class="btn btn-primary w-full" id="generate-image" ${this.isLoading ? 'disabled' : ''}>
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
        <button class="btn btn-primary flex-1" id="regenerate-images">
          ${icons.refresh} Regenerate
        </button>
        <button class="btn btn-success flex-1" id="save-all-images" ${allSaved ? 'disabled' : ''}>
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
          <button class="btn btn-primary w-full" id="save-api-key">
            ${icons.check} Save API Key
          </button>
          <span class="input-hint ${hasApiKey ? 'text-success' : 'text-error'}">
            ${hasApiKey ? `${icons.check} API key configured` : `${icons.x} No API key set - Get one from <a href="https://console.x.ai/" target="_blank">console.x.ai</a>`}
          </span>
        </section>

        <section class="card stack">
          <h3>${icons.zap} Usage & Costs</h3>
          ${this.renderUsageDetails()}
          <button class="btn btn-danger w-full" id="reset-usage">
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
      <div class="usage-details w-full">
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

  private renderPost(): string {
    if (!this.currentPostId) {
      return this.renderGallery();
    }

    const post = storage.getFavorites().find(f => f.id === this.currentPostId);
    if (!post || post.type !== 'image') {
      return this.renderGallery();
    }

    // Get video job state from storage
    const videoJob = videoJobManager.getJobForPost(this.currentPostId);
    const isVideoGenerating = videoJob?.status === 'pending';
    const videoError = videoJob?.status === 'error' ? videoJob.errorMessage : null;

    // Get videos stored on post
    const videos = post.videos || [];
    const hasVideos = videos.length > 0;
    
    // Clamp video index to valid range
    const videoIndex = Math.min(this.currentVideoIndex, Math.max(0, videos.length - 1));
    const currentVideo = hasVideos ? videos[videoIndex] : null;

    const date = new Date(post.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return `
      <div class="post-view">
        <div class="post-header">
          <button class="btn btn-ghost" id="back-to-gallery">
            ${icons.arrowLeft} Back to Gallery
          </button>
          <div class="post-actions">
            <button class="btn btn-danger btn-icon" id="delete-post" title="Delete">
              ${icons.trash}
            </button>
          </div>
        </div>
        
        <div class="post-content">
          <div class="post-media-container">
            ${hasVideos ? `
              <div class="media-toggle">
                <button class="media-toggle-btn ${this.mediaView === 'image' ? 'active' : ''}" id="media-view-image">
                  ${icons.image} Image
                </button>
                <button class="media-toggle-btn ${this.mediaView === 'video' ? 'active' : ''}" id="media-view-video">
                  ${icons.video} Videos (${videos.length})
                </button>
              </div>
            ` : ''}
            
            ${this.mediaView === 'image' || !hasVideos ? `
              <div class="post-image-container">
                <img src="${post.imageUrl}" alt="Generated image" class="post-image">
              </div>
            ` : `
              <div class="post-video-container">
                <video controls autoplay loop class="post-video" key="${currentVideo?.id}">
                  <source src="${currentVideo?.url}" type="video/mp4">
                  Your browser does not support the video tag.
                </video>
                
                <div class="video-controls-overlay">
                  <div class="video-nav">
                    <button class="btn btn-ghost btn-icon" id="video-prev" ${videoIndex === 0 ? 'disabled' : ''}>
                      ${icons.chevronLeft}
                    </button>
                    <span class="video-counter">${videoIndex + 1} / ${videos.length}</span>
                    <button class="btn btn-ghost btn-icon" id="video-next" ${videoIndex >= videos.length - 1 ? 'disabled' : ''}>
                      ${icons.chevronRight}
                    </button>
                  </div>
                  
                  <div class="video-actions">
                    <button class="btn btn-ghost btn-icon" id="video-star" title="${currentVideo?.starred ? 'Unstar' : 'Star'}">
                      ${currentVideo?.starred ? icons.starFilled : icons.star}
                    </button>
                    <a href="${currentVideo?.url}" download class="btn btn-ghost btn-icon" title="Download">
                      ${icons.download}
                    </a>
                    <button class="btn btn-ghost btn-icon text-error" id="video-delete" title="Delete video">
                      ${icons.trash}
                    </button>
                  </div>
                </div>
                
                <div class="video-info">
                  <span class="video-duration">${currentVideo?.duration}s</span>
                  <span class="video-prompt" title="${this.escapeHtml(currentVideo?.prompt || '')}">${this.escapeHtml(this.truncateText(currentVideo?.prompt || '', 50))}</span>
                </div>
              </div>
            `}
          </div>
          
          <div class="post-details">
            <div class="post-meta">
              <span class="post-model">${post.model}</span>
              <span class="post-date">${date}</span>
            </div>
            
            <div class="post-prompt">
              <div class="post-prompt-header">
                <h3>Prompt</h3>
                <button class="btn btn-ghost btn-sm" id="copy-post-prompt" title="Copy prompt">
                  ${icons.copy} Copy
                </button>
              </div>
              <p>${this.escapeHtml(post.prompt)}</p>
            </div>

            <div class="post-video-section card">
              <h3>${icons.video} Generate Video</h3>
              <p class="text-secondary text-sm">Transform this image into a video using Grok's video generation.</p>
              
              <div class="video-gen-form">
                <div class="input-group">
                  <label for="video-prompt">Video Prompt (optional)</label>
                  <textarea 
                    class="input" 
                    id="video-prompt" 
                    rows="2"
                    placeholder="Describe how you want the image to animate..."
                    ${isVideoGenerating ? 'disabled' : ''}
                  ></textarea>
                  <span class="input-hint">Leave empty to use the original image prompt</span>
                </div>
                
                <div class="video-gen-options">
                  <div class="input-group">
                    <label for="video-duration">Duration</label>
                    <select class="input input-select" id="video-duration" ${isVideoGenerating ? 'disabled' : ''}>
                      <option value="5">5 seconds</option>
                      <option value="6" selected>6 seconds</option>
                      <option value="7">7 seconds</option>
                      <option value="8">8 seconds</option>
                      <option value="9">9 seconds</option>
                      <option value="10">10 seconds</option>
                      <option value="11">11 seconds</option>
                      <option value="12">12 seconds</option>
                      <option value="13">13 seconds</option>
                      <option value="14">14 seconds</option>
                      <option value="15">15 seconds</option>
                    </select>
                  </div>
                </div>
                
                <div class="btn-group">
                  <button class="btn btn-primary btn-lg w-full" id="generate-video" ${isVideoGenerating ? 'disabled' : ''}>
                    ${isVideoGenerating ? icons.loader : icons.video}
                    ${isVideoGenerating ? 'Generating...' : 'Generate Video'}
                  </button>
                </div>
              </div>
              
              ${videoError ? `
                <div class="video-error mt-4">
                  <p class="text-error">${icons.x} ${videoError}</p>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  private attachEventListeners(): void {
    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebar-toggle');
    sidebarToggle?.addEventListener('click', () => {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      storage.setSidebarCollapsed(this.sidebarCollapsed);
      
      const sidebar = document.getElementById('sidebar');
      const mainContent = document.querySelector('.main-content');
      
      if (sidebar) {
        sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
      }
      if (mainContent) {
        mainContent.classList.toggle('sidebar-collapsed', this.sidebarCollapsed);
      }
      
      // Update toggle button icon
      if (sidebarToggle) {
        sidebarToggle.innerHTML = this.sidebarCollapsed ? icons.chevronRight : icons.chevronLeft;
      }
    });
    
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

    // Auth listeners
    this.attachAuthListeners();

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
      case 'post':
        this.attachPostListeners();
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

    // Click on gallery card to open post view
    document.querySelectorAll('.gallery-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't navigate if clicking on action buttons
        if ((e.target as HTMLElement).closest('[data-action]')) return;
        
        const postId = (card as HTMLElement).dataset.postId;
        if (postId) {
          this.currentPostId = postId;
          this.currentView = 'post';
          this.refreshView();
        }
      });
    });

    document.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const postId = (e.currentTarget as HTMLElement).dataset.postId;
        if (postId) {
          const confirmed = await this.showConfirmModal({
            title: 'Delete Image',
            message: 'Are you sure you want to delete this image from your favorites?',
            confirmText: 'Delete',
            confirmClass: 'btn-danger'
          });
          if (confirmed) {
            cloudStorage.removeFavoriteFromCloud(postId);
            this.refreshView();
            this.showToast('Image deleted', 'success');
          }
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
          cloudStorage.updateChatInCloud(this.currentChatId, this.chatMessages, model);
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
        cloudStorage.updateChatInCloud(this.currentChatId, this.chatMessages, model);
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
    deleteBtn?.addEventListener('click', async () => {
      if (this.currentChatId) {
        const confirmed = await this.showConfirmModal({
          title: 'Delete Chat',
          message: 'Are you sure you want to delete this chat? This cannot be undone.',
          confirmText: 'Delete',
          confirmClass: 'btn-danger'
        });
        if (confirmed) {
          cloudStorage.removeFavoriteFromCloud(this.currentChatId);
          this.chatMessages = [];
          this.currentChatId = null;
          storage.setCurrentChatId(null);
          this.refreshView();
          this.showToast('Chat deleted', 'success');
        }
      }
    });

    // Save chat as favorite
    saveBtn?.addEventListener('click', async () => {
      if (this.chatMessages.length >= 2) {
        const model = modelSelect?.value || storage.getSelectedModel();
        if (this.currentChatId) {
          // Already saved, just update
          cloudStorage.updateChatInCloud(this.currentChatId, this.chatMessages, model);
          this.showToast('Chat updated!', 'success');
        } else {
          // Save as new favorite
          const newChat = await cloudStorage.createChatInCloud(this.chatMessages, model);
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
    const aspectRatioSelect = document.getElementById('aspect-ratio') as HTMLSelectElement;

    // Save count preference
    countSelect?.addEventListener('change', () => {
      storage.setImageCount(parseInt(countSelect.value));
    });

    // Save aspect ratio preference
    aspectRatioSelect?.addEventListener('change', () => {
      storage.setAspectRatio(aspectRatioSelect.value);
    });

    // Save prompt on input
    promptInput?.addEventListener('input', () => {
      this.imageGenPrompt = promptInput.value;
    });

    generateBtn?.addEventListener('click', async () => {
      const prompt = promptInput?.value.trim();
      const imageCount = parseInt(countSelect?.value || '1');
      const aspectRatio = aspectRatioSelect?.value || '1:1';
      if (!prompt || this.isLoading) return;

      if (!grokApi.getApiKey()) {
        this.showToast('Please set your API key in Settings first', 'error');
        return;
      }

      this.isLoading = true;
      // Clear previous results to show loading state
      this.imageGenResults = [];
      this.refreshView();

      try {
        const response = await grokApi.generateImage(prompt, 'grok-imagine-image', { 
          n: imageCount,
          aspect_ratio: aspectRatio
        });
        const images = response.data;

        // Cache the results on successful response
        this.imageGenPrompt = prompt;
        this.imageGenResults = images
          .filter(img => img.url)
          .map(img => ({
            url: img.url!,
            revised_prompt: img.revised_prompt
          }));
        this.imageGenSavedUrls.clear();
        
        // Persist to localStorage (survives HMR)
        this.saveImageGenCache();
        
        this.refreshSidebar();
      } catch (error) {
        this.showToast(`Error: ${(error as Error).message}`, 'error');
      } finally {
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
        cloudStorage.addFavoriteToCloud({
          type: 'image',
          prompt: prompt,
          response: revisedPrompt,
          imageUrl: url,
          model: 'grok-imagine-image',
          tags: [],
        });
        // Track saved state
        this.imageGenSavedUrls.add(url);
        this.saveImageGenCache();
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
        cloudStorage.addFavoriteToCloud({
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
      this.saveImageGenCache();
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

  private saveImageGenCache(): void {
    storage.setImageGenCache({
      prompt: this.imageGenPrompt,
      results: this.imageGenResults,
      savedUrls: Array.from(this.imageGenSavedUrls)
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
    resetUsageBtn?.addEventListener('click', async () => {
      const confirmed = await this.showConfirmModal({
        title: 'Reset Usage Statistics',
        message: 'Are you sure you want to reset all usage statistics? This cannot be undone.',
        confirmText: 'Reset',
        confirmClass: 'btn-danger'
      });
      if (confirmed) {
        storage.resetUsageStats();
        this.showToast('Usage stats reset', 'success');
        this.refreshView();
      }
    });
  }

  private attachPostListeners(): void {
    // Back to gallery
    const backBtn = document.getElementById('back-to-gallery');
    backBtn?.addEventListener('click', () => {
      this.currentPostId = null;
      this.currentView = 'gallery';
      this.mediaView = 'image';
      this.currentVideoIndex = 0;
      this.refreshView();
    });

    // Media view toggle
    const mediaImageBtn = document.getElementById('media-view-image');
    mediaImageBtn?.addEventListener('click', () => {
      this.mediaView = 'image';
      this.refreshView();
    });

    const mediaVideoBtn = document.getElementById('media-view-video');
    mediaVideoBtn?.addEventListener('click', () => {
      this.mediaView = 'video';
      this.refreshView();
    });

    // Video navigation
    const videoPrevBtn = document.getElementById('video-prev');
    videoPrevBtn?.addEventListener('click', () => {
      if (this.currentVideoIndex > 0) {
        this.currentVideoIndex--;
        this.refreshView();
      }
    });

    const videoNextBtn = document.getElementById('video-next');
    videoNextBtn?.addEventListener('click', () => {
      const post = storage.getFavorites().find(f => f.id === this.currentPostId);
      const videos = post?.videos || [];
      if (this.currentVideoIndex < videos.length - 1) {
        this.currentVideoIndex++;
        this.refreshView();
      }
    });

    // Video star toggle
    const videoStarBtn = document.getElementById('video-star');
    videoStarBtn?.addEventListener('click', () => {
      if (!this.currentPostId) return;
      const post = storage.getFavorites().find(f => f.id === this.currentPostId);
      const videos = post?.videos || [];
      const currentVideo = videos[this.currentVideoIndex];
      if (currentVideo) {
        cloudStorage.toggleVideoStarCloud(this.currentPostId, currentVideo.id);
        this.refreshView();
      }
    });

    // Video delete
    const videoDeleteBtn = document.getElementById('video-delete');
    videoDeleteBtn?.addEventListener('click', async () => {
      if (!this.currentPostId) return;
      const post = storage.getFavorites().find(f => f.id === this.currentPostId);
      const videos = post?.videos || [];
      const currentVideo = videos[this.currentVideoIndex];
      
      if (currentVideo) {
        const confirmed = await this.showConfirmModal({
          title: 'Delete Video',
          message: 'Are you sure you want to delete this video?',
          confirmText: 'Delete',
          confirmClass: 'btn-danger'
        });
        
        if (confirmed) {
          cloudStorage.removeVideoFromPostCloud(this.currentPostId, currentVideo.id);
          // Adjust index if we deleted the last video
          const remainingVideos = (storage.getFavorites().find(f => f.id === this.currentPostId)?.videos || []).length;
          if (this.currentVideoIndex >= remainingVideos) {
            this.currentVideoIndex = Math.max(0, remainingVideos - 1);
          }
          // If no videos left, switch back to image view
          if (remainingVideos === 0) {
            this.mediaView = 'image';
          }
          this.refreshView();
          this.showToast('Video deleted', 'success');
        }
      }
    });

    // Copy prompt
    const copyBtn = document.getElementById('copy-post-prompt');
    copyBtn?.addEventListener('click', async () => {
      if (this.currentPostId) {
        const post = storage.getFavorites().find(f => f.id === this.currentPostId);
        if (post) {
          await navigator.clipboard.writeText(post.prompt);
          this.showToast('Prompt copied!', 'success');
        }
      }
    });

    // Delete post
    const deleteBtn = document.getElementById('delete-post');
    deleteBtn?.addEventListener('click', async () => {
      if (this.currentPostId) {
        const confirmed = await this.showConfirmModal({
          title: 'Delete Image',
          message: 'Are you sure you want to delete this image from your favorites?',
          confirmText: 'Delete',
          confirmClass: 'btn-danger'
        });
        if (confirmed) {
          cloudStorage.removeFavoriteFromCloud(this.currentPostId);
          this.currentPostId = null;
          this.currentView = 'gallery';
          this.mediaView = 'image';
          this.currentVideoIndex = 0;
          this.refreshView();
          this.showToast('Image deleted', 'success');
        }
      }
    });

    // Generate video
    const generateVideoBtn = document.getElementById('generate-video');
    generateVideoBtn?.addEventListener('click', async () => {
      // Check if there's already a pending job for this post
      const existingJob = videoJobManager.getJobForPost(this.currentPostId || '');
      if (existingJob?.status === 'pending') {
        this.showToast('Video generation already in progress', 'error');
        return;
      }

      if (!grokApi.getApiKey()) {
        this.showToast('Please set your API key in Settings first', 'error');
        return;
      }

      const post = storage.getFavorites().find(f => f.id === this.currentPostId);
      if (!post || !post.imageUrl) {
        this.showToast('No image found for video generation', 'error');
        return;
      }

      const videoPromptInput = document.getElementById('video-prompt') as HTMLTextAreaElement;
      const videoDurationSelect = document.getElementById('video-duration') as HTMLSelectElement;
      const videoPrompt = videoPromptInput?.value.trim() || post.prompt;
      const videoDuration = parseInt(videoDurationSelect?.value || '6');

      // Start the job in background
      const job = await videoJobManager.startJob(
        post.id,
        videoPrompt,
        post.imageUrl,
        videoDuration
      );

      if (job) {
        this.showToast('Video generation started in background', 'success');
        this.refreshView();
      } else {
        this.showToast('Failed to start video generation', 'error');
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

  private showConfirmModal(options: {
    title: string;
    message: string;
    confirmText?: string;
    confirmClass?: string;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-modal-title');
      const messageEl = document.getElementById('confirm-modal-message');
      const confirmBtn = document.getElementById('confirm-modal-confirm');
      const cancelBtn = document.getElementById('confirm-modal-cancel');
      
      if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
        resolve(false);
        return;
      }

      titleEl.textContent = options.title;
      messageEl.textContent = options.message;
      confirmBtn.textContent = options.confirmText || 'Delete';
      confirmBtn.className = `btn ${options.confirmClass || 'btn-danger'}`;
      modal.style.display = 'flex';

      const cleanup = () => {
        modal.style.display = 'none';
        confirmBtn.replaceWith(confirmBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        modal.replaceWith(modal.cloneNode(true));
      };

      const handleConfirm = () => {
        cleanup();
        resolve(true);
      };

      const handleCancel = () => {
        cleanup();
        resolve(false);
      };

      const handleOverlayClick = (e: Event) => {
        if (e.target === modal) {
          handleCancel();
        }
      };

      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel();
        } else if (e.key === 'Enter') {
          handleConfirm();
        }
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      modal.addEventListener('click', handleOverlayClick);
      document.addEventListener('keydown', handleKeydown, { once: true });
    });
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

  private renderAuthModal(): string {
    if (!this.authModalMode) return '';

    const isLogin = this.authModalMode === 'login';
    const isSignup = this.authModalMode === 'signup';
    const isMagicLink = this.authModalMode === 'magic-link';

    return `
      <div class="modal-overlay" id="auth-modal">
        <div class="modal auth-modal">
          <div class="modal-header">
            <h2>${isLogin ? 'Sign In' : isSignup ? 'Create Account' : 'Magic Link'}</h2>
            <button class="btn btn-ghost btn-icon" id="close-auth-modal">
              ${icons.x}
            </button>
          </div>
          
          <div class="modal-body">
            ${isMagicLink ? `
              <p class="text-secondary text-sm mb-4">Enter your email and we'll send you a magic link to sign in.</p>
            ` : ''}
            
            <form id="auth-form" class="auth-form">
              <div class="input-group">
                <label for="auth-email">Email</label>
                <input type="email" class="input" id="auth-email" required placeholder="you@example.com">
              </div>
              
              ${!isMagicLink ? `
                <div class="input-group">
                  <label for="auth-password">Password</label>
                  <input type="password" class="input" id="auth-password" required placeholder="••••••••" minlength="6">
                </div>
              ` : ''}
              
              <button type="submit" class="btn btn-primary w-full" ${this.authLoading ? 'disabled' : ''}>
                ${this.authLoading ? icons.loader : ''}
                ${isMagicLink ? 'Send Magic Link' : isLogin ? 'Sign In' : 'Create Account'}
              </button>
            </form>
            
            <div class="auth-divider">
              <span>or</span>
            </div>
            
            ${isLogin ? `
              <button class="btn btn-ghost w-full" id="auth-switch-magic">
                ${icons.mail} Sign in with Magic Link
              </button>
              <p class="auth-switch">
                Don't have an account? <button class="btn-link" id="auth-switch-signup">Sign up</button>
              </p>
            ` : isSignup ? `
              <p class="auth-switch">
                Already have an account? <button class="btn-link" id="auth-switch-login">Sign in</button>
              </p>
            ` : `
              <button class="btn btn-ghost w-full" id="auth-switch-password">
                Sign in with Password
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }

  private attachAuthListeners(): void {
    // Open auth modal (both desktop and mobile buttons)
    document.querySelectorAll('.open-auth-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        this.authModalMode = 'login';
        this.fullRender();
      });
    });

    // Sync now buttons (expanded and collapsed)
    document.querySelectorAll('#sync-now, #sync-now-collapsed').forEach(btn => {
      btn.addEventListener('click', () => {
        this.syncWithCloud();
      });
    });

    // Sign out buttons (expanded and collapsed)
    document.querySelectorAll('#sign-out, #sign-out-collapsed').forEach(btn => {
      btn.addEventListener('click', async () => {
        await authService.signOut();
        this.showToast('Signed out', 'success');
      });
    });

    // Close auth modal
    const closeAuthBtn = document.getElementById('close-auth-modal');
    closeAuthBtn?.addEventListener('click', () => {
      this.authModalMode = null;
      this.fullRender();
    });

    // Modal overlay click to close
    const authModal = document.getElementById('auth-modal');
    authModal?.addEventListener('click', (e) => {
      if (e.target === authModal) {
        this.authModalMode = null;
        this.fullRender();
      }
    });

    // Auth form submit
    const authForm = document.getElementById('auth-form');
    authForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const emailInput = document.getElementById('auth-email') as HTMLInputElement;
      const passwordInput = document.getElementById('auth-password') as HTMLInputElement;
      
      const email = emailInput?.value.trim();
      const password = passwordInput?.value || '';
      
      if (!email) return;
      
      this.authLoading = true;
      this.fullRender();
      
      try {
        if (this.authModalMode === 'magic-link') {
          const { error } = await authService.signInWithMagicLink(email);
          if (error) throw error;
          this.showToast('Check your email for the magic link!', 'success');
          this.authModalMode = null;
        } else if (this.authModalMode === 'login') {
          if (!password) {
            this.showToast('Password is required', 'error');
            this.authLoading = false;
            this.fullRender();
            return;
          }
          const { error } = await authService.signIn(email, password);
          if (error) throw error;
          this.showToast('Welcome back!', 'success');
          this.authModalMode = null;
        } else if (this.authModalMode === 'signup') {
          const { error } = await authService.signUp(email, password);
          if (error) throw error;
          this.showToast('Account created! Check your email to confirm.', 'success');
          this.authModalMode = null;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Authentication failed';
        this.showToast(message, 'error');
      } finally {
        this.authLoading = false;
        this.fullRender();
      }
    });

    // Switch between auth modes
    const switchSignup = document.getElementById('auth-switch-signup');
    switchSignup?.addEventListener('click', () => {
      this.authModalMode = 'signup';
      this.fullRender();
    });

    const switchLogin = document.getElementById('auth-switch-login');
    switchLogin?.addEventListener('click', () => {
      this.authModalMode = 'login';
      this.fullRender();
    });

    const switchMagic = document.getElementById('auth-switch-magic');
    switchMagic?.addEventListener('click', () => {
      this.authModalMode = 'magic-link';
      this.fullRender();
    });

    const switchPassword = document.getElementById('auth-switch-password');
    switchPassword?.addEventListener('click', () => {
      this.authModalMode = 'login';
      this.fullRender();
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
