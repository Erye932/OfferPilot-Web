// AI Router - 根据任务类型路由到合适的 provider
//
// Provider 分工（固定，不依赖环境变量）：
//   - DeepSeek：baseline、verify、explain、synthesize、deep_synthesize、hr_review、rewrite_review
//     所有最终 JSON 输出任务统一走 DeepSeek
//   - Metaso：仅 research（中间产物，非 JSON）
//   - research 允许 fallback 到 DeepSeek
//   - deep_synthesize 不允许 fallback
//   - 其余任务 fallback 为 null（不切换到 Metaso）
import type { AITask, AIResponse, AIProviderConfig } from './types';
import { AIProviderError } from './types';
import { deepseekProvider } from './providers/deepseek';
import { metasoProvider } from './providers/metaso';
import { logError, logInfo } from '../error-handler';

// 任务类型 -> 默认 provider 映射
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

// 允许 fallback 的任务类型（仅 research）
const FALLBACK_TASKS: AITask['type'][] = ['research'];

class AIRouter {
  async route(task: AITask, config?: AIProviderConfig): Promise<AIResponse> {
    const primaryProvider = this.selectPrimaryProvider(task.type);
    const fallbackProvider = this.selectFallbackProvider(task.type);

    // 结构化日志：任务路由决策
    logInfo('AIRouter', '任务路由开始', {
      taskType: task.type,
      primaryProvider: primaryProvider.name,
      fallbackProvider: fallbackProvider?.name || 'none',
      fallbackAllowed: !!fallbackProvider,
    });

    try {
      logInfo('AIRouter', `Routing task ${task.type} to ${primaryProvider.name}`);
      const response = await primaryProvider.call(task, config);
      logInfo('AIRouter', 'Primary provider 调用成功', {
        taskType: task.type,
        provider: response.provider,
        model: response.model,
        contentLength: response.content.length,
      });
      return response;
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
          logInfo('AIRouter', 'Fallback 成功', {
            taskType: task.type,
            finalProvider: fallbackProvider.name,
            fallbackResponseProvider: fallbackResponse.provider,
          });
          return fallbackResponse;
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
    // 仅 research 允许 fallback 到 DeepSeek
    if (taskType === 'research') {
      return deepseekProvider;
    }

    // 其余任务（含 deep_synthesize）不允许 fallback
    return null;
  }
}

export const aiRouter = new AIRouter();
