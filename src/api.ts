import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ModelsResponse,
  GrokMessage
} from './types';
import { recordChatUsage, recordImageUsage } from './storage';

const API_BASE_URL = 'https://api.x.ai/v1';

class GrokApiClient {
  private apiKey: string | null = null;

  setApiKey(key: string | null): void {
    this.apiKey = key;
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error('API key not configured. Please set your Grok API key in settings.');
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const apiMessage = errorData.error?.message || '';
      
      // Handle specific error codes with user-friendly messages
      switch (response.status) {
        case 400:
          throw new Error(apiMessage || 'Bad request. Check your input and try again.');
        case 401:
          throw new Error('Invalid API key. Please check your key in Settings.');
        case 402:
          throw new Error('Insufficient credits. Please add funds at console.x.ai.');
        case 403:
          throw new Error('Access denied. Your API key may not have permission for this action.');
        case 404:
          throw new Error('Resource not found. The requested endpoint or model may not exist.');
        case 413:
          throw new Error('Request too large. Try reducing your message length.');
        case 422:
          throw new Error(apiMessage || 'Invalid request parameters.');
        case 429:
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        case 500:
        case 502:
        case 503:
          throw new Error('xAI servers are experiencing issues. Please try again later.');
        default:
          throw new Error(apiMessage || `Request failed (${response.status})`);
      }
    }

    return response.json();
  }

  async listModels(): Promise<ModelsResponse> {
    return this.request<ModelsResponse>('/models');
  }

  async chatCompletion(
    messages: GrokMessage[],
    model: string = 'grok-3',
    options: Partial<ChatCompletionRequest> = {}
  ): Promise<ChatCompletionResponse> {
    const body: ChatCompletionRequest = {
      model,
      messages,
      ...options,
    };

    const response = await this.request<ChatCompletionResponse>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    // Track usage
    if (response.usage) {
      recordChatUsage(
        model,
        response.usage.prompt_tokens,
        response.usage.completion_tokens,
        response.usage.total_tokens
      );
    }

    return response;
  }

  async generateImage(
    prompt: string,
    model: string = 'grok-imagine-image',
    options: Partial<ImageGenerationRequest> = {}
  ): Promise<ImageGenerationResponse> {
    const body: ImageGenerationRequest = {
      prompt,
      model,
      response_format: 'url',
      n: 1,
      ...options,
    };

    const response = await this.request<ImageGenerationResponse>('/images/generations', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    // Track usage - use actual returned image count
    recordImageUsage(model, response.data.length);

    return response;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.request('/api-key');
      return true;
    } catch {
      return false;
    }
  }
}

export const grokApi = new GrokApiClient();
