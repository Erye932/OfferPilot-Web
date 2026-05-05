// AI Provider 抽象层类型定义

export type AITaskType =
  | 'baseline'
  | 'hr_review'
  | 'rewrite_review'
  | 'verify'
  | 'explain'
  | 'synthesize'
  | 'research'        // Metaso only: deep research memo (intermediate, non-JSON)
  | 'deep_synthesize'; // DeepSeek only: final deep diagnosis JSON output

export interface AITask {
  type: AITaskType;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  requireJson?: boolean;
}

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
  tokensUsed?: number;
  // Extended metadata for fallback tracking
  providerRequested?: string;
  providerActual?: string;
  fallbackUsed?: boolean;
  fallbackFrom?: string;
  fallbackTo?: string;
  fallbackReason?: string;
  taskType?: string;
}

export interface AIProviderConfig {
  timeout?: number;
  maxRetries?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
}

export interface AIProvider {
  name: string;
  call(task: AITask, config?: AIProviderConfig): Promise<AIResponse>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public isRetryable: boolean = true
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}
