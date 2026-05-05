// Metaso Provider 实现
import type { AIProvider, AITask, AIResponse, AIProviderConfig } from '../types';
import { AIProviderError } from '../types';
import { logInfo, logWarn, logError } from '../../error-handler';

interface MetasoWebpage {
  snippet?: string;
  summary?: string;
  description?: string;
  title?: string;
  url?: string;
}

/**
 * 计算网页与目标岗位的相关性分数
 */
function calculateWebpageRelevance(
  webpage: MetasoWebpage,
  targetRole: string,
  queryKeywords: string[]
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const title = webpage.title || '';
  const snippet = webpage.snippet || webpage.summary || webpage.description || '';
  const fullText = `${title} ${snippet}`.toLowerCase();
  const targetRoleLower = targetRole.toLowerCase();

  // 1. 岗位名称匹配（最高权重）
  if (targetRoleLower && fullText.includes(targetRoleLower)) {
    score += 3;
    reasons.push(`包含岗位名称"${targetRoleLower}"`);
  }

  // 2. 查询关键词匹配
  for (const keyword of queryKeywords) {
    const keywordLower = keyword.toLowerCase();
    if (fullText.includes(keywordLower)) {
      score += 1;
      reasons.push(`包含关键词"${keywordLower}"`);
    }
  }

  // 3. 行业相关词匹配
  const industryKeywords = ['岗位', '招聘', '薪资', '技能', '要求', '经验', '面试', '简历', '求职'];
  for (const keyword of industryKeywords) {
    if (fullText.includes(keyword)) {
      score += 0.5;
      reasons.push(`包含行业词"${keyword}"`);
      break;
    }
  }

  // 4. 明显不相关的内容扣分
  const irrelevantTerms = ['娱乐', '游戏', '电影', '音乐', '体育', '旅游', '美食', '时尚', '八卦'];
  for (const term of irrelevantTerms) {
    if (fullText.includes(term)) {
      score -= 2;
      reasons.push(`包含无关词"${term}"`);
    }
  }

  // 5. 内容长度奖励
  if (snippet.length > 100) {
    score += 0.5;
    reasons.push('内容详细');
  }

  return { score, reasons };
}

/**
 * 判断是否应该返回空memo（整体相关性太低）
 */
function shouldReturnEmptyMemo(
  webpages: MetasoWebpage[],
  relevanceScores: { score: number; reasons: string[] }[]
): boolean {
  if (webpages.length === 0) return true;

  // 检查是否有任何一个网页有正相关性
  const hasPositiveRelevance = relevanceScores.some(r => r.score > 0);
  if (!hasPositiveRelevance) return true;

  // 最高分低于阈值
  const maxScore = Math.max(...relevanceScores.map(r => r.score));
  if (maxScore < 2) {
    return true;
  }

  return false;
}

/**
 * 提取干净的research查询文本
 * 移除prompt中的指令，只保留关键事实
 * 基于岗位语义解析结果生成2~4条岗位研究查询
 */
