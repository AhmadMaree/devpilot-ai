
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getSavedInvestigation } from "./api/api";
import { getLLMSelection } from "./api/llm/api";
import { getRepositories } from "./api/repositories";
import type { SavedInvestigation } from "./api/types";
import type { LLMSelection } from "./api/llm/types";
import type { KnownPatchProposal, PatchStatus } from "./api/patches/types";
import { LLMModelSelector } from "./components/LLMModelSelector";
import { AppShell } from "./components/AppShell";
import { RepositoryIndexing } from "./components/RepositoryIndexing";
import { AIWorkspace } from "./components/AIWorkspace";
import { ReviewCenter } from "./components/ReviewCenter";
import { Dashboard } from "./components/Dashboard";
import { Activity } from "./components/Activity";
import { useHashNavigation } from "./hooks/useHashNavigation";
import "./App.css";

function App() {
  const queryClient = useQueryClient();
  const destination = useHashNavigation();
  const [repositoryId, setRepositoryId] = useState("");
  const [repositoryName, setRepositoryName] = useState<string | null>(null);
  const [repositoryLoading, setRepositoryLoading] = useState(true);
  const [modelSelection, setModelSelection] = useState<LLMSelection | null>(null);
  const [activeInvestigation, setActiveInvestigation] =
    useState<SavedInvestigation | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repositoryLoadError, setRepositoryLoadError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  const [proposalId, setProposalId] = useState("");
  const [knownProposals, setKnownProposals] = useState<KnownPatchProposal[]>([]);

  useEffect(() => {
    let active = true;
    void getRepositories()
      .then((repositories) => {
        if (!active) return;
        const savedId = window.localStorage.getItem("devpilot.activeRepositoryId");
        const selected = repositories.find((repository) => repository.id === savedId)
          ?? repositories[0];
        setRepositoryId(selected?.id ?? "");
        setRepositoryName(selected?.name ?? null);
        if (selected) {
          window.localStorage.setItem("devpilot.activeRepositoryId", selected.id);
        } else {
          window.localStorage.removeItem("devpilot.activeRepositoryId");
        }
        setRepositoryLoading(false);
      })
      .catch((caughtError: unknown) => {
        if (active) {
          setRepositoryLoadError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load repositories.",
          );
          setRepositoryLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void getLLMSelection()
      .then((selection) => {
        if (active) setModelSelection(selection);
      })
      .catch(() => {
        if (active) setModelSelection(null);
      });

    return () => {
      active = false;
    };
  }, []);

  async function openInvestigation(id: string) {
    setActivityError(null);

    try {
      const saved = await getSavedInvestigation(id);

      setSelectedId(saved.id);
      setActiveInvestigation(saved);
      window.location.hash = "ai-workspace";
    } catch (error) {
      setActivityError(
        error instanceof Error
          ? error.message
          : "Could not load investigation",
      );
    }
  }

  const handleRepositoryChange = useCallback((
    id: string,
    name: string | null = null,
  ) => {
    setRepositoryId(id);
    setRepositoryName(name);
    if (id) {
      window.localStorage.setItem("devpilot.activeRepositoryId", id);
    } else {
      window.localStorage.removeItem("devpilot.activeRepositoryId");
    }
  }, []);

  const handleProposalCreated = useCallback((proposal: KnownPatchProposal) => {
    setKnownProposals((current) => [
      ...current.filter((item) => item.id !== proposal.id),
      proposal,
    ]);
    setProposalId(proposal.id);
    void queryClient.invalidateQueries({
      queryKey: ["patch-proposals", proposal.repository_id],
    });
  }, [queryClient]);

  const handleWorkflowFinished = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["development-workflows", repositoryId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["patch-proposals", repositoryId],
    });
  }, [queryClient, repositoryId]);

  const handleOpenProposal = useCallback((id: string) => {
    setProposalId(id);
    window.location.hash = "#review-center";
  }, []);

  const handleProposalStatusChange = useCallback((
    id: string,
    status: PatchStatus,
  ) => {
    setKnownProposals((current) => current.map((proposal) => (
      proposal.id === id ? { ...proposal, status } : proposal
    )));
  }, []);


  return (
    <AppShell
      destination={destination}
      repositoryName={repositoryName}
      modelLabel={
        modelSelection
          ? `${modelSelection.provider} · ${modelSelection.model}`
          : null
      }
    >
      {destination === "dashboard" && (
        <>
          {repositoryLoadError && (
            <p className="indexing-error" role="alert">
              Could not load the active repository: {repositoryLoadError}
            </p>
          )}
          <Dashboard
            repositoryId={repositoryId}
            repositoryLoading={repositoryLoading}
            proposals={knownProposals}
            onOpenInvestigation={(id) => void openInvestigation(id)}
            onOpenProposal={handleOpenProposal}
          />
        </>
      )}

      {destination === "repositories" && (
        <RepositoryIndexing
          selectedRepositoryId={repositoryId}
          onRepositoryChange={handleRepositoryChange}
        />
      )}

      {destination === "ai-workspace" && (
        <AIWorkspace
          repositoryId={repositoryId}
          repositoryName={repositoryName}
          restoredInvestigation={activeInvestigation}
          onInvestigationComplete={(saved) => {
            setActiveInvestigation(saved);
            setSelectedId(saved.id);
            void queryClient.invalidateQueries({ queryKey: ["investigation-history"] });
          }}
          onOpenProposal={handleOpenProposal}
          onProposalCreated={handleProposalCreated}
          onWorkflowFinished={handleWorkflowFinished}
        />
      )}

      {destination === "review-center" && (
        <ReviewCenter
          repositoryId={repositoryId}
          proposals={knownProposals}
          selectedProposalId={proposalId}
          onSelectProposal={setProposalId}
          onProposalCreated={handleProposalCreated}
          onStatusChange={handleProposalStatusChange}
        />
      )}

      {destination === "activity" && (
        <Activity
          repositoryId={repositoryId}
          selectedInvestigationId={selectedId}
          openError={activityError}
          onOpenInvestigation={(id) => void openInvestigation(id)}
          onOpenProposal={handleOpenProposal}
        />
      )}

      {destination === "settings" && (
        <section className="panel settings-panel">
          <LLMModelSelector onSelectionChange={setModelSelection} />
        </section>
      )}
    </AppShell>
  );
}

export default App;
