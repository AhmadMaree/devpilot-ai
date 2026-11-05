export type PatchStatus =
  | "pending"
  | "applying"
  | "applied"
  | "rejected"
  | "failed";

export interface PatchPreview {
  id: string;
  repository_id: string;
  file_path: string;
  explanation: string;
  status: PatchStatus;
  diff: string;
}

export interface PatchProposalDetails {
  id: string;
  repository_id: string;
  file_path: string;
  explanation: string;
  status: PatchStatus;
  created_at: string;
}

export interface PatchActionResponse {
  id: string;
  status: PatchStatus;
  message: string;
}


export interface GeneratePatchRequest {
  repository_id: string;
  file_path: string;
  instruction: string;
}

export interface GeneratedPatchResponse {
  id: string;
  status: PatchStatus;
  created_at: string;
  diff: string;
}

export interface KnownPatchProposal {
  id: string;
  repository_id: string;
  source: "workflow" | "direct";
  file_path: string;
  request_context: string;
  known_at: string;
  workflow_feedback?: {
    developer: string;
    reviewer: string;
    reviewer_passed: boolean;
    qa: string;
    qa_passed: boolean;
  };
  status?: PatchStatus;
}