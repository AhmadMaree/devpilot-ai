
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { get_investigation , getInvestigationHistory, getSavedInvestigation } from "./api/api";
import type { InvestigationResponse, InvestigationSummary, SavedInvestigation } from "./api/types";
import { PatchReview } from "./components/PatchReview"
import { PatchGenerator } from "./components/PatchGenerator";

import "./App.css";

const REPOSITORY_ID = "demo-repository";

function App() {
  const [question, setQuestion] = useState(
    "Where is repository ingestion implemented?",
  );

  const [result, setResult] =
    useState<InvestigationResponse | null>(null);

  const [history, setHistory] = useState<InvestigationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [proposalId, setProposalId] = useState("");

  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void loadHistory();
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();

    if (trimmedQuestion.length < 3) {
      setError("Enter a question with at least 3 characters.");
      return;
    }

    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response: SavedInvestigation = await get_investigation(
        {
          repository_id: REPOSITORY_ID,
          question: trimmedQuestion,
        },
        controller.signal,
      );

      if (!controller.signal.aborted) {
        setResult(response.result);
        setSelectedId(response.id);
        void loadHistory()
      }
    } catch (caughtError) {
      if (!controller.signal.aborted) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "An unexpected error occurred.",
        );
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }

  async function openInvestigation(id: string) {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setLoading(false);

    setError(null);

    try {
      const saved = await getSavedInvestigation(id);

      setSelectedId(saved.id);
      setResult(saved.result);
      setQuestion(saved.result.question);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not load investigation",
      );
    }
  }

  function handleCancel() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setLoading(false);
  }


  async function loadHistory() {
    setHistoryLoading(true);

    try {
      const items = await getInvestigationHistory();
      setHistory(items);
    } catch (error) {
      console.error("Could not load investigation history", error);
    } finally {
      setHistoryLoading(false);
    }
  }


  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">D</div>
          <div>
            <strong>DevPilot AI</strong>
            <small>Engineering Assistant</small>
          </div>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-label">WORKSPACE</span>
          <div className="repository-item">
            <span aria-hidden="true">▣</span>
            <span>{REPOSITORY_ID}</span>
          </div>
        </div>

        <div className="sidebar-footer">
          <span className="status-dot" />
          Local development
        </div>

        <div className="sidebar-section">
        <div className="history-heading">
          <span className="sidebar-label">
            RECENT INVESTIGATIONS
          </span>

          <button
            type="button"
            className="history-refresh"
            onClick={() => void loadHistory()}
            disabled={historyLoading}
            aria-label="Refresh investigation history"
          >
            ↻
          </button>
        </div>

        {history.length === 0 ? (
          <p className="history-empty">
            {historyLoading
              ? "Loading history..."
              : "No investigations saved yet."}
          </p>
        ) : (
          <div className="history-list">
            {history.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  selectedId === item.id
                    ? "history-item selected"
                    : "history-item"
                }
                onClick={() => void openInvestigation(item.id)}
                disabled={loading}
                title={item.question}
              >
                <span className="history-question">
                  {item.question}
                </span>

                <small>
                  {new Date(item.created_at).toLocaleString()}
                </small>
              </button>
            ))}
          </div>
        )}
      </div>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">CODE INTELLIGENCE</p>
            <h1>Repository Investigation</h1>
            <p className="page-description">
              Ask questions about your codebase using local RAG
              and LangGraph agents.
            </p>
          </div>

          <span className="model-badge">Qwen3:4b · Ollama</span>
        </header>

        <section className="panel">
          <h2>Ask DevPilot</h2>

          <form onSubmit={handleSubmit}>
            <label htmlFor="question" className="field-label">
              Your question
            </label>

            <textarea
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Where is repository ingestion implemented?"
              rows={4}
              maxLength={2000}
              disabled={loading}
            />

            <div className="form-actions">
              <span className="helper-text">
                Evidence comes from your indexed repository.
              </span>

              <div className="action-buttons">
                {loading && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                )}

                <button
                  type="submit"
                  disabled={loading || question.trim().length < 3}
                >
                  {loading ? "Investigating..." : "Investigate"}
                </button>
              </div>
            </div>
          </form>
        </section>

        {loading && (
          <section className="panel" role="status">
            <div className="loading-row">
              <span className="spinner" />
              <div>
                <strong>Agents are investigating...</strong>
                <p className="muted">
                  Retrieving code, generating an answer and
                  reviewing citations.
                </p>
              </div>
            </div>
          </section>
        )}

        {error && (
          <section className="error-panel" role="alert">
            <strong>Investigation failed</strong>
            <p>{error}</p>
          </section>
        )}

        {result && (
          <>
            <section className="panel">
              <div className="result-header">
                <h2>Investigation Result</h2>

                <span
                  className={
                    result.review_passed
                      ? "review-badge passed"
                      : "review-badge failed"
                  }
                >
                  {result.review_passed
                    ? "Review passed"
                    : "Review failed"}
                </span>
              </div>

              {!result.review_passed && (
                <div className="review-warning" role="alert">
                  This answer did not pass review. Do not treat
                  it as verified.
                </div>
              )}

              <div className="answer-text">{result.answer}</div>

              <div className="result-meta">
                <span>Attempts: {result.attempts}</span>
                <span>Sources: {result.sources.length}</span>
              </div>
            </section>

            <section className="panel">
              <h2>Source Evidence</h2>

              {result.sources.length === 0 ? (
                <p className="muted">
                  No supporting source evidence was retrieved.
                </p>
              ) : (
                <div className="sources-list">
                  {result.sources.map((source) => (
                    <div
                      className="source-card"
                      key={source.chunk_id}
                    >
                      <span className="source-label">
                        [{source.source_id}]
                      </span>

                      <div className="source-details">
                        <strong>{source.file_path}</strong>
                        <small>
                          Lines {source.start_line}–
                          {source.end_line}
                        </small>
                        <small>
                          Commit {source.commit_sha.slice(0, 8)}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <h2>Agent Execution</h2>

              <div className="execution-steps">
                <span>Planner</span>
                <span>→</span>
                <span>Retriever</span>
                <span>→</span>
                <span>Analyst</span>
                <span>→</span>
                <span>Reviewer</span>
              </div>

              <div className="execution-details">
                <p>
                  <strong>Plan:</strong> {result.plan}
                </p>
                <p>
                  <strong>Review:</strong> {result.review_feedback}
                </p>
              </div>
            </section>
          </>
        )}

        <section>
          <PatchGenerator onGenerated={setProposalId} />

          {proposalId.trim() && (
            <PatchReview key={proposalId} proposalId={proposalId.trim()} />
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
