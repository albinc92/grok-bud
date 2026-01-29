import type { FavoritePost, AppState, UsageRecord, UsageStats } from './types';

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
