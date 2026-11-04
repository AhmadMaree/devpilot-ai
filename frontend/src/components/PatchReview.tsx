
import { useEffect, useState } from "react";

import {
  approvePatch,
  getPatchPreview,
  rejectPatch,
} from "../api/patches/api";

import type {PatchPreview} from "../api/patches/types"

import { PatchDiffViewer } from "./PatchDiffViewer";

interface PatchReviewProps {
  proposalId: string;
}

export function PatchReview({
  proposalId,
}: PatchReviewProps) {
  const [proposal, setProposal] =
    useState<PatchPreview | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);
    setProposal(null);
    setMessage(null);

    getPatchPreview(proposalId)
      .then((data) => {
        if (active) setProposal(data);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load proposal",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [proposalId]);

  async function handleAction(
    action: "approve" | "reject",
  ) {
    if (!proposal || submitting) return;

    if (action === "approve") {
      const confirmed = window.confirm(
        `Apply the proposed change to ${proposal.file_path}?`,
      );

      if (!confirmed) return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const result =
        action === "approve"
          ? await approvePatch(proposalId)
          : await rejectPatch(proposalId);

      setProposal((current) =>
        current
          ? { ...current, status: result.status }
          : current,
      );

      setMessage(result.message);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Patch action failed",
      );

      // Refresh the status because a conflict may mean
      // another request already changed the proposal.
      try {
        const latest = await getPatchPreview(proposalId);
        setProposal(latest);
      } catch {
        // Preserve the original error.
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Loading patch proposal...</p>;

  if (error && !proposal) {
    return <p role="alert">{error}</p>;
  }

  if (!proposal) {
    return <p>Patch proposal not found.</p>;
  }

  const canReview =
    proposal.status === "pending" && !submitting;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <header>
        <h2>Patch Review</h2>
        <p>File: {proposal.file_path}</p>
        <p>Status: {proposal.status}</p>
      </header>

      <p>{proposal.explanation}</p>

      <PatchDiffViewer diff={proposal.diff} />

      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      <div style={{ display: "flex", gap: 12 }}>
        <button
          type="button"
          disabled={!canReview}
          onClick={() => void handleAction("approve")}
        >
          {submitting ? "Processing..." : "Approve patch"}
        </button>

        <button
          type="button"
          disabled={!canReview}
          onClick={() => void handleAction("reject")}
        >
          Reject
        </button>
      </div>
    </section>
  );
}
