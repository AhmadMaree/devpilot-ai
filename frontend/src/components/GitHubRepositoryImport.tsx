import { useState, type FormEvent } from "react";

import { importGitHubRepository } from "../api/github/github";
import type { Repository } from "../api/types";

interface GitHubRepositoryImportProps {
  onImported: (repository: Repository) => void;
}

export function GitHubRepositoryImport({
  onImported,
}: GitHubRepositoryImportProps) {
  const [url, setUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isImporting) return;

    setIsImporting(true);
    setError(null);

    try {
      const repository = await importGitHubRepository({
        url: url.trim(),
      });

      setUrl("");
      onImported(repository);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not import GitHub repository",
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="github-import">
      <h2>Import from GitHub</h2>

      <p>
        Import a public GitHub repository into DevPilot AI.
      </p>

      <form onSubmit={handleSubmit}>
       <div className="github-import-field">
            <label htmlFor="github-repository-url">
                GitHub repository URL
            </label>

            <input
                id="github-repository-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://github.com/owner/repository"
                required
                disabled={isImporting}
            />
        </div>

        <button type="submit" disabled={isImporting || !url.trim()}>
          {isImporting ? "Importing..." : "Import Repository"}
        </button>
      </form>

      {error && <p role="alert">{error}</p>}
    </section>
  );
}