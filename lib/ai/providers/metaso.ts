// Metaso Provider 实现
import type { AIProvider, AITask, AIResponse, AIProviderConfig } from '../types';
import { AIProviderError } from '../types';
import { logInfo, logWarn, logError } from '../../error-handler';

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

export const metasoProvider: AIProvider = {
  name: 'metaso',

  async call(task: AITask, config?: AIProviderConfig): Promise<AIResponse> {
    const timeout = config?.timeout || parseInt(process.env.AI_TIMEOUT_MS || '120000', 10);
    const maxRetries = config?.maxRetries || parseInt(process.env.AI_RETRY_MAX || '2', 10);
    const circuitThreshold = config?.circuitBreakerThreshold || parseInt(process.env.AI_CIRCUIT_FAIL_THRESHOLD || '5', 10);
    const circuitResetMs = config?.circuitBreakerResetMs || parseInt(process.env.AI_CIRCUIT_OPEN_MS || '60000', 10);

    // 断路器状态日志
    logInfo('MetasoProvider', '断路器状态检查', {
      isOpen: circuitState.isOpen,
      failures: circuitState.failures,
      threshold: circuitThreshold,
      lastFailTime: circuitState.lastFailTime,
      timeSinceLastFail: circuitState.lastFailTime ? Date.now() - circuitState.lastFailTime : 0,
      circuitResetMs,
    });

    // Circuit breaker check
    if (circuitState.isOpen) {
      if (Date.now() - circuitState.lastFailTime > circuitResetMs) {
        logInfo('MetasoProvider', '断路器自动关闭', {
          lastFailTime: circuitState.lastFailTime,
          resetMs: circuitResetMs,
          elapsed: Date.now() - circuitState.lastFailTime,
        });
        circuitState.isOpen = false;
        circuitState.failures = 0;
      } else {
        logWarn('MetasoProvider', '断路器打开，拒绝请求', {
          failures: circuitState.failures,
          lastFailTime: circuitState.lastFailTime,
          resetMs: circuitResetMs,
          remaining: circuitResetMs - (Date.now() - circuitState.lastFailTime),
        });
        throw new AIProviderError('Circuit breaker open', 'metaso', false);
      }
    }

    const apiKey = process.env.METASO_API_KEY?.trim();
    logInfo('MetasoProvider', 'API Key 检查', {
      exists: !!apiKey,
      length: apiKey?.length || 0,
      startsWith: apiKey ? apiKey.substring(0, 4) + '...' : 'none',
    });
    if (!apiKey) {
      logError('MetasoProvider', 'METASO_API_KEY 未配置');
      throw new AIProviderError('METASO_API_KEY not configured', 'metaso', false);
    }
    // API key 格式校验：非空且不含空白字符
    if (/\s/.test(apiKey)) {
      logError('MetasoProvider', 'METASO_API_KEY 包含空白字符', { length: apiKey.length });
      throw new AIProviderError('METASO_API_KEY contains invalid whitespace characters', 'metaso', false);
    }

    // 尝试多个可能的API基地址，并校验 URL 格式
    const rawBaseUrl = process.env.METASO_API_BASE_URL?.trim();
    logInfo('MetasoProvider', 'API Base URL 检查', {
      rawBaseUrl: rawBaseUrl || '未设置',
      hasRawBaseUrl: !!rawBaseUrl,
    });
    let baseUrls: string[];
    if (rawBaseUrl) {
      try {
        new URL(rawBaseUrl);
        baseUrls = [rawBaseUrl];
        logInfo('MetasoProvider', 'API Base URL 格式有效', { url: rawBaseUrl });
      } catch (urlError) {
        logError('MetasoProvider', 'API Base URL 格式无效', {
          url: rawBaseUrl,
          error: urlError instanceof Error ? urlError.message : String(urlError),
        });
        throw new AIProviderError(`METASO_API_BASE_URL is not a valid URL: ${rawBaseUrl}`, 'metaso', false);
      }
    } else {
      logInfo('MetasoProvider', '使用默认 API Base URLs', { defaults: ['https://api.metaso.cn', 'https://open.metaso.cn'] });
      baseUrls = ['https://api.metaso.cn', 'https://open.metaso.cn'];
    }

    let lastError: Error | null = null;

    logInfo('MetasoProvider', '开始请求尝试', {
      baseUrls,
      maxRetries,
      timeout,
    });

    // 遍历所有可能的API基地址
    for (let urlIndex = 0; urlIndex < baseUrls.length; urlIndex++) {
      const baseUrl = baseUrls[urlIndex];
      logInfo('MetasoProvider', '尝试 API 基地址', {
        urlIndex,
        baseUrl,
        urlIndexTotal: baseUrls.length,
      });

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        logInfo('MetasoProvider', '请求尝试', {
          urlIndex,
          baseUrl,
          attempt,
          maxRetries,
        });
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          // 构建查询文本（结合系统提示和用户提示）
          let queryText = task.prompt;
          if (task.systemPrompt) {
            queryText = `${task.systemPrompt}\n\n${task.prompt}`;
          }

          // 秘塔搜索推理API请求
          const response = await fetch(`${baseUrl}/v1/search`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              q: queryText,
              mode: 'deep', // deep: 深入分析模式，适合推理分析
              size: 10, // 返回结果数量
              includeSummary: true, // 包含摘要
              // 可选参数：simple（简洁）、deep（深入）、academic（学术）
              // temperature参数在搜索API中不支持，移除
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          logInfo('MetasoProvider', 'API 响应接收', {
            status: response.status,
            statusText: response.statusText,
            baseUrl,
            attempt,
          });

          if (!response.ok) {
            const errorText = await response.text();
            logError('MetasoProvider', 'API 响应错误', {
              status: response.status,
              statusText: response.statusText,
              baseUrl,
              attempt,
              errorTextPreview: errorText.substring(0, 200),
            });
            throw new Error(`Metaso API error (${baseUrl}): ${response.status}: ${errorText.substring(0, 200)}`);
          }

          const data = await response.json();

          // 解析秘塔API响应格式
          let content = '';

          // 尝试多种可能的响应格式
          if (data.answer) {
            // 问答API返回的答案
            content = data.answer;
          } else if (data.content) {
            // 通用内容字段
            content = data.content;
          } else if (data.result && typeof data.result === 'string') {
            // 结果字段
            content = data.result;
          } else if (data.text) {
            // 文本字段
            content = data.text;
          } else if (data.choices && data.choices[0] && data.choices[0].message) {
            // OpenAI兼容格式
            content = data.choices[0].message.content;
          } else if (Array.isArray(data.results) && data.results.length > 0) {
            // 搜索结果列表，取第一个结果的摘要
            const firstResult = data.results[0];
            content = firstResult.snippet || firstResult.summary || firstResult.description || JSON.stringify(firstResult);
          } else if (Array.isArray(data.webpages) && data.webpages.length > 0) {
            // 秘塔搜索API格式：webpages数组
            const firstPage = data.webpages[0];
            content = firstPage.snippet || firstPage.summary || firstPage.description || JSON.stringify(firstPage);
          } else {
            // 尝试提取任何文本内容
            content = JSON.stringify(data).substring(0, 1000);
          }

          logInfo('MetasoProvider', '响应解析成功', {
            contentLength: content.length,
            contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
            model: 'metaso-search',
          });

          if (!content || content.trim() === '') {
            throw new Error('Metaso returned empty content');
          }

          // Reset circuit breaker on success
          logInfo('MetasoProvider', '断路器重置（成功）', {
            previousFailures: circuitState.failures,
            newFailures: 0,
          });
          circuitState.failures = 0;

          return {
            content,
            provider: 'metaso',
            model: 'metaso-search',
            tokensUsed: data.tokens_used || data.usage?.total_tokens,
          };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (error instanceof Error && error.name === 'AbortError') {
            lastError = new Error(`Request timeout (${baseUrl})`);
          }

          // 如果这是当前基地址的最后一次尝试，并且还有下一个基地址，则继续
          if (attempt === maxRetries && urlIndex < baseUrls.length - 1) {
            // 切换到下一个基地址
            break;
          }

          // 如果这是最后一个基地址的最后一次尝试，则记录失败
          if (attempt === maxRetries && urlIndex === baseUrls.length - 1) {
            const newFailures = circuitState.failures + 1;
            logWarn('MetasoProvider', '请求最终失败，更新断路器', {
              previousFailures: circuitState.failures,
              newFailures,
              threshold: circuitThreshold,
              willOpen: newFailures >= circuitThreshold,
            });
            circuitState.failures = newFailures;
            circuitState.lastFailTime = Date.now();
            if (circuitState.failures >= circuitThreshold) {
              logError('MetasoProvider', '断路器打开', {
                failures: circuitState.failures,
                threshold: circuitThreshold,
                lastFailTime: circuitState.lastFailTime,
              });
              circuitState.isOpen = true;
            }
            break;
          }

          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    logError('MetasoProvider', '所有尝试均失败', {
      lastError: lastError?.message || 'Unknown error',
      baseUrlsAttempted: baseUrls.length,
      totalAttempts: baseUrls.length * (maxRetries + 1),
      circuitState: {
        isOpen: circuitState.isOpen,
        failures: circuitState.failures,
        lastFailTime: circuitState.lastFailTime,
      },
    });
    throw new AIProviderError(
      lastError?.message || 'Unknown error',
      'metaso',
      true
    );
  },
};
