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
}

export interface GeneratedImage {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

export interface ImageGenerationResponse {
  data: GeneratedImage[];
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
  currentView: 'gallery' | 'chat' | 'image-gen' | 'settings';
  apiKey: string | null;
  selectedModel: string;
  imageCount: number;
  isLoading: boolean;
  usage: UsageStats;
  currentChatId: string | null; // null = new unsaved chat
}
