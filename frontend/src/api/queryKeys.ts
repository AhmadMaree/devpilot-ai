export const queryKeys = {
  repositories: {
    all: ["repositories"] as const,
  },
  indexing: {
    status: (repositoryId: string) =>
      ["repository-index-status", repositoryId] as const,
    metadata: (repositoryId: string) =>
      ["repository-index-metadata", repositoryId] as const,
  },
  investigations: {
    all: ["investigation-history"] as const,
    detail: (id: string) => ["investigation", id] as const,
  },
  workflows: {
    all: ["development-workflows"] as const,
    byRepository: (repositoryId: string) =>
      ["development-workflows", repositoryId] as const,
    detail: (id: string) => ["development-workflow", id] as const,
  },
  proposals: {
    all: ["patch-proposals"] as const,
    byRepository: (repositoryId: string) =>
      ["patch-proposals", repositoryId] as const,
    page: (repositoryId: string, offset: number) =>
      ["patch-proposals", repositoryId, offset] as const,
    detail: (id: string) => ["review-proposal-details", id] as const,
    preview: (id: string) => ["review-proposal-preview", id] as const,
  },
  llm: {
    providers: ["llm-providers"] as const,
    models: (provider: string) => ["llm-models", provider] as const,
    selection: ["llm-selection"] as const,
  },
} as const;
