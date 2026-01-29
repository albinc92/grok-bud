import type { FavoritePost, AppState } from './types';

const STORAGE_KEY = 'grok-bud-state';

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
