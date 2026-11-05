export interface HealthResponse {
    status: string;
    version: string;
}


export interface InvestigationRequest {
    repository_id: string
    question:string
}


export interface InvestigationSource {
  source_id: string;
  chunk_id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  commit_sha: string;
}


export interface InvestigationResponse {
  repository_id: string;
  question: string;
  plan: string;
  answer: string;
  review_passed: boolean;
  review_feedback: string;
  attempts: number;
  sources: InvestigationSource[];
}


export interface SavedInvestigation {
  id: string;
  created_at: string;
  result: InvestigationResponse;
}

export interface InvestigationSummary {
  id: string;
  repository_id: string;
  question: string;
  review_passed: boolean;
  created_at: string;
}

export interface Repository {
  id: string;
  name: string;
  path: string;
  created_at: string;
}

export type IndexingJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export interface IndexingJob {
  job_id: string;
  repository_id: string;
  status: IndexingJobStatus;
  phase: string;
  processed_chunks: number;
  total_chunks: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export interface RepositoryIndexMetadata {
  repository_id: string;
  commit_sha: string;
  indexed_at: string;
  index_version: string | null;
}