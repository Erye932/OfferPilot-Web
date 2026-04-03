#!/bin/bash
# OfferPilot Deep 模式 Metaso 调试脚本
# 用法：bash debug_curl_examples.sh

set -e

echo "=== OfferPilot Deep 模式 Metaso 调试脚本 ==="
echo ""

# 1. 检查 /api/diagnose 端点（基础诊断）
echo "1. 测试基础诊断端点 (basic mode):"
curl -X POST "http://localhost:3000/api/diagnose" \
  -H "Content-Type: application/json" \
  -d '{
    "resume_text": "资深前端工程师，5年React经验，精通TypeScript，有团队管理经验。",
    "target_role": "前端开发工程师",
    "jd_text": "负责公司核心产品前端开发，要求精通React、TypeScript，有性能优化经验。",
    "tier": "free",
    "diagnose_mode": "basic"
  }' \
  --max-time 30 \
  | jq '.metadata.diagnose_mode, .metadata.deep_diagnosis, .metadata.deep_fallback_reason // "无fallback"'
echo ""

# 2. 检查 /api/diagnose 端点（深度诊断）
echo "2. 测试深度诊断端点 (deep mode):"
curl -X POST "http://localhost:3000/api/diagnose" \
  -H "Content-Type: application/json" \
  -d '{
    "resume_text": "资深前端工程师，5年React经验，精通TypeScript，有团队管理经验。",
    "target_role": "前端开发工程师",
    "jd_text": "负责公司核心产品前端开发，要求精通React、TypeScript，有性能优化经验。",
    "tier": "free",
    "diagnose_mode": "deep"
  }' \
  --max-time 30 \
  | jq '.metadata.diagnose_mode, .metadata.deep_diagnosis, .metadata.deep_fallback_reason // "无fallback", .metadata.deep_fallback_message // "无消息"'
echo ""

# 3. 直接测试 Metaso API 可用性（需要 METASO_API_KEY 环境变量）
echo "3. 测试 Metaso API 可用性（直接调用）:"
if [[ -z "$METASO_API_KEY" ]]; then
  echo "   METASO_API_KEY 环境变量未设置，跳过直接测试"
  echo "   提示：在运行脚本前设置 METASO_API_KEY 和 METASO_API_BASE_URL"
else
  METASO_API_BASE_URL=${METASO_API_BASE_URL:-"https://api.metaso.cn"}
  curl -X POST "${METASO_API_BASE_URL}/v1/search" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $METASO_API_KEY" \
    -d '{
      "q": "前端开发工程师岗位要求和发展趋势",
      "mode": "deep",
      "size": 5,
      "includeSummary": true
    }' \
    --max-time 30 \
    | jq '.webpages[0].snippet // .answer // .content // "无内容"'
fi
echo ""

# 4. 环境变量检查脚本
echo "4. 环境变量检查:"
echo "   DUAL_AI_ENABLED=${DUAL_AI_ENABLED:-未设置}"
echo "   METASO_API_KEY=${METASO_API_KEY:+(已设置，长度 ${#METASO_API_KEY})}"
echo "   METASO_API_BASE_URL=${METASO_API_BASE_URL:-未设置}"
echo "   AI_TIMEOUT_MS=${AI_TIMEOUT_MS:-未设置}"
echo "   AI_RETRY_MAX=${AI_RETRY_MAX:-未设置}"
echo "   AI_CIRCUIT_FAIL_THRESHOLD=${AI_CIRCUIT_FAIL_THRESHOLD:-未设置}"
echo "   AI_CIRCUIT_OPEN_MS=${AI_CIRCUIT_OPEN_MS:-未设置}"
echo ""

# 5. 日志检查提示
echo "5. 日志检查提示:"
echo "   深度诊断日志标签："
echo "     - DiagnoseAPI (入口检查)"
echo "     - AIRouter (AI路由决策)"
echo "     - MetasoProvider (Metaso提供者状态)"
echo "     - DeepWorkflow (深度工作流)"
echo "   查看日志命令："
echo "     tail -f next.log | grep -E '(DiagnoseAPI|AIRouter|MetasoProvider|DeepWorkflow)'"
echo ""

echo "=== 脚本结束 ==="
echo "提示：确保服务正在运行 (npm run dev)"
echo "提示：安装 jq 以解析 JSON 响应"