// 回归测试：normalizeInput 的 persona_resolution 集成
// 确保 detectPersona 正确挂到 pipeline，且典型场景识别正确

import { describe, it, expect } from 'vitest';
import { normalizeInput } from '../lib/diagnose/normalize';

describe('normalizeInput 集成 detectPersona', () => {
  it('应届毕业生描述文本 应识别为 fresh_grad', async () => {
    const normalized = await normalizeInput({
      resume_text:
        '我是一名应届毕业生，在校期间主修工商管理专业，参加过多次校园活动和社团组织工作。具备较强的学习能力和适应能力，能够在新环境中快速成长。希望能找到一份与专业相关的工作机会，在实践中不断提升自己的综合素质和专业能力。',
      target_role: '管培生',
      jd_text: '',
      tier: 'free',
    });

    expect(normalized.persona_resolution).toBeDefined();
    expect(normalized.persona_resolution?.persona).toBe('fresh_grad');
    expect(normalized.persona_resolution?.signals).toContain('explicit_fresh_grad_keyword');
  });

  it('3 年前端工程师 应识别为 other', async () => {
    const normalized = await normalizeInput({
      resume_text:
        '我是一名有三年经验的前端工程师，精通React和TypeScript框架，熟悉Vue和Next.js等现代Web开发技术。曾在两家互联网公司负责核心业务前端项目的架构设计与开发，具备丰富的大型项目经验和良好的工程化能力。',
      target_role: '前端工程师',
      jd_text: '',
      tier: 'free',
    });

    expect(normalized.persona_resolution?.persona).toBe('other');
  });
});
