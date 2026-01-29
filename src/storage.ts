import type { FavoritePost, AppState, UsageRecord, UsageStats, VideoJob } from './types';

const STORAGE_KEY = 'grok-bud-state';

// Chat model pricing in USD cents per 100 million tokens (from API docs)
const CHAT_MODEL_PRICING: Record<string, { prompt: number; completion: number }> = {
  'grok-4': { prompt: 20000, completion: 100000 },
  'grok-3': { prompt: 30000, completion: 150000 },
  'grok-3-mini': { prompt: 3000, completion: 5000 },
};

// Image model pricing - flat rate per image in USD (from API docs)
const IMAGE_PRICING: Record<string, number> = {
  'grok-imagine-image': 0.07, // $0.07 per image
};

export function loadState(): Partial<AppState> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load state from localStorage:', error);
  }
  return {};
}

export function saveState(state: Partial<AppState>): void {
  try {
    const current = loadState();
    const merged = { ...current, ...state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (error) {
    console.error('Failed to save state to localStorage:', error);
  }
}

export function getFavorites(): FavoritePost[] {
  const state = loadState();
  return state.favorites || [];
}

export function addFavorite(post: Omit<FavoritePost, 'id' | 'createdAt'>): FavoritePost {
  const favorites = getFavorites();
  const newPost: FavoritePost = {
    ...post,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  favorites.unshift(newPost);
  saveState({ favorites });
  return newPost;
}

export function removeFavorite(id: string): void {
  const favorites = getFavorites().filter(f => f.id !== id);
  saveState({ favorites });
}

export function updateFavorite(id: string, updates: Partial<FavoritePost>): void {
  const favorites = getFavorites().map(f => 
    f.id === id ? { ...f, ...updates } : f
  );
  saveState({ favorites });
}

export function getApiKey(): string | null {
  const state = loadState();
  return state.apiKey || null;
}

export function setApiKey(apiKey: string | null): void {
  saveState({ apiKey });
}

export function getSelectedModel(): string {
  const state = loadState();
  return state.selectedModel || 'grok-3';
}

export function setSelectedModel(model: string): void {
  saveState({ selectedModel: model });
}

export function getImageCount(): number {
  const state = loadState();
  return state.imageCount || 1;
}

export function setImageCount(count: number): void {
  saveState({ imageCount: Math.min(4, Math.max(1, count)) });
}

export function getAspectRatio(): string {
  const state = loadState();
  return state.aspectRatio || '1:1';
}

export function setAspectRatio(ratio: string): void {
  const validRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
  if (validRatios.includes(ratio)) {
    saveState({ aspectRatio: ratio });
  }
}

export function getGalleryColumns(): number {
  const state = loadState();
  return state.galleryColumns || 3;
}

export function setGalleryColumns(columns: number): void {
  saveState({ galleryColumns: Math.min(6, Math.max(1, columns)) });
}

export function getSidebarCollapsed(): boolean {
  const state = loadState();
  return state.sidebarCollapsed || false;
}

export function setSidebarCollapsed(collapsed: boolean): void {
  saveState({ sidebarCollapsed: collapsed });
}

// Image generation state cache (persists across HMR)

export interface ImageGenCache {
  prompt: string;
  results: Array<{ url: string; revised_prompt?: string }>;
  savedUrls: string[];
}

export function getImageGenCache(): ImageGenCache | null {
  try {
    const cached = localStorage.getItem('grok-bud-image-gen-cache');
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

export function setImageGenCache(cache: ImageGenCache): void {
  try {
    localStorage.setItem('grok-bud-image-gen-cache', JSON.stringify(cache));
  } catch {
    // Ignore storage errors
  }
}

export function clearImageGenCache(): void {
  localStorage.removeItem('grok-bud-image-gen-cache');
}

// Current chat tracking

export function getCurrentChatId(): string | null {
  const state = loadState();
  return state.currentChatId || null;
}

export function setCurrentChatId(chatId: string | null): void {
  saveState({ currentChatId: chatId });
}

export function getSavedChats(): FavoritePost[] {
  return getFavorites().filter(f => f.type === 'chat');
}

export function getChat(id: string): FavoritePost | undefined {
  return getFavorites().find(f => f.id === id && f.type === 'chat');
}

export function updateChat(id: string, messages: import('./types').GrokMessage[], model: string): void {
  const chat = getChat(id);
  if (chat) {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
    
    updateFavorite(id, {
      messages,
      model,
      prompt: lastUserMsg?.content || chat.prompt,
      response: lastAssistantMsg?.content || chat.response,
      updatedAt: Date.now(),
    });
  }
}

export function createChat(messages: import('./types').GrokMessage[], model: string, title?: string): FavoritePost {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
  
  return addFavorite({
    type: 'chat',
    title: title || lastUserMsg?.content.slice(0, 50) || 'New Chat',
    prompt: lastUserMsg?.content || '',
    response: lastAssistantMsg?.content || '',
    messages: [...messages],
    model,
    tags: [],
  });
}

// Usage tracking functions

export function getUsageStats(): UsageStats {
  const state = loadState();
  return state.usage || {
    totalTokens: 0,
    totalCost: 0,
    chatTokens: 0,
    imageCount: 0,
    requestCount: 0,
    history: [],
  };
}

export function calculateChatCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = CHAT_MODEL_PRICING[model] || CHAT_MODEL_PRICING['grok-3'];
  // Convert from cents per 100M tokens to dollars
  const promptCost = (promptTokens / 100_000_000) * pricing.prompt / 100;
  const completionCost = (completionTokens / 100_000_000) * pricing.completion / 100;
  return promptCost + completionCost;
}

export function calculateImageCost(model: string, imageCount: number): number {
  const pricePerImage = IMAGE_PRICING[model] || IMAGE_PRICING['grok-imagine-image'];
  return pricePerImage * imageCount;
}

export function recordChatUsage(
  model: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number
): void {
  const stats = getUsageStats();
  const estimatedCost = calculateChatCost(model, promptTokens, completionTokens);

  const record: UsageRecord = {
    timestamp: Date.now(),
    endpoint: 'chat',
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCost,
  };

  stats.totalTokens += totalTokens;
  stats.totalCost += estimatedCost;
  stats.requestCount += 1;
  stats.chatTokens += totalTokens;

  // Keep last 100 records
  stats.history = [record, ...stats.history].slice(0, 100);
  saveState({ usage: stats });
}

export function recordImageUsage(model: string, imageCount: number): void {
  const stats = getUsageStats();
  const estimatedCost = calculateImageCost(model, imageCount);

  const record: UsageRecord = {
    timestamp: Date.now(),
    endpoint: 'image',
    model,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost,
    imageCount,
  };

  stats.totalCost += estimatedCost;
  stats.requestCount += 1;
  stats.imageCount = (stats.imageCount || 0) + imageCount;

  // Keep last 100 records
  stats.history = [record, ...stats.history].slice(0, 100);
  saveState({ usage: stats });
}

export function resetUsageStats(): void {
  saveState({
    usage: {
      totalTokens: 0,
      totalCost: 0,
      chatTokens: 0,
      imageCount: 0,
      requestCount: 0,
      history: [],
    },
  });
}

// ============================================
// VIDEO JOBS
// ============================================

export function getVideoJobs(): VideoJob[] {
  const state = loadState();
  return state.videoJobs || [];
}

export function getVideoJobForPost(postId: string): VideoJob | undefined {
  return getVideoJobs().find(job => job.postId === postId);
}

export function getPendingVideoJobs(): VideoJob[] {
  return getVideoJobs().filter(job => job.status === 'pending');
}

export function addVideoJob(job: VideoJob): void {
  const jobs = getVideoJobs();
  // Remove any existing job for the same post
  const filtered = jobs.filter(j => j.postId !== job.postId);
  filtered.unshift(job);
  // Keep only last 20 jobs
  saveState({ videoJobs: filtered.slice(0, 20) });
}

export function updateVideoJob(id: string, updates: Partial<VideoJob>): void {
  const jobs = getVideoJobs().map(job =>
    job.id === id ? { ...job, ...updates } : job
  );
  saveState({ videoJobs: jobs });
}

export function removeVideoJob(id: string): void {
  const jobs = getVideoJobs().filter(job => job.id !== id);
  saveState({ videoJobs: jobs });
}
