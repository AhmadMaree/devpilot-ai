export interface DevelopmentWorkflowRequest {
  repository_id: string;
  file_path: string;
  instruction: string;
}

export interface DevelopmentWorkflowResponse {
  workflow_status: "ready_for_approval" | "failed";
  developer_status: "pending" | "completed" | "failed";
  developer_feedback: string;
  review_passed: boolean;
  review_feedback: string;
  qa_passed: boolean;
  qa_feedback: string;
  error: string | null;
  proposal_id: string | null;
  diff: string | null;
}

export interface DevelopmentWorkflowSummary {
  id: string;
  repository_id: string;
  file_path: string;
  instruction: string;
  status: string;
  proposal_id: string | null;
  created_at: string;
}

export interface DevelopmentWorkflowDetail extends DevelopmentWorkflowSummary {
  response: {
    workflow_status: string;
    developer_status: string;
    developer_feedback: string;
    review_passed: boolean;
    review_feedback: string;
    qa_passed: boolean;
    qa_feedback: string;
    error: string | null;
    proposal_id: string | null;
    diff: string | null;
  };
}