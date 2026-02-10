export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type MeResponse = {
  user_id: string;
  timezone: string;
  min_interval_days: number;
  due_hour_local: number;
  due_minute_local: number;
};

export type Problem = {
  id: string;
  url: string;
  platform: string;
  title: string;
  difficulty: string;
  topics: string[];
};

export type UserState = {
  reps: number;
  interval_days: number;
  ease: number;
  due_at: string;
  is_active: boolean;
};

export type ProblemWithState = Problem & {
  state?: UserState;
};

export type PostReviewResponse = {
  problem_id?: string;
  reviewed_at?: string;
  next_due_at?: string;
  reps?: number;
  interval_days?: number;
  ease?: number;
  min_interval_days?: number;
};

export type List = {
  id: string;
  name: string;
  description: string;
  source_type: string;
  source_key?: string | null;
  version?: string | null;
  created_at: string;
};

export type ListItem = {
  order_index: number;
  problem: Problem;
};

export type ListWithItems = List & {
  items: ListItem[];
};

export type Contest = {
  id: string;
  user_id: string;
  duration_minutes: number;
  strategy: string;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
};

export type ContestItem = {
  order_index: number;
  target_minutes: number;
  problem: Problem;
  result?: {
    grade?: number | null;
    time_spent_sec?: number | null;
    solved_flag?: boolean | null;
    recorded_at?: string | null;
  } | null;
};

export type ContestWithItems = Contest & {
  items: ContestItem[];
};

export type StatsOverview = {
  active_problems: number;
  overdue_count: number;
  due_today_count: number;
  due_soon_count: number;
  reviews_last_7_days: number;
  current_streak_days: number;
};

export type TopicStat = {
  topic: string;
  count: number;
  mastery_avg: number;
};

export type ContestStatsDay = {
  date: string; // YYYY-MM-DD (user timezone)
  contests_finished: number;
  problems_recorded: number;
  solved_count: number;
  avg_grade?: number | null;
  total_time_sec: number;
};

export type ContestStatsRecent = {
  contest_id: string;
  strategy: string;
  duration_minutes: number;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  total_items: number;
  recorded_count: number;
  solved_count: number;
  avg_grade?: number | null;
  total_time_sec: number;
};

export type ContestStatsResponse = {
  window_days: number;
  totals: {
    contests_finished: number;
    problems_recorded: number;
    solved_count: number;
    avg_grade?: number | null;
    total_time_sec: number;
  };
  days: ContestStatsDay[];
  recent: ContestStatsRecent[];
};
