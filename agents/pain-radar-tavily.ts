/**
 * Agent 2-Tavily: 痛点雷达（自动版）
 * 用 Tavily API 自动搜索社交平台热点，不用手动复制
 *
 * 用法:
 *   npx tsx agents/pain-radar-tavily.ts
 *   npx tsx agents/pain-radar-tavily.ts --query="简历 求职 2026"
 *
 * 注意：每月限 1000 次调用，已做缓存优化
 */

import fs from 'fs';
import path from 'path';

// 加载 .env.local
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  });
}

const OUTPUT_DIR = path.join(__dirname, '../outputs/pain-radar');
const CACHE_DIR = path.join(__dirname, '../outputs/.cache');
const CACHE_TTL_HOURS = 24;

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
const TAVILY_API_URL = 'https://api.tavily.com/search';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface PainPoint {
  id: string;
  topic: string;
  heat: number;
  sentiment: '焦虑' | '愤怒' | '迷茫' | '求助' | '分享';
  source: string;
  url: string;
  quote: string;
  opportunity: string;
  targetPersona: string;
  contentAngle: string;
}

interface DailyReport {
  date: string;
  platform: string;
  totalScanned: number;
  painPoints: PainPoint[];
  topOpportunities: string[];
  apiCallsUsed: number;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function generateId(): string {
  return `pain-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
}

/**
 * 检查缓存是否有效
 */
function getCachedResult(cacheKey: string): TavilyResult[] | null {
  const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);
  if (!fs.existsSync(cacheFile)) return null;

  const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
  const ageHours = (Date.now() - cache.timestamp) / (1000 * 60 * 60);

  if (ageHours > CACHE_TTL_HOURS) {
    fs.unlinkSync(cacheFile);
    return null;
  }

  console.log(`  💾 命中缓存: ${cacheKey} (${Math.round(ageHours)}小时前)`);
  return cache.results;
}

/**
 * 保存缓存
 */
function saveCache(cacheKey: string, results: TavilyResult[]) {
  ensureDir(CACHE_DIR);
  const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);
  fs.writeFileSync(cacheFile, JSON.stringify({ timestamp: Date.now(), results }, null, 2), 'utf-8');
}

/**
 * 调用 Tavily API 搜索
 */
async function tavilySearch(query: string, maxResults = 8): Promise<TavilyResult[]> {
  if (!TAVILY_API_KEY) {
    throw new Error('TAVILY_API_KEY 未设置，请在 .env.local 中添加');
  }

  const cacheKey = query.replace(/[^a-zA-Z0-9一-龥]/g, '_').substring(0, 50);
  const cached = getCachedResult(cacheKey);
  if (cached) return cached;

  console.log(`  🔍 Tavily 搜索: "${query}"`);

  const response = await fetch(TAVILY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      search_depth: 'basic', // basic 更省调用次数
      max_results: maxResults,
      include_answer: false,
      include_images: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tavily API 错误: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const rawResults: Array<{ title?: string; url?: string; content?: string; score?: number }> = data.results || [];
  const results: TavilyResult[] = rawResults.map((r) => ({
    title: r.title || '',
    url: r.url || '',
    content: r.content || '',
    score: r.score || 0,
  }));

  saveCache(cacheKey, results);
  console.log(`  ✅ 搜索完成，${results.length} 条结果`);

  return results;
}

/**
 * 从搜索结果提取痛点
 */
function extractPainPoints(results: TavilyResult[], platform: string): PainPoint[] {
  const pains: PainPoint[] = [];

  for (const result of results) {
    const text = `${result.title} ${result.content}`;

    // 跳过明显无关的内容
    if (!text.includes('简历') && !text.includes('求职') && !text.includes('面试')) {
      continue;
    }

    // 提取情绪
    let sentiment: PainPoint['sentiment'] = '迷茫';
    if (/焦虑|担心|害怕|慌|愁/.test(text)) sentiment = '焦虑';
    else if (/气|愤怒|坑|骗|垃圾/.test(text)) sentiment = '愤怒';
    else if (/求助|怎么办|帮|求/.test(text)) sentiment = '求助';
    else if (/分享|经验|干货|教程/.test(text)) sentiment = '分享';

    // 提取核心问题（简化版）
    let topic = result.title;
    if (topic.length > 30) topic = topic.substring(0, 28) + '...';

    // 生成机会和切入点
    const opportunities: Record<string, { opp: string; angle: string; persona: string }> = {
      '大专': {
        opp: '针对大专生的专项简历诊断服务',
        angle: '大专不是原罪，是简历没写对',
        persona: '大专学历应届生/1-3年经验',
      },
      '投': {
        opp: '简历初筛通过率诊断',
        angle: 'HR已读不回的5个简历死因',
        persona: '所有求职者',
      },
      '转行': {
        opp: '转行人士简历重构服务',
        angle: '转行不是从零开始，是迁移能力',
        persona: '转行求职者',
      },
      '量化': {
        opp: '简历量化表达改写服务',
        angle: '没数据也能写出说服力的简历',
        persona: '运营/产品/市场岗',
      },
      'AI': {
        opp: 'AI简历人工精修服务',
        angle: 'AI写简历可以，但必须过这3关',
        persona: '用AI生成简历的求职者',
      },
      '应届生': {
        opp: '应届生简历从零构建服务',
        angle: '没实习也能写出满页简历',
        persona: '无实习经历的应届生',
      },
      '模板': {
        opp: '去模板化简历定制',
        angle: '为什么你的简历一看就是抄的',
        persona: '使用模板的求职者',
      },
    };

    let matched = Object.entries(opportunities).find(([k]) => text.includes(k));
    if (!matched) matched = ['通用', { opp: '简历诊断优化服务', angle: '简历还能这么改', persona: '所有求职者' }];

    pains.push({
      id: generateId(),
      topic,
      heat: Math.min(100, Math.round(result.score * 100)),
      sentiment,
      source: platform,
      url: result.url,
      quote: result.content.substring(0, 120) + (result.content.length > 120 ? '...' : ''),
      opportunity: matched[1].opp,
      targetPersona: matched[1].persona,
      contentAngle: matched[1].angle,
    });
  }

  // 去重：相同 topic 只保留一个
  const seen = new Set<string>();
  return pains.filter(p => {
    if (seen.has(p.topic)) return false;
    seen.add(p.topic);
    return true;
  });
}

/**
 * 生成日报
 */
function generateDailyReport(platform: string, pains: PainPoint[], apiCalls: number): DailyReport {
  const date = new Date().toISOString().split('T')[0];
  const sortedPains = pains.sort((a, b) => b.heat - a.heat);

  return {
    date,
    platform,
    totalScanned: pains.length,
    painPoints: sortedPains.slice(0, 8),
    topOpportunities: sortedPains.slice(0, 3).map(
      p => `[${p.heat}热度] ${p.opportunity} → 切入: ${p.contentAngle}`
    ),
    apiCallsUsed: apiCalls,
  };
}

/**
 * 保存报告
 */
function saveReport(report: DailyReport) {
  ensureDir(OUTPUT_DIR);
  const filename = `${report.date}-tavily.json`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`💾 报告已保存: ${filepath}`);
}

/**
 * 打印摘要
 */
function printSummary(report: DailyReport) {
  console.log('\n═══════════════════════════════════════');
  console.log(`📊 痛点雷达(Tavily) | ${report.date}`);
  console.log('═══════════════════════════════════════\n');

  console.log(`🔍 扫描到 ${report.totalScanned} 个痛点`);
  console.log(`📡 API 调用: ${report.apiCallsUsed} 次\n`);

  console.log('🔥 TOP 痛点:');
  report.painPoints.slice(0, 5).forEach((p, i) => {
    const emoji = p.heat >= 80 ? '🔴' : p.heat >= 60 ? '🟠' : '🟡';
    console.log(`  ${emoji} ${i + 1}. [${p.heat}] ${p.topic} (${p.sentiment})`);
    console.log(`     💬 "${p.quote}"`);
    console.log(`     💰 机会: ${p.opportunity}\n`);
  });

  console.log('💎 今日重点:');
  report.topOpportunities.forEach((opp, i) => {
    console.log(`  ${i + 1}. ${opp}`);
  });

  console.log('\n═══════════════════════════════════════\n');
}

// ─── 主入口 ────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const customQuery = args.find(a => a.startsWith('--query='))?.split('=')[1];

  if (!TAVILY_API_KEY) {
    console.log('❌ TAVILY_API_KEY 未设置');
    console.log('请在 .env.local 中添加: TAVILY_API_KEY=tvly-...');
    console.log('获取地址: https://app.tavily.com/home');
    process.exit(1);
  }

  console.log('🚀 痛点雷达(Tavily)启动...\n');

  let allPains: PainPoint[] = [];
  let apiCalls = 0;

  if (customQuery) {
    // 自定义搜索
    console.log(`📝 自定义查询: "${customQuery}"\n`);
    const results = await tavilySearch(customQuery, 10);
    apiCalls++;
    const pains = extractPainPoints(results, 'custom');
    allPains = allPains.concat(pains);
  } else {
    // 默认搜索策略：2个关键词组合，省API调用
    const queries = [
      '小红书 简历 求职 热门 2026',
      '知乎 求职 简历 高赞 问题',
    ];

    for (const query of queries) {
      console.log(`📡 搜索: "${query}"`);
      try {
        const results = await tavilySearch(query, 8);
        apiCalls++;
        const platform = query.includes('小红书') ? 'xiaohongshu' : 'zhihu';
        const pains = extractPainPoints(results, platform);
        allPains = allPains.concat(pains);
      } catch (err) {
        console.log(`  ⚠️ 搜索失败: ${err}`);
      }
    }
  }

  const report = generateDailyReport('all', allPains, apiCalls);
  saveReport(report);
  printSummary(report);

  console.log(`✅ 完成！本次消耗 ${apiCalls} 次 Tavily API 调用`);
  console.log(`💡 本月剩余约 ${1000 - apiCalls} 次（建议每日运行1次）\n`);
}

main().catch(console.error);
