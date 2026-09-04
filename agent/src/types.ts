export type TestCase = {
  id: string;
  title: string;
  description?: string;
  typeOfTest?: string;
  status?: string;
  jira_issue?: any;
};

export type ExecutionResult = {
  testId: string;
  passed: boolean;
  logs?: string;
  evidence?: any;
  // queue metadata (added for offline retry handling)
  queuedAt?: string;
  attempts?: number;
  lastAttemptAt?: string;
  timedOutAt?: string;
};
