// AI Router — routes a task to the appropriate provider by task type.
//
// Provider responsibilities (hard-coded, not env-driven):
//   - DeepSeek: baseline, verify, explain, synthesize, deep_synthesize, hr_review, rewrite_review
//     (every task whose final output is JSON goes through DeepSeek)
//   - Metaso:   research only (intermediate, non-JSON output)
//
// Fallback policy:
//   - research          → may fall back to DeepSeek
//   - deep_synthesize   → no fallback
//   - everything else   → no fallback (we never switch to Metaso)
import type { AITask, AIResponse, AIProviderConfig } from './types';
import { AIProviderError } from './types';
import { deepseekProvider } from './providers/deepseek';
import { metasoProvider } from './providers/metaso';
import { logError, logInfo } from '../error-handler';

// Task type → default provider mapping.
const PROVIDER_MAP: Record<AITask['type'], typeof deepseekProvider | typeof metasoProvider> = {
  research: metasoProvider,
  baseline: deepseekProvider,
  verify: deepseekProvider,
  explain: deepseekProvider,
  synthesize: deepseekProvider,
  deep_synthesize: deepseekProvider,
  hr_review: deepseekProvider,
  rewrite_review: deepseekProvider,
};

class AIRouter {
  async route(task: AITask, config?: AIProviderConfig): Promise<AIResponse> {
    const primaryProvider = this.selectPrimaryProvider(task.type);
    const fallbackProvider = this.selectFallbackProvider(task.type);

    // Structured log: routing decision.
    logInfo('AIRouter', 'Routing task', {
      taskType: task.type,
      primaryProvider: primaryProvider.name,
      fallbackProvider: fallbackProvider?.name || 'none',
      fallbackAllowed: !!fallbackProvider,
    });

    try {
      logInfo('AIRouter', `Routing task ${task.type} to ${primaryProvider.name}`);
      const response = await primaryProvider.call(task, config);
      logInfo('AIRouter', 'Primary provider call succeeded', {
        taskType: task.type,
        provider: response.provider,
        model: response.model,
        contentLength: response.content.length,
      });
      // Enhance response with metadata
      const enhancedResponse = {
        ...response,
        providerRequested: primaryProvider.name,
        providerActual: response.provider,
        fallbackUsed: false,
        taskType: task.type,
      };
      return enhancedResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isAIProviderError = error instanceof AIProviderError;
      const isRetryable = isAIProviderError && error.isRetryable;

      logError('AIRouter', `Primary provider ${primaryProvider.name} failed`, {
        error: errorMessage,
        provider: primaryProvider.name,
        taskType: task.type,
        isAIProviderError,
        isRetryable,
        fallbackAvailable: !!fallbackProvider && isRetryable,
      });

      if (fallbackProvider && error instanceof AIProviderError && error.isRetryable) {
        logInfo('AIRouter', `Falling back to ${fallbackProvider.name}`, {
          primaryProvider: primaryProvider.name,
          fallbackProvider: fallbackProvider.name,
          taskType: task.type,
          errorReason: error.message,
        });
        try {
          const fallbackResponse = await fallbackProvider.call(task, config);
          logInfo('AIRouter', 'Fallback call succeeded', {
            taskType: task.type,
            finalProvider: fallbackProvider.name,
            fallbackResponseProvider: fallbackResponse.provider,
          });
          // Enhance fallback response with metadata
          const enhancedFallbackResponse = {
            ...fallbackResponse,
            providerRequested: primaryProvider.name,
            providerActual: fallbackResponse.provider,
            fallbackUsed: true,
            fallbackFrom: primaryProvider.name,
            fallbackTo: fallbackProvider.name,
            fallbackReason: error.message,
            taskType: task.type,
          };
          return enhancedFallbackResponse;
        } catch (fallbackError) {
          logError('AIRouter', `Fallback provider ${fallbackProvider.name} failed`, {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            taskType: task.type,
            primaryProvider: primaryProvider.name,
          });
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  private selectPrimaryProvider(taskType: AITask['type']) {
    return PROVIDER_MAP[taskType] ?? deepseekProvider;
  }

  private selectFallbackProvider(taskType: AITask['type']): typeof deepseekProvider | null {
    // research is the only task allowed to fall back to DeepSeek.
    if (taskType === 'research') {
      return deepseekProvider;
    }

    // All other tasks (including deep_synthesize) have no fallback.
    return null;
  }
}

export const aiRouter = new AIRouter();
