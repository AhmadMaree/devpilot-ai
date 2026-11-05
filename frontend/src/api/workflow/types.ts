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