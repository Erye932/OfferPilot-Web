# OfferPilot-Web AGENTS.md（多代理团队配置）
# 配合 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 使用

## 可用代理团队
- **Researcher**：收集事实、分析现有代码、查找最佳实践
- **Architect**：设计架构、规划 Todo、生成高性能方案
- **Coder**：实际编写/重构代码（DeepSeek-V3.2 主力）
- **Reviewer**：安全审查、类型检查、性能优化、客观纠错

## 使用规则
当任务复杂时，先用 TodoWrite 规划，然后并行调用多个代理：
1. Researcher → 分析现有代码
2. Architect → 拆解 Todo
3. Coder → 执行实现
4. Reviewer → 最终审查

示例调用：
- 先 TodoWrite 拆任务
- 然后并行：Researcher + Architect
- 最后 Coder + Reviewer

优先使用 DeepSeek-V3.2 的长上下文优势，让团队协作更高效。