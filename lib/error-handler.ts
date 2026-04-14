/**
 * 统一错误处理与日志收敛
 * 目标：避免敏感信息泄露，统一错误响应结构
 *
 * 扩展点说明：
 * 1. 监控集成：在 logError/logWarn 中发送事件到监控系统（如 Sentry, DataDog）
 * 2. 性能指标：记录错误发生频率、响应时间等指标
 * 3. 报警规则：基于错误类型和频率设置报警阈值
 * 4. 用户反馈：收集用户遇到的错误类型，用于产品改进
 */

export type ErrorCode =
  | 'RATE_LIMIT_EXCEEDED'
  | 'VALIDATION_ERROR'
  | 'PDF_PARSE_ERROR'
  | 'AI_SERVICE_UNAVAILABLE'
  | 'SERVER_CONFIG_ERROR'
  | 'INSUFFICIENT_INPUT'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND';

export interface ApiErrorResponse {
  error: string;           // 用户可读的错误消息
  code?: ErrorCode;        // 机器可读的错误代码
  details?: string;        // 开发/调试详情（仅开发环境返回）
  retryAfter?: number;     // 重试等待时间（秒）
  parseStatus?: string;    // PDF解析专用状态
  [key: string]: unknown;  // 允许扩展字段（如PDF解析的uploadedFileId）
}

/**
 * 创建统一错误响应
 */
export function createErrorResponse(
  message: string,
  options: {
    code?: ErrorCode;
    status?: number;
    details?: string;
    retryAfter?: number;
    parseStatus?: string;
    [key: string]: unknown;
  } = {}
): { response: ApiErrorResponse; status: number } {
  const {
    code,
    status = 500,
    details,
    retryAfter,
    parseStatus,
    ...extra
  } = options;

  const isDevelopment = process.env.NODE_ENV === 'development';

  const response: ApiErrorResponse = {
    error: message,
    ...(code && { code }),
    ...(isDevelopment && details && { details }),
    ...(retryAfter && { retryAfter }),
    ...(parseStatus && { parseStatus }),
    ...extra,
  };

  return { response, status };
}

/**
 * 安全日志记录 - 避免泄露敏感信息
 */
export function logError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const safeExtra = extra ? sanitizeExtraData(extra) : {};

  console.error(`[${context}]`, {
    name: errorObj.name,
    message: errorObj.message,
    stack: process.env.NODE_ENV === 'development' ? errorObj.stack : undefined,
    ...safeExtra,
  });
}

/**
 * 安全日志记录 - 警告级别
 */
export function logWarn(
  context: string,
  message: string,
  extra?: Record<string, unknown>
): void {
  const safeExtra = extra ? sanitizeExtraData(extra) : {};
  console.warn(`[${context}] ${message}`, safeExtra);
}

/**
 * 安全日志记录 - 信息级别
 */
export function logInfo(
  context: string,
  message: string,
  extra?: Record<string, unknown>
): void {
  const safeExtra = extra ? sanitizeExtraData(extra) : {};
  console.log(`[${context}] ${message}`, safeExtra);
}

/**
 * 清理额外数据中的敏感信息
 */
function sanitizeExtraData(extra: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === 'string') {
      // 屏蔽可能包含简历、JD等敏感信息的字段
      if (key.includes('resume') || key.includes('jd') || key.includes('text')) {
        sanitized[key] = `[SANITIZED length=${value.length}]`;
      } else if (value.length > 200) {
        sanitized[key] = `[TRUNCATED length=${value.length}]`;
      } else {
        sanitized[key] = value;
      }
    } else if (Array.isArray(value)) {
      sanitized[key] = `[Array length=${value.length}]`;
    } else if (value && typeof value === 'object') {
      sanitized[key] = `[Object keys=${Object.keys(value).join(',')}]`;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * 常见的错误工厂函数
 */
export const Errors = {
  rateLimitExceeded: (retryAfter?: number) =>
    createErrorResponse('免费用户每日额度已用完，请明天再试', {
      code: 'RATE_LIMIT_EXCEEDED',
      status: 429,
      retryAfter,
    }),

  validationError: (message: string) =>
    createErrorResponse(message, {
      code: 'VALIDATION_ERROR',
      status: 400,
    }),

  pdfParseError: (message: string, code: string, extra?: Record<string, unknown>) =>
    createErrorResponse(message, {
      code: 'PDF_PARSE_ERROR',
      status: code === 'PDF_TOO_LARGE' || code === 'PDF_INVALID_TYPE' ? 400 : 500,
      parseStatus: 'failed',
      ...extra,
    }),

  aiServiceUnavailable: (details?: string) =>
    createErrorResponse('AI服务暂时不可用，请稍后重试', {
      code: 'AI_SERVICE_UNAVAILABLE',
      status: 502,
      details,
    }),

  serverConfigError: () =>
    createErrorResponse('服务器配置错误', {
      code: 'SERVER_CONFIG_ERROR',
      status: 500,
    }),

  insufficientInput: () =>
    createErrorResponse('输入信息不足，无法形成诊断', {
      code: 'INSUFFICIENT_INPUT',
      status: 400,
    }),
  notFoundError: (message: string) => createErrorResponse(message, {
    code: "NOT_FOUND",
    status: 404,
  }),


  internalError: (details?: string) =>
    createErrorResponse('服务器内部错误', {
      code: 'INTERNAL_ERROR',
      status: 500,
      details,
    }),
};