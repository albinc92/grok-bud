import { supabase } from './supabase';
import { authService } from './auth';
import type { FavoritePost, UsageStats, PostVideo, GrokMessage } from './types';
import * as localStorage from './storage';

/**
 * Cloud Storage Module
 * Syncs app data with Supabase while keeping LocalStorage as a fallback/cache
 */

// ============================================
// POSTS / FAVORITES
// ============================================

export async function syncFavoritesToCloud(): Promise<void> {
  const user = authService.getUser();
  if (!user) return;

  const localFavorites = localStorage.getFavorites();
  
  for (const post of localFavorites) {
    await supabase.from('posts').upsert({
      id: post.id,
      user_id: user.id,
      type: post.type,
      prompt: post.prompt,
      model: post.model,
      image_url: post.imageUrl || null,
      response: post.response || null,
      videos: post.videos || [],
      created_at: new Date(post.createdAt).toISOString(),
    }, { onConflict: 'id' });
  }
}

export async function fetchFavoritesFromCloud(): Promise<FavoritePost[]> {
  const user = authService.getUser();
  if (!user) return localStorage.getFavorites();

  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[CloudStorage] Failed to fetch posts:', error);
    return localStorage.getFavorites();
  }

  return data.map(row => ({
    id: row.id,
    type: row.type as 'image' | 'chat',
    prompt: row.prompt,
    model: row.model,
    imageUrl: row.image_url || undefined,
    response: row.response || undefined,
    videos: (row.videos as PostVideo[]) || [],
    createdAt: new Date(row.created_at).getTime(),
    tags: [],
  }));
}

export async function addFavoriteToCloud(post: Omit<FavoritePost, 'id' | 'createdAt'>): Promise<FavoritePost> {
  // Always save to local first
  const localPost = localStorage.addFavorite(post);

  const user = authService.getUser();
  if (!user) return localPost;

  const { error } = await supabase.from('posts').insert({
    id: localPost.id,
    user_id: user.id,
    type: localPost.type,
    prompt: localPost.prompt,
    model: localPost.model,
    image_url: localPost.imageUrl || null,
    response: localPost.response || null,
    videos: localPost.videos || [],
    created_at: new Date(localPost.createdAt).toISOString(),
  });

  if (error) {
    console.error('[CloudStorage] Failed to add post:', error);
  }

  return localPost;
}

export async function removeFavoriteFromCloud(id: string): Promise<void> {
  // Always remove locally first
  localStorage.removeFavorite(id);

  const user = authService.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[CloudStorage] Failed to remove post:', error);
  }
}

export async function updateFavoriteInCloud(id: string, updates: Partial<FavoritePost>): Promise<void> {
  // Always update locally first
  localStorage.updateFavorite(id, updates);

  const user = authService.getUser();
  if (!user) return;

  const cloudUpdates: Record<string, unknown> = {};
  if (updates.prompt !== undefined) cloudUpdates.prompt = updates.prompt;
  if (updates.model !== undefined) cloudUpdates.model = updates.model;
  if (updates.imageUrl !== undefined) cloudUpdates.image_url = updates.imageUrl;
  if (updates.response !== undefined) cloudUpdates.response = updates.response;
  if (updates.videos !== undefined) cloudUpdates.videos = updates.videos;

  if (Object.keys(cloudUpdates).length > 0) {
    const { error } = await supabase
      .from('posts')
      .update(cloudUpdates)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('[CloudStorage] Failed to update post:', error);
    }
  }
}

// ============================================
// POST VIDEOS
// ============================================

export async function addVideoToPostCloud(postId: string, video: Omit<PostVideo, 'id' | 'createdAt' | 'starred'>): Promise<PostVideo> {
  const newVideo = localStorage.addVideoToPost(postId, video);

  const user = authService.getUser();
  if (!user) return newVideo;

  // Fetch current videos and update
  const post = localStorage.getFavorites().find(f => f.id === postId);
  if (post) {
    await updateFavoriteInCloud(postId, { videos: post.videos });
  }

  return newVideo;
}

export async function removeVideoFromPostCloud(postId: string, videoId: string): Promise<void> {
  localStorage.removeVideoFromPost(postId, videoId);

  const user = authService.getUser();
  if (!user) return;

  const post = localStorage.getFavorites().find(f => f.id === postId);
  if (post) {
    await updateFavoriteInCloud(postId, { videos: post.videos });
  }
}

