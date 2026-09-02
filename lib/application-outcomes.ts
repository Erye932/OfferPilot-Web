export const APPLICATION_OUTCOME_STAGES = [
  'not_applied',
  'applied',
  'no_response',
  'rejected',
  'written_test',
  'first_interview',
  'second_interview',
  'final_interview',
  'offer',
] as const;

export type ApplicationOutcomeStageValue = typeof APPLICATION_OUTCOME_STAGES[number];

export const APPLICATION_OUTCOME_STAGE_LABELS: Record<ApplicationOutcomeStageValue, string> = {
  not_applied: '尚未投递',
  applied: '已投递',
  no_response: '暂无回复',
  rejected: '被拒',
  written_test: '笔试',
  first_interview: '一面',
  second_interview: '二面',
  final_interview: '终面',
  offer: 'Offer',
};

export const APPLICATION_OUTCOME_STAGE_ORDER: ApplicationOutcomeStageValue[] = [
  'applied',
  'no_response',
  'rejected',
  'written_test',
  'first_interview',
  'second_interview',
  'final_interview',
  'offer',
];

export const POSITIVE_APPLICATION_OUTCOME_STAGES: ApplicationOutcomeStageValue[] = [
  'written_test',
  'first_interview',
  'second_interview',
  'final_interview',
  'offer',
];
