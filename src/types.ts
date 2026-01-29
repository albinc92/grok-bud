// Grok API Types

export interface GrokMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: GrokMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: string;
    content: string;
    refusal: string | null;
  };
  finish_reason: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ImageGenerationRequest {
  prompt: string;
  model: string;
  response_format?: 'url' | 'b64_json';
  n?: number;
  aspect_ratio?: string; // e.g., "1:1", "16:9", "9:16", "4:3", "3:4"
}

export interface GeneratedImage {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

export interface ImageGenerationResponse {
  data: GeneratedImage[];
}

// Video Generation Types
export interface VideoGenerationRequest {
  prompt: string;
  model: string;
  image?: { url: string }; // Optional source image for image-to-video
  duration?: number; // Duration in seconds (e.g., 6)
}

export interface VideoGenerationResponse {
  request_id: string;
}

export interface VideoStatusResponse {
  status?: 'pending' | 'done'; // Only present when pending
  video?: {
    url: string;
    duration?: number;
  };
  model?: string;
}

// Background video job tracking
export interface VideoJob {
  id: string; // request_id from API
  postId: string; // The post this video is for
  prompt: string;
  duration: number;
  status: 'pending' | 'done' | 'error';
  videoUrl?: string;
  errorMessage?: string;
  startedAt: number;
  completedAt?: number;
}

export interface GrokModel {
  id: string;
  created: number;
  object: string;
  owned_by: string;
}

export interface ModelsResponse {
  data: GrokModel[];
  object: string;
}

// App-specific types

export interface FavoritePost {
  id: string;
  type: 'chat' | 'image';
  title?: string; // Display title for chats
  prompt: string;
  response: string;
  messages?: GrokMessage[]; // Full chat history for chat type
  imageUrl?: string;
  model: string;
  createdAt: number;
  updatedAt?: number; // Track last update for chats
  tags: string[];
}

export interface UsageRecord {
  timestamp: number;
  endpoint: 'chat' | 'image';
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number; // in USD
  imageCount?: number; // for image generation
}

export interface UsageStats {
  totalTokens: number;
  totalCost: number;
  chatTokens: number;
  imageCount: number;
  requestCount: number;
  history: UsageRecord[];
}

export interface ModelPricing {
  id: string;
  promptTextTokenPrice: number; // USD cents per 100M tokens
  completionTextTokenPrice: number;
  promptImageTokenPrice: number;
  generatedImageTokenPrice: number;
}

export interface AppState {
  favorites: FavoritePost[];
  currentView: 'gallery' | 'chat' | 'image-gen' | 'settings' | 'post';
  apiKey: string | null;
  selectedModel: string;
  imageCount: number;
  aspectRatio: string; // e.g., "1:1", "16:9", "9:16", "4:3", "3:4"
  galleryColumns: number;
  sidebarCollapsed: boolean;
  isLoading: boolean;
  usage: UsageStats;
  currentChatId: string | null; // null = new unsaved chat
  currentPostId: string | null; // For viewing individual posts
  videoJobs: VideoJob[]; // Background video generation jobs
}
