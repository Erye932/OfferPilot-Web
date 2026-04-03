import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { AIExplainRequest, AIExplainResponse } from '@/lib/diagnose/types';
import { getOrCreateAnonymousSessionId, checkRateLimit, recordUsage, setAnonymousSessionCookie } from '@/lib/rate-limit';
import { logError, createErrorResponse, Errors } from '@/lib/error-handler';
import { aiRouter } from '@/lib/ai/router';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AIExplainRequest;

    if (!body.issue_title || !body.issue_summary) {
      const { response, status } = Errors.validationError('缺少必要的问题信息：issue_title 和 issue_summary');
      return NextResponse.json(response, { status });
    }

    // 匿名会话标识与限流
    const sessionId = getOrCreateAnonymousSessionId(request);
    const rateLimit = await checkRateLimit(sessionId, 'explain', 'free');
    if (!rateLimit.allowed) {
      const headers = setAnonymousSessionCookie(sessionId);
      const { response, status } = Errors.rateLimitExceeded(rateLimit.retryAfter);
      return NextResponse.json(response, { status, headers });
    }

    // 记录使用量（异步，不阻塞响应）
    recordUsage(sessionId, 'explain', 'free').catch((err) =>
      console.warn('[RateLimit] 记录使用量失败:', err instanceof Error ? err.message : err)
    );

    const prompt = buildExplainPrompt(body);

    // 使用 AI Router 替代硬编码 DeepSeek
    const aiResponse = await aiRouter.route({
      type: 'explain',
      prompt,
      systemPrompt: `你是简历诊断系统的解释模块，你的唯一职责是：当用户怀疑诊断结果时，给出当前问题的证据链和逻辑链，让用户明白为什么系统会这样判断。

你必须遵守以下严格约束：
1. 不允许重新判断或质疑诊断结论。
2. 不允许新增新问题或引入新的证据。
3. 只能围绕当前问题的标题、摘要、证据、建议展开解释。
4. 解释的重点是：
   - 引用了哪段证据（从简历原文）
   - 这段证据为什么会触发这个判断（基于招聘初筛的常见反应）
   - 这个判断为什么会影响筛选结果（在HR初筛的哪个环节、如何影响决策）
5. 必须增强结论稳定感，不能前后摇摆。
6. 除非证据明显薄弱，否则不要主动弱化主判断。
7. 文风要像”把理由讲透”，直接、坚定、有逻辑，不是像”再给一遍安慰建议”。

你的解释应该帮助用户理解诊断背后的招聘逻辑，而不是提供新的建议。`,
      temperature: 0.3,
      maxTokens: 800,
      requireJson: true,
    });

    const content = aiResponse.content;

    if (!content) {
      logError('ExplainAPI', 'AI returned empty content');
      const headers = setAnonymousSessionCookie(sessionId);
      const { response, status } = Errors.aiServiceUnavailable('AI 返回为空');
      return NextResponse.json(response, { status, headers });
    }

    let parsed: AIExplainResponse;
    try {
      parsed = JSON.parse(content) as AIExplainResponse;
    } catch {
      // 如果 JSON 解析失败，用原始文本作为 explanation
      parsed = {
        explanation: content,
        confidence: 'medium',
      };
    }

    // 确保必要字段
    if (!parsed.explanation) {
      parsed.explanation = '暂时无法生成解释，请稍后重试。';
    }
    if (!parsed.confidence) {
      parsed.confidence = 'medium';
    }

    const headers = setAnonymousSessionCookie(sessionId);
    return NextResponse.json(parsed, { headers });
  } catch (error) {
    logError('ExplainAPI', error);
    // 在未预期异常中仍然设置会话 cookie
    const sessionId = getOrCreateAnonymousSessionId(request);
    const headers = setAnonymousSessionCookie(sessionId);
    const { response, status } = Errors.internalError();
    return NextResponse.json(response, { status, headers });
  }
}

// 清理prompt文本，防止注入攻击
function sanitizeForPrompt(text: string, maxLength: number = 500): string {
  if (!text) return '';
  // 限制长度
  let sanitized = text.slice(0, maxLength);
  // 转义可能破坏prompt格式的特殊字符（基础防御）
  sanitized = sanitized.replace(/```/g, '\\`\\`\\`');
  sanitized = sanitized.replace(/`/g, '\\`');
  // 防止JSON注入（当文本被嵌入JSON字符串时）
  sanitized = sanitized.replace(/"/g, '\\"');
  sanitized = sanitized.replace(/\n{5,}/g, '\n\n'); // 限制过多空行
  return sanitized;
}

function buildExplainPrompt(req: AIExplainRequest): string {
  // 构建上下文信息块
  const contextBlocks: string[] = [];

  // 清理用户输入，防止prompt注入
  const safeTitle = sanitizeForPrompt(req.issue_title, 100);
  const safeSummary = sanitizeForPrompt(req.issue_summary, 300);
  const safeExcerpt = sanitizeForPrompt(req.resume_excerpt || '（未提供）', 200);
  const safeSuggestion = sanitizeForPrompt(req.issue_suggestion, 300);

  contextBlocks.push(`## 诊断条目
标题: ${safeTitle}
摘要: ${safeSummary}
证据: ${safeExcerpt}
建议: ${safeSuggestion}`);

  if (req.screening_impact) {
    const safeImpact = sanitizeForPrompt(req.screening_impact, 200);
    contextBlocks.push(`## 初筛影响
${safeImpact}`);
  }

  if (req.dimension) {
    const safeDimension = sanitizeForPrompt(req.dimension, 50);
    contextBlocks.push(`## 问题维度
${safeDimension}`);
  }

  if (req.jd_relevance) {
    const safeRelevance = sanitizeForPrompt(req.jd_relevance, 50);
    contextBlocks.push(`## 岗位相关性
${safeRelevance}`);
  }

  if (req.is_structural !== undefined) {
    contextBlocks.push(`## 是否结构性问题
${req.is_structural ? '是' : '否'}`);
  }

  if (req.user_question) {
    const safeQuestion = sanitizeForPrompt(req.user_question, 300);
    contextBlocks.push(`## 用户追问
${safeQuestion}`);
  }

  return `请基于以下诊断信息，解释这个诊断的证据链和逻辑链：

${contextBlocks.join('\n\n')}

请返回 JSON 格式:
{
  "explanation": "你的解释，聚焦于：1) 引用了哪段证据；2) 这段证据为什么会触发这个判断（基于招聘初筛的常见反应）；3) 这个判断为什么会影响筛选结果（在HR初筛的哪个环节、如何影响决策）。字数控制在200字以内。",
  "confidence": "high | medium | low（基于证据强度的置信度评估）",
  "evidence_strength": "strong | moderate | weak（可选，证据的明显程度）",
  "corpus_evidence": "可选，来自语料库的佐证（仅当能直接支持现有判断时提供）",
  "might_be_wrong": "可选，仅在证据明显薄弱、诊断可能不准确时提供"
}

只输出 JSON，不要加其他文字。`;
}
