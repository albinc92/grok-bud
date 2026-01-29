import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ModelsResponse,
  GrokMessage
} from './types';
import { recordUsage } from './storage';

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
      throw new Error(
        errorData.error?.message || `API request failed with status ${response.status}`
      );
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
      recordUsage(
        'chat',
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

    // Track usage for image generation (estimate tokens based on typical usage)
    const estimatedTokens = 1000 * (options.n || 1); // Rough estimate per image
    recordUsage('image', model, estimatedTokens, 0, estimatedTokens);

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