export async function toggleVideoStarCloud(postId: string, videoId: string): Promise<void> {
  localStorage.toggleVideoStar(postId, videoId);

  const user = authService.getUser();
  if (!user) return;

  const post = localStorage.getFavorites().find(f => f.id === postId);
  if (post) {
    await updateFavoriteInCloud(postId, { videos: post.videos });
  }
}

// ============================================
// SETTINGS
// ============================================

export async function syncSettingsToCloud(): Promise<void> {
  const user = authService.getUser();
  if (!user) return;

  const apiKey = localStorage.getApiKey();
  const imageModel = localStorage.getSelectedModel();
  
  await supabase.from('settings').upsert({
    user_id: user.id,
    api_key_encrypted: apiKey, // TODO: Encrypt this client-side
    image_model: imageModel,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

export async function fetchSettingsFromCloud(): Promise<void> {
  const user = authService.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    console.error('[CloudStorage] Failed to fetch settings:', error);
    return;
  }

  // Apply cloud settings to local storage
  if (data.api_key_encrypted) {
    localStorage.setApiKey(data.api_key_encrypted);
  }
  if (data.image_model) {
    localStorage.setSelectedModel(data.image_model);
  }
}

// ============================================
// USAGE STATS
// ============================================

export async function syncUsageToCloud(): Promise<void> {
  const user = authService.getUser();
  if (!user) return;

  const stats = localStorage.getUsageStats();

  await supabase.from('usage_stats').upsert({
    user_id: user.id,
    chat_tokens: stats.chatTokens,
    image_count: stats.imageCount || 0,
    video_count: 0, // TODO: Track this
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

export async function fetchUsageFromCloud(): Promise<UsageStats | null> {
  const user = authService.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('usage_stats')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    totalTokens: data.chat_tokens,
    totalCost: 0, // Calculated locally
    chatTokens: data.chat_tokens,
    imageCount: data.image_count,
    requestCount: 0,
    history: [],
  };
}

// ============================================
// CHATS
// ============================================

export async function createChatInCloud(messages: GrokMessage[], model: string, title?: string): Promise<FavoritePost> {
  const chat = localStorage.createChat(messages, model, title);

  const user = authService.getUser();
  if (!user) return chat;

  await supabase.from('posts').insert({
    id: chat.id,
    user_id: user.id,
    type: 'chat',
    prompt: chat.prompt,
    model: chat.model,
    response: chat.response || null,
    created_at: new Date(chat.createdAt).toISOString(),
  });

  return chat;
}

export async function updateChatInCloud(id: string, messages: GrokMessage[], model: string): Promise<void> {
  localStorage.updateChat(id, messages, model);

  const chat = localStorage.getChat(id);
  if (!chat) return;

  const user = authService.getUser();
  if (!user) return;

  await supabase.from('posts').update({
    prompt: chat.prompt,
    model: chat.model,
    response: chat.response || null,
  }).eq('id', id).eq('user_id', user.id);
}

// ============================================
// FULL SYNC
// ============================================

export async function performFullSync(): Promise<void> {
  const user = authService.getUser();
  if (!user) {
    console.log('[CloudStorage] Not authenticated, skipping sync');
    return;
  }

  console.log('[CloudStorage] Starting full sync...');

  try {
    // Fetch from cloud and merge with local
    const cloudPosts = await fetchFavoritesFromCloud();
    const localPosts = localStorage.getFavorites();

    // Merge strategy: cloud wins for existing, local wins for new
    const merged = new Map<string, FavoritePost>();
    
    // Add cloud posts first
    for (const post of cloudPosts) {
      merged.set(post.id, post);
    }

    // Add local-only posts
    for (const post of localPosts) {
      if (!merged.has(post.id)) {
        merged.set(post.id, post);
        // Upload to cloud
        await addFavoriteToCloud(post);
      }
    }

    // Save merged result to local
    const mergedArray = Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
    localStorage.saveState({ favorites: mergedArray });

    // Sync settings
    await fetchSettingsFromCloud();

    console.log('[CloudStorage] Sync complete');
  } catch (error) {
    console.error('[CloudStorage] Sync failed:', error);
  }
}
