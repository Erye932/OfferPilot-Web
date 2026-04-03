// DeepSeek Provider 实现
import type { AIProvider, AITask, AIResponse, AIProviderConfig } from '../types';
import { AIProviderError } from '../types';

interface CircuitBreakerState {
  failures: number;
  lastFailTime: number;
  isOpen: boolean;
}

const circuitState: CircuitBreakerState = {
  failures: 0,
  lastFailTime: 0,
  isOpen: false,
};

export const deepseekProvider: AIProvider = {
  name: 'deepseek',

  async call(task: AITask, config?: AIProviderConfig): Promise<AIResponse> {
    const timeout = config?.timeout || parseInt(process.env.AI_TIMEOUT_MS || '120000', 10);
    const maxRetries = config?.maxRetries || parseInt(process.env.AI_RETRY_MAX || '2', 10);
    const circuitThreshold = config?.circuitBreakerThreshold || parseInt(process.env.AI_CIRCUIT_FAIL_THRESHOLD || '5', 10);
    const circuitResetMs = config?.circuitBreakerResetMs || parseInt(process.env.AI_CIRCUIT_OPEN_MS || '60000', 10);

    // Circuit breaker check
    if (circuitState.isOpen) {
      if (Date.now() - circuitState.lastFailTime > circuitResetMs) {
        circuitState.isOpen = false;
        circuitState.failures = 0;
      } else {
        throw new AIProviderError('Circuit breaker open', 'deepseek', false);
      }
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new AIProviderError('DEEPSEEK_API_KEY not configured', 'deepseek', false);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const messages: Array<{ role: string; content: string }> = [];
        if (task.systemPrompt) {
          messages.push({ role: 'system', content: task.systemPrompt });
        }
        messages.push({ role: 'user', content: task.prompt });

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages,
            temperature: task.temperature ?? 0.4,
            max_tokens: task.maxTokens ?? 4000,
            ...(task.requireJson ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`DeepSeek API error ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error('DeepSeek returned empty content');
        }

        // Reset circuit breaker on success
        circuitState.failures = 0;

        return {
          content,
          provider: 'deepseek',
          model: 'deepseek-chat',
          tokensUsed: data.usage?.total_tokens,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error('Request timeout');
        }

        // Don't retry on non-retryable errors
        if (attempt === maxRetries) {
          circuitState.failures++;
          circuitState.lastFailTime = Date.now();
          if (circuitState.failures >= circuitThreshold) {
            circuitState.isOpen = true;
          }
          break;
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw new AIProviderError(
      lastError?.message || 'Unknown error',
      'deepseek',
      true
    );
  },
};
