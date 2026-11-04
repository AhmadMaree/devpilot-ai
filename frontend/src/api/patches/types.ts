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