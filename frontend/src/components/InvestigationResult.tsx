import { useEffect, useRef, useState, type ReactNode } from "react";

import type {
  InvestigationResponse,
  InvestigationSource,
} from "../api/types";

const agentStages = [
  {
    name: "Planner",
    responsibility: "Understands the question and prepares an investigation plan.",
    icon: "plan",
  },
  {
    name: "Retriever",
    responsibility: "Finds relevant source-code evidence.",
    icon: "search",
  },
  {
    name: "Analyst",
    responsibility: "Produces an answer using retrieved evidence.",
    icon: "answer",
  },
  {
    name: "Reviewer",
    responsibility: "Checks that citation labels refer to retrieved evidence.",
    icon: "check",
  },
] as const;

function StageIcon({ name }: { name: (typeof agentStages)[number]["icon"] }) {
  const paths = {
    plan: <><path d="M5 6h14M5 12h14M5 18h9" /><circle cx="3" cy="6" r=".5" /><circle cx="3" cy="12" r=".5" /><circle cx="3" cy="18" r=".5" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    answer: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v9a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4.8a2.5 2.5 0 0 1-1-2z" /><path d="M8 9h8M8 13h5" /></>,
    check: <><path d="m4 12 5 5L20 6" /></>,
  };

  return (
    <svg
      className="agent-stage-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function renderAnswer(
  answer: string,
  sourceById: Map<string, InvestigationSource & { source_id: string }>,
  onSelect: (source: InvestigationSource & { source_id: string }) => void,
): ReactNode[] {
  const citationPattern = /\[((?:S\d+)(?:\s*,\s*S\d+)*)\]/g;
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = citationPattern.exec(answer)) !== null) {
    if (match.index > cursor) {
      parts.push(answer.slice(cursor, match.index));
    }

    const citationIds = match[1].split(",").map((citation) => citation.trim());
    citationIds.forEach((citationId, index) => {
      if (index > 0) {
        parts.push(", ");
      }

      const source = sourceById.get(citationId);
      parts.push(source ? (
        <button
          className="answer-citation"
          type="button"
          key={`citation-${key++}`}
          aria-label={`Go to source [${citationId}]${source.file_path ? `, ${source.file_path}` : ""}`}
          onClick={() => onSelect(source)}
        >
          [{citationId}]
        </button>
      ) : (
        <span
          className="answer-citation-unavailable"
          key={`unavailable-${key++}`}
          title="No matching source evidence was returned"
        >
          [{citationId}]
        </span>
      ));
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < answer.length) {
    parts.push(answer.slice(cursor));
  }

  return parts;
}

function getSourceLabel(source: InvestigationSource): string {
  return source.source_id ? `[${source.source_id}]` : "Source";
}

export function InvestigationResult({ result }: { result: InvestigationResponse }) {
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const sourceById = new Map(
    sources
      .filter((source): source is InvestigationSource & { source_id: string } =>
        typeof source.source_id === "string" && source.source_id.length > 0)
      .map((source) => [source.source_id, source]),
  );
  const sourceRefs = useRef(new Map<string, HTMLElement>());
  const [expandedSources, setExpandedSources] = useState<Set<string>>(() => new Set());
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");

  function selectSource(source: InvestigationSource & { source_id: string }) {
    setSelectedSourceId(source.source_id);
    setExpandedSources((current) => new Set(current).add(source.source_id));
  }

  useEffect(() => {
    if (selectedSourceId) {
      sourceRefs.current
        .get(selectedSourceId)
        ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }
  }, [selectedSourceId]);

  function toggleSource(sourceId: string) {
    setExpandedSources((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  }

  async function copySnippet(source: InvestigationSource) {
    if (typeof navigator.clipboard?.writeText !== "function") {
      setCopyStatus("Copy is unavailable in this browser context.");
      return;
    }

    try {
      await navigator.clipboard.writeText(source.snippet ?? "");
      setCopyStatus("Source code copied.");
    } catch (error) {
      setCopyStatus(
        error instanceof Error
          ? `Could not copy source code: ${error.message}`
          : "Could not copy source code.",
      );
    }
  }

  const citationStatus = result.review_passed === true
    ? "Citation check passed"
    : result.review_passed === false
      ? "Citation check needs attention"
      : "Citation check status unavailable";
  const answer = typeof result.answer === "string" ? result.answer : "";
  const plan = typeof result.plan === "string" ? result.plan : "";
  const reviewFeedback = typeof result.review_feedback === "string"
    ? result.review_feedback
    : "";
  const attempts = typeof result.attempts === "number" ? result.attempts : null;

  return (
    <div className="investigation-result">
      <section className="panel investigation-answer-panel" aria-labelledby="investigation-answer-heading">
        <div className="result-header">
          <div>
            <p className="eyebrow">INVESTIGATION RESULT</p>
            <h2 id="investigation-answer-heading">Answer</h2>
          </div>
          <span
            className={`review-badge ${result.review_passed === true ? "passed" : result.review_passed === false ? "failed" : ""}`}
            role="status"
          >
            {citationStatus}
          </span>
        </div>
        {result.review_passed === false && (
          <div className="review-warning" role="alert">
            Citation validation did not pass. This check does not verify factual correctness.
          </div>
        )}
        {reviewFeedback && (
          <p className="citation-feedback"><strong>Citation check:</strong> {reviewFeedback}</p>
        )}
        <div className="answer-text">
          {renderAnswer(answer, sourceById, selectSource)}
        </div>
        <div className="result-meta">
          {attempts !== null && <span>Answer attempts: {attempts}</span>}
          <span>Sources: {sources.length}</span>
        </div>
      </section>

      <section className="panel investigation-evidence-panel" aria-labelledby="investigation-evidence-heading">
        <div className="investigation-section-heading">
          <div>
            <p className="eyebrow">SUPPORTING MATERIAL</p>
            <h2 id="investigation-evidence-heading">Source evidence</h2>
          </div>
          <span className="investigation-count">{sources.length} {sources.length === 1 ? "source" : "sources"}</span>
        </div>
        {sources.length === 0 ? (
          <p className="muted">No supporting source evidence was returned for this investigation.</p>
        ) : (
          <div className="sources-list">
            {sources.map((source, index) => {
              const sourceId = source.source_id;
              const sourceKey = sourceId ?? source.chunk_id ?? `source-${index}`;
              const expanded = expandedSources.has(sourceKey);
              const snippet = typeof source.snippet === "string" ? source.snippet : "";
              const snippetAvailable = snippet.length > 0;
              const lines = snippet.split(/\r\n|\n|\r/);
              if (snippetAvailable && lines.length > 1 && lines[lines.length - 1] === "" && /(?:\r\n|\n|\r)$/.test(snippet)) {
                lines.pop();
              }
              const cardId = `source-evidence-${sourceKey}`;

              return (
                <article
                  className={`source-card${sourceId && selectedSourceId === sourceId ? " source-card-selected" : ""}`}
                  id={cardId}
                  key={source.chunk_id ?? `${sourceId ?? "source"}-${index}`}
                  ref={sourceId ? (element) => {
                    if (element) sourceRefs.current.set(sourceId, element);
                    else sourceRefs.current.delete(sourceId);
                  } : undefined}
                  tabIndex={-1}
                  aria-label={`${getSourceLabel(source)} ${source.file_path ?? "file path unavailable"}`}
                >
                  <div className="source-card-heading">
                    <span className="source-label">{getSourceLabel(source)}</span>
                    <div className="source-details">
                      <strong>{source.file_path || "File path unavailable"}</strong>
                      {typeof source.start_line === "number" && typeof source.end_line === "number" && (
                        <small>Lines {source.start_line}–{source.end_line}</small>
                      )}
                      {source.commit_sha && <small>Indexed commit {source.commit_sha.slice(0, 8)}</small>}
                    </div>
                    <button
                      type="button"
                      className="source-expand-button"
                      aria-expanded={expanded}
                      aria-controls={`${cardId}-content`}
                      onClick={() => toggleSource(sourceKey)}
                    >
                      {expanded ? "Collapse" : "Expand"}
                      <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                    </button>
                  </div>
                  <div id={`${cardId}-content`} hidden={!expanded} className="source-card-content">
                    {snippetAvailable ? (
                      <>
                        <div className="source-snippet-heading">
                          <span>Indexed source excerpt</span>
                          <button
                            type="button"
                            className="secondary-button source-copy-button"
                            onClick={() => void copySnippet(source)}
                          >
                            Copy Code
                          </button>
                        </div>
                        <div className="source-code-scroll">
                          <pre aria-label={`Source snippet from ${source.file_path ?? "unknown file"}`}>
                            <code>
                              {lines.map((line, lineIndex) => (
                                <span className="source-code-line" key={lineIndex}>
                                  {typeof source.start_line === "number" && (
                                    <span className="source-line-number" aria-hidden="true">
                                      {source.start_line + lineIndex}
                                    </span>
                                  )}
                                  <span className="source-line-content">{line || " "}</span>
                                </span>
                              ))}
                            </code>
                          </pre>
                        </div>
                      </>
                    ) : (
                      <p className="source-unavailable-message">
                        Source code is not included in this investigation. The file path,
                        line range, and indexed commit are shown above.
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {copyStatus && <p className="source-copy-status" role="status">{copyStatus}</p>}
      </section>

      <section className="panel investigation-timeline-panel" aria-labelledby="investigation-timeline-heading">
        <div className="investigation-section-heading">
          <div>
            <p className="eyebrow">HOW THIS RESULT WAS PRODUCED</p>
            <h2 id="investigation-timeline-heading">Agent execution</h2>
          </div>
          <span className="timeline-overview-label">Workflow overview</span>
        </div>
        <ol className="agent-timeline">
          {agentStages.map((stage, index) => {
            const stageStatus = stage.name === "Planner"
              ? (plan ? "Plan available" : "No plan details returned")
              : stage.name === "Retriever"
                ? (sources.length ? `${sources.length} source${sources.length === 1 ? "" : "s"} retrieved` : "No source evidence returned")
                : stage.name === "Analyst"
                  ? (answer ? "Answer returned" : "No answer returned")
                  : citationStatus;
            const stageOutput = stage.name === "Planner"
              ? plan
              : stage.name === "Retriever"
                ? (sources.length
                  ? `Retrieved ${sources.length} source record${sources.length === 1 ? "" : "s"}. Open Source evidence to inspect available metadata.`
                  : "The response contains no source records.")
                : stage.name === "Analyst"
                  ? (attempts === null
                    ? "The answer attempt count is not available."
                    : `Answer generation attempts reported: ${attempts}. Intermediate reasoning is not included.`)
                  : (reviewFeedback || "No citation-check feedback was returned.");

            return (
              <li className="agent-timeline-item" key={stage.name}>
                <span className="agent-timeline-connector" aria-hidden="true" />
                <StageIcon name={stage.icon} />
                <div className="agent-timeline-content">
                  <div className="agent-timeline-heading">
                    <div>
                      <span className="agent-stage-order">STAGE {index + 1}</span>
                      <h3>{stage.name}</h3>
                    </div>
                    <span className={`agent-stage-status${stage.name === "Reviewer" && result.review_passed === false ? " agent-stage-status-warning" : ""}`}>
                      {stageStatus}
                    </span>
                  </div>
                  <p>{stage.responsibility}</p>
                  <details>
                    <summary>Available details</summary>
                    <p>{stageOutput}</p>
                  </details>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="timeline-accuracy-note">
          The Reviewer checks citation labels against retrieved sources; it does not verify
          factual correctness. Per-agent timing and execution statuses are not returned by the API.
        </p>
      </section>
    </div>
  );
}
