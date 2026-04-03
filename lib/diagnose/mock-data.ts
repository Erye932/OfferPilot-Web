// Demo结果页静态mock数据
// 完全兼容FreeDiagnoseResponse类型，确保DiagnoseResult组件正常工作

import type { FreeDiagnoseResponse } from './types';

export const demoDiagnoseResult: FreeDiagnoseResponse = {
  scenario: 'normal',
  main_judgment: '岗位匹配表达不清，导致简历初筛通过率偏低',
  core_issues: [
    {
      title: '工作经历缺少结果证据',
      summary: '描述了负责的工作内容，但没有说明带来的具体成果和影响',
      evidence: '负责校园活动策划与执行，跟进现场落地，配合团队完成活动相关工作',
      insider_view: '招聘方看到这类描述时，会认为候选人只是"完成任务"，而不清楚实际贡献和价值',
      suggestion: '为每项工作补充具体成果数据，如"活动参与人数提升30%"或"活动满意度达到95%"',
      follow_up_question: '你在这次活动中具体解决了什么困难？活动效果如何量化评估？',
      priority: 1,
      screening_impact: '初筛时容易被归类为"常规执行者"，缺乏亮点记忆点',
      is_structural: false,
      jd_relevance: 'high',
      dimension: 'evidence',
      rewrite_examples: [
        {
          original: '负责校园活动策划与执行，跟进现场落地',
          rewritten: '独立策划"校园创新大赛"，吸引120+团队报名，活动现场参与人数达500人，赛后收到85%满意度反馈',
          change_summary: '补充具体活动名称、参与规模、成果数据'
        }
      ]
    },
    {
      title: '技能描述与岗位要求连接不够直接',
      summary: '简历中的技能点没有明确指向岗位需求中的关键能力',
      evidence: '熟悉Office办公软件，具备良好的沟通能力',
      insider_view: '这类通用描述无法让招聘方快速判断你是否具备岗位所需的特定技能',
      suggestion: '将通用技能转化为与岗位直接相关的能力描述，如"能用Excel进行数据分析并输出可视化报表"',
      follow_up_question: '你使用Excel处理过什么复杂的数据分析任务？',
      priority: 2,
      screening_impact: '技能匹配度不清晰，可能被ATS系统筛选掉',
      is_structural: false,
      jd_relevance: 'medium',
      dimension: 'role_fit',
      source_location: {
        paragraph_index: 2,
        text_snippet: '熟悉Office办公软件，具备良好的沟通能力'
      }
    },
    {
      title: '项目经验结构松散，重点不突出',
      summary: '多个项目经验罗列，但没有明确的主次关系和成果对比',
      evidence: '参与过A项目、B项目和C项目，负责不同模块的开发工作',
      insider_view: '招聘方需要快速抓住你的核心专长，而不是了解你参与过的所有项目',
      suggestion: '选择1-2个最具代表性的项目详细展开，用STAR法则结构化描述',
      follow_up_question: '这几个项目中，哪个最能体现你的核心能力？为什么？',
      priority: 3,
      screening_impact: '重点分散，难以在30秒内形成深刻印象',
      is_structural: true,
      jd_relevance: 'high',
      dimension: 'structure'
    }
  ],
  core_issues_summary: {
    total_count: 3,
    shown_count: 3
  },
  priority_actions: [
    {
      title: '先重写最相关的一段工作经历',
      description: '选择与目标岗位最匹配的一段经历，补充具体成果数据，用"做了什么+带来什么结果"的句式重写'
    },
    {
      title: '将通用技能转化为岗位专属描述',
      description: '对照岗位要求，将"沟通能力"细化为"跨部门需求协调"，将"办公软件"细化为"数据分析与可视化"'
    },
    {
      title: '重构项目经验结构',
      description: '按"核心项目(详细展开)+其他项目(简要提及)"的方式重组，确保招聘方30秒内看到你的最大亮点'
    }
  ],
  rewrite_direction: '从"我做了什么"转向"我带来了什么改变"，用具体数据证明价值',
  minor_suggestions: [
    {
      title: '优化自我评价部分',
      description: '当前自我评价比较泛泛，建议结合岗位要求的具体能力点，给出更针对性的自我定位'
    },
    {
      title: '统一时间格式',
      description: '工作经历的时间表述有些不一致，统一为"YYYY.MM - YYYY.MM"格式会更专业'
    }
  ],
  rewrite_examples: [
    {
      original: '配合团队完成活动相关工作',
      rewritten: '作为核心组织者，协调5个部门资源，确保活动各环节无缝衔接，最终活动准时举办率100%',
      change_summary: '明确角色定位、协作规模、关键成果'
    },
    {
      original: '活动结束后整理反馈信息',
      rewritten: '设计并发放活动反馈问卷，回收有效反馈150份，基于数据输出3项优化建议，被采纳用于下次活动改进',
      change_summary: '补充方法论、数据规模、实际影响'
    }
  ],
  follow_up_prompts: [
    {
      question: '你在这段经历中遇到的最大挑战是什么？如何解决的？',
      why: '能考察候选人的问题解决能力和成长反思'
    },
    {
      question: '如果让你重新做这个项目，你会优化哪些方面？',
      why: '了解候选人的复盘能力和持续改进意识'
    }
  ],
  quality_tier: 'weak',
  metadata: {
    target_role: '活动运营专员',
    has_jd: true,
    generated_at: new Date().toISOString(),
    tier: 'free',
    jd_quality: 'strong',
    schema_version: 'v3'
  }
};

// 导出默认数据
export default demoDiagnoseResult;