function extractCleanResearchQuery(prompt: string): string {
  // 提取目标岗位（原始）
  const targetRoleMatch = prompt.match(/目标岗位:\s*([^\n]+)/);
  const targetRole = targetRoleMatch ? targetRoleMatch[1].trim() : '';

  // 提取标准化岗位信息（如果存在）
  const canonicalRoleMatch = prompt.match(/标准化岗位:\s*([^\n]+)/);
  const canonicalRole = canonicalRoleMatch ? canonicalRoleMatch[1].trim() : '';
  const roleFamilyMatch = prompt.match(/岗位族:\s*([^\n]+)/);
  const roleFamily = roleFamilyMatch ? roleFamilyMatch[1].trim() : '';
  const altRolesMatch = prompt.match(/相关岗位:\s*([^\n]+)/);
  const altRoles = altRolesMatch && altRolesMatch[1] !== '无' ? altRolesMatch[1].split('、').map(r => r.trim()).filter(r => r) : [];
  const skillsMatch = prompt.match(/推断技能:\s*([^\n]+)/);
  const inferredSkills = skillsMatch && skillsMatch[1] !== '无' ? skillsMatch[1].split('、').map(s => s.trim()).filter(s => s) : [];

  // 提取JD
  const jdMatch = prompt.match(/JD:\s*([^\n]+)/);
  const jdText = jdMatch ? jdMatch[1].trim() : '';

  // 提取简历关键事实（已弃用，不再使用）

  // 提取基础诊断问题
  const issuesMatch = prompt.match(/基础诊断已发现问题:\s*([^\n]+)/);
  const issuesText = issuesMatch ? issuesMatch[1].trim() : '';

  // 生成查询变体（2-4条）
  const queryVariants: string[] = [];

  // 变体1：标准化岗位 + JD关键词（如果JD存在）
  if (canonicalRole) {
    if (jdText && jdText !== '无具体JD' && jdText !== '无') {
      const jdKeywords = jdText.split(/[^\w\u4e00-\u9fa5]+/).filter(k => k.length > 1).slice(0, 3);
      if (jdKeywords.length > 0) {
        queryVariants.push(`${canonicalRole} ${jdKeywords.join(' ')}`);
      } else {
        queryVariants.push(canonicalRole);
      }
    } else {
      queryVariants.push(canonicalRole);
    }
  }

  // 变体2：岗位族 + 推断技能（如果技能存在）
  if (roleFamily && inferredSkills.length > 0) {
    const topSkills = inferredSkills.slice(0, 3);
    queryVariants.push(`${roleFamily} ${topSkills.join(' ')}`);
  } else if (roleFamily) {
    queryVariants.push(roleFamily);
  }

  // 变体3：相关岗位（如果有）
  if (altRoles.length > 0) {
    // 选择前2个别名
    const selectedAltRoles = altRoles.slice(0, 2);
    queryVariants.push(selectedAltRoles.join(' '));
  }

  // 变体4：原始目标岗位 + 推断技能（备用）
  if (targetRole && inferredSkills.length > 0) {
    const topSkills = inferredSkills.slice(0, 3);
    queryVariants.push(`${targetRole} ${topSkills.join(' ')}`);
  }

  // 去重变体
  const uniqueVariants = Array.from(new Set(queryVariants)).filter(v => v.trim().length > 0);

  // 确保至少有1个变体
  if (uniqueVariants.length === 0) {
    // 回退到原始关键词提取逻辑
    const keywords: string[] = [];
    if (targetRole) {
      keywords.push(targetRole);
      const roleKeywords = targetRole.replace(/[^\w\u4e00-\u9fa5]+/g, ' ').split(/\s+/).filter(k => k.length > 1);
      keywords.push(...roleKeywords);
    }
    if (jdText && jdText !== '无具体JD' && jdText !== '无') {
      const jdKeywords = jdText.split(/[^\w\u4e00-\u9fa5]+/).filter(k => k.length > 1).slice(0, 5);
      keywords.push(...jdKeywords);
    }
    if (issuesText && issuesText !== '未发现明显问题') {
      const issueKeywords = issuesText.split(/[、，。]/).map(k => k.trim()).filter(k => k.length > 1).slice(0, 3);
      keywords.push(...issueKeywords);
    }
    const uniqueKeywords = [...new Set(keywords)].filter(k => k.length > 0);
    const fallbackQuery = uniqueKeywords.join(' ');
    logInfo('MetasoProvider', '岗位解析信息缺失，回退到原始查询生成', {
      targetRole,
      canonicalRole,
      roleFamily,
      altRolesCount: altRoles.length,
      inferredSkillsCount: inferredSkills.length,
      fallbackQuery,
    });
    return fallbackQuery || targetRole || '简历诊断';
  }

  // 选择最多3个变体，用" | "连接（表示OR关系）
  const selectedVariants = uniqueVariants.slice(0, 3);
  const query = selectedVariants.join(' | ');

  logInfo('MetasoProvider', '基于岗位语义解析的research查询', {
    originalPromptLength: prompt.length,
    targetRole,
    canonicalRole,
    roleFamily,
    altRoles,
    inferredSkills,
    jdTextExists: jdText && jdText !== '无具体JD' && jdText !== '无',
    queryVariants: uniqueVariants,
    selectedVariants,
    finalQuery: query,
  });

  return query;
}

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
      logInfo('MetasoProvider', '使用默认 API Base URLs', { defaults: ['https://metaso.cn/api'] });
      baseUrls = ['https://metaso.cn/api'];
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

          // 对 research 任务，清理查询文本，移除 prompt 中的指令，只保留关键事实
          if (task.type === 'research') {
            queryText = extractCleanResearchQuery(task.prompt);
          }

          // 调试日志：打印请求信息
          logInfo('MetasoProvider', '请求参数调试', {
            taskType: task.type,
            queryTextLength: queryText.length,
            queryTextPreview: queryText.substring(0, 200) + (queryText.length > 200 ? '...' : ''),
            systemPromptLength: task.systemPrompt?.length || 0,
            systemPromptPreview: task.systemPrompt ? task.systemPrompt.substring(0, 100) + (task.systemPrompt.length > 100 ? '...' : '') : 'none',
            promptLength: task.prompt.length,
            promptPreview: task.prompt.substring(0, 150) + (task.prompt.length > 150 ? '...' : ''),
            requireJson: task.requireJson,
          });

          const requestBody = {
            q: queryText,
            mode: 'deep', // deep: 深入分析模式，适合推理分析
            size: 10, // 返回结果数量
            includeSummary: true, // 包含摘要
            // 可选参数：simple（简洁）、deep（深入）、academic（学术）
            // temperature参数在搜索API中不支持，移除
          };

          // 调试日志：打印请求体
          logInfo('MetasoProvider', '请求体调试', {
            requestBodyJson: JSON.stringify(requestBody),
            requestBodyKeys: Object.keys(requestBody),
            qLength: queryText.length,
            mode: requestBody.mode,
            size: requestBody.size,
            includeSummary: requestBody.includeSummary,
          });

          // 秘塔搜索推理API请求
          const response = await fetch(`${baseUrl}/v1/search`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
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

          // 调试日志：打印响应结构
          logInfo('MetasoProvider', 'API 响应结构调试', {
            responseKeys: Object.keys(data),
            responseType: typeof data,
            isArray: Array.isArray(data),
            topLevelKeys: Object.keys(data).slice(0, 10),
            hasAnswer: 'answer' in data,
            hasContent: 'content' in data,
            hasResult: 'result' in data,
            hasText: 'text' in data,
            hasChoices: 'choices' in data,
            hasResults: 'results' in data,
            hasWebpages: 'webpages' in data,
            answerType: data.answer ? typeof data.answer : 'none',
            contentType: data.content ? typeof data.content : 'none',
            resultType: data.result ? typeof data.result : 'none',
            textType: data.text ? typeof data.text : 'none',
            choicesType: data.choices ? (Array.isArray(data.choices) ? 'array' : typeof data.choices) : 'none',
            resultsType: data.results ? (Array.isArray(data.results) ? 'array' : typeof data.results) : 'none',
            webpagesType: data.webpages ? (Array.isArray(data.webpages) ? 'array' : typeof data.webpages) : 'none',
            dataPreview: JSON.stringify(data).substring(0, 300) + (JSON.stringify(data).length > 300 ? '...' : ''),
          });

          // 解析秘塔API响应格式
          let content = '';
          let selectedField = 'unknown';

          // 提取查询关键词用于相关性过滤（简单提取前3个非停用词）
          const queryWords = queryText.toLowerCase()
            .split(/[^\w\u4e00-\u9fa5]+/)
            .filter(w => w.length > 1)
            .slice(0, 3);

          // 尝试多种可能的响应格式，优先使用摘要和答案
          if (data.answer) {
            // 问答API返回的答案
            content = data.answer;
            selectedField = 'answer';
          } else if (data.summary) {
            // 摘要字段（当 includeSummary: true 时返回）
            content = data.summary;
            selectedField = 'summary';
          } else if (data.content) {
            // 通用内容字段
            content = data.content;
            selectedField = 'content';
          } else if (data.result && typeof data.result === 'string') {
            // 结果字段
            content = data.result;
            selectedField = 'result';
          } else if (data.text) {
            // 文本字段
            content = data.text;
            selectedField = 'text';
          } else if (data.choices && data.choices[0] && data.choices[0].message) {
            // OpenAI兼容格式
            content = data.choices[0].message.content;
            selectedField = 'choices[0].message.content';
          } else if (Array.isArray(data.webpages) && data.webpages.length > 0) {
            // 秘塔搜索API格式：webpages数组，进行智能相关性过滤
            const webpages: MetasoWebpage[] = data.webpages;

            // 提取目标岗位（从原始prompt中）
            const targetRoleMatch = task.prompt.match(/目标岗位:\s*([^\n]+)/);
            const targetRole = targetRoleMatch ? targetRoleMatch[1].trim() : '';

            // 计算每个网页的相关性
            const relevanceResults = webpages.map((page, index) => {
              const relevance = calculateWebpageRelevance(page, targetRole, queryWords);
              return {
                index,
                page,
                relevance
              };
            });

            // 详细日志：相关性分析
            logInfo('MetasoProvider', '网页相关性分析', {
              totalWebpages: webpages.length,
              targetRole,
              queryKeywords: queryWords,
              relevanceResults: relevanceResults.map(r => ({
                index: r.index,
                title: r.page.title?.substring(0, 50),
                score: r.relevance.score,
                reasons: r.relevance.reasons.slice(0, 3),
                snippetLength: (r.page.snippet || '').length
              }))
            });

            // 判断是否应该返回空memo
            const allScores = relevanceResults.map(r => r.relevance.score);
            const shouldEmpty = shouldReturnEmptyMemo(webpages, relevanceResults.map(r => r.relevance));

            if (shouldEmpty) {
              logWarn('MetasoProvider', '网页整体相关性太低，返回空memo', {
                targetRole,
                maxScore: Math.max(...allScores),
                averageScore: allScores.reduce((a, b) => a + b, 0) / allScores.length,
                webpagesCount: webpages.length
              });
              content = '[信息不足] 未找到与目标岗位相关的高质量市场信息。';
              selectedField = 'empty_memo (low_relevance)';
            } else {
              // 筛选高相关性网页
              const highRelevancePages = relevanceResults
                .filter(r => r.relevance.score >= 2)
                .sort((a, b) => b.relevance.score - a.relevance.score)
                .slice(0, 3);

              // 日志：筛选结果
              logInfo('MetasoProvider', '网页筛选结果', {
                totalPages: webpages.length,
                highRelevanceCount: highRelevancePages.length,
                highRelevanceDetails: highRelevancePages.map(r => ({
                  index: r.index,
                  title: r.page.title,
                  score: r.relevance.score,
                  snippetPreview: (r.page.snippet || '').substring(0, 100)
                }))
              });

              if (highRelevancePages.length > 0) {
                // 提取有内容的片段
                const validSnippets = highRelevancePages
                  .map(r => {
                    const snippet = r.page.snippet || r.page.summary || r.page.description || '';
                    return snippet.trim();
                  })
                  .filter(s => s.length > 0);

                if (validSnippets.length > 0) {
                  content = validSnippets.join('\n\n');
                  selectedField = `webpages[filtered:${validSnippets.length}]`;
                } else {
                  // 如果高相关性网页都没有有效内容，使用第一个高相关性网页的JSON
                  const firstPage = highRelevancePages[0].page;
                  content = JSON.stringify({
                    title: firstPage.title,
                    url: firstPage.url,
                    relevance_score: highRelevancePages[0].relevance.score
                  });
                  selectedField = 'webpages[0] (json_fallback)';
                }
              } else {
                // 如果没有高相关性网页，但有中等相关性，使用相关性最高的
                const bestPage = relevanceResults.sort((a, b) => b.relevance.score - a.relevance.score)[0];
                if (bestPage && bestPage.relevance.score > 0) {
                  content = bestPage.page.snippet || bestPage.page.summary || bestPage.page.description || '';
                  if (content.trim().length > 0) {
                    selectedField = `webpages[best:${bestPage.index}]`;
                  } else {
                    content = JSON.stringify({
                      title: bestPage.page.title,
                      url: bestPage.page.url,
                      relevance_score: bestPage.relevance.score
                    });
                    selectedField = 'webpages[best] (json_fallback)';
                  }
                } else {
                  // 如果都没有，返回空memo
                  content = '[信息不足] 搜索结果与目标岗位相关性较低。';
                  selectedField = 'empty_memo (no_relevance)';
                }
              }
            }
          } else if (Array.isArray(data.results) && data.results.length > 0) {
            // 搜索结果列表，取第一个结果的摘要
            const firstResult = data.results[0];
            content = firstResult.snippet || firstResult.summary || firstResult.description || JSON.stringify(firstResult);
            selectedField = 'results[0]';
          } else {
            // 尝试提取任何文本内容
            content = JSON.stringify(data).substring(0, 1000);
            selectedField = 'json_stringify';
          }

          // 构建详细的字段选择日志
          const fieldDebugInfo: Record<string, unknown> = {
            selectedField,
            contentLength: content.length,
            contentPreview: content.substring(0, 300) + (content.length > 300 ? '...' : ''),
            finalQueryPreview: queryText.substring(0, 300) + (queryText.length > 300 ? '...' : ''),
            queryKeywords: queryWords.length > 0 ? queryWords.join(',') : 'none',
            responseKeys: Object.keys(data).slice(0, 10),
          };

          // 如果是webpages相关字段，添加网页统计信息
          if (selectedField.includes('webpages') && Array.isArray(data.webpages)) {
            const totalWebpages = data.webpages.length;
            const highRelevanceCount = selectedField.includes('filtered') ?
              parseInt(selectedField.match(/filtered:(\d+)/)?.[1] || '0') : 0;
            const hasEmptyMemo = selectedField.includes('empty_memo');

            fieldDebugInfo.webpagesStats = {
              total: totalWebpages,
              highRelevance: highRelevanceCount,
              hasEmptyMemo,
              selectedFieldType: selectedField
            };
          }

          logInfo('MetasoProvider', '字段选择调试', fieldDebugInfo);

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
