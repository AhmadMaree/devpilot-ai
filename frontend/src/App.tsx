
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getSavedInvestigation } from "./api/api";
import { getLLMSelection } from "./api/llm/api";
import { getRepositories } from "./api/repositories";
import { queryKeys } from "./api/queryKeys";
import type { SavedInvestigation } from "./api/types";
import type { KnownPatchProposal, PatchStatus } from "./api/patches/types";
import { LLMModelSelector } from "./components/LLMModelSelector";
import { AppShell } from "./components/AppShell";
import { RepositoryIndexing } from "./components/RepositoryIndexing";
import { AIWorkspace } from "./components/AIWorkspace";
import { ReviewCenter } from "./components/ReviewCenter";
import { Dashboard } from "./components/Dashboard";
import { Activity } from "./components/Activity";
import { useHashNavigation } from "./hooks/useHashNavigation";
import "./App.scss";

interface AppProps {
  onLogout: () => void;
  logoutError: string;
  loggingOut: boolean;
}

function App({ onLogout, logoutError, loggingOut }: AppProps) {
  const queryClient = useQueryClient();
  const destination = useHashNavigation();
  const repositoriesQuery = useQuery({
    queryKey: queryKeys.repositories.all,
    queryFn: ({ signal }) => getRepositories(signal),
  });
  const llmSelectionQuery = useQuery({
    queryKey: queryKeys.llm.selection,
    queryFn: ({ signal }) => getLLMSelection(signal),
  });
  const [repositoryId, setRepositoryId] = useState(
    () => window.localStorage.getItem("devpilot.activeRepositoryId") ?? "",
  );
  const [activeInvestigation, setActiveInvestigation] =
    useState<SavedInvestigation | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  const [proposalId, setProposalId] = useState("");
  const [knownProposals, setKnownProposals] = useState<KnownPatchProposal[]>([]);

  const selectedRepository = repositoriesQuery.data?.find(
    (repository) => repository.id === repositoryId,
  ) ?? repositoriesQuery.data?.[0] ?? null;
  const activeRepositoryId = selectedRepository?.id ?? "";
  const repositoryName = selectedRepository?.name ?? null;

  useEffect(() => {
    if (!repositoriesQuery.isSuccess) return;
    if (selectedRepository) {
      window.localStorage.setItem("devpilot.activeRepositoryId", selectedRepository.id);
    } else {
      window.localStorage.removeItem("devpilot.activeRepositoryId");
    }
  }, [repositoriesQuery.isSuccess, selectedRepository]);

  async function openInvestigation(id: string) {
    setActivityError(null);

    try {
      const saved = await queryClient.fetchQuery({
        queryKey: queryKeys.investigations.detail(id),
        queryFn: ({ signal }) => getSavedInvestigation(id, signal),
      });

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

  const handleRepositoryChange = useCallback((id: string) => {
    setRepositoryId(id);
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
      queryKey: queryKeys.proposals.byRepository(proposal.repository_id),
    });
  }, [queryClient]);

  const handleWorkflowFinished = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.workflows.byRepository(activeRepositoryId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.proposals.byRepository(activeRepositoryId),
    });
  }, [queryClient, activeRepositoryId]);

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
        llmSelectionQuery.data
          ? `${llmSelectionQuery.data.provider} · ${llmSelectionQuery.data.model}`
          : null
      }
      onLogout={onLogout}
      logoutError={logoutError}
      loggingOut={loggingOut}
    >
      {destination === "dashboard" && (
        <>
          {repositoriesQuery.isError && (
            <p className="indexing-error" role="alert">
              Could not load the active repository: {repositoriesQuery.error.message}
            </p>
          )}
          <Dashboard
            repositoryId={activeRepositoryId}
            repositoryLoading={repositoriesQuery.isPending}
            proposals={knownProposals}
            onOpenInvestigation={(id) => void openInvestigation(id)}
            onOpenProposal={handleOpenProposal}
          />
        </>
      )}

      {destination === "repositories" && (
        <RepositoryIndexing
          selectedRepositoryId={activeRepositoryId}
          onRepositoryChange={handleRepositoryChange}
        />
      )}

      {destination === "ai-workspace" && (
        <AIWorkspace
          repositoryId={activeRepositoryId}
          repositoryName={repositoryName}
          restoredInvestigation={activeInvestigation}
          onInvestigationComplete={(saved) => {
            setActiveInvestigation(saved);
            setSelectedId(saved.id);
            void queryClient.invalidateQueries({ queryKey: queryKeys.investigations.all });
          }}
          onOpenProposal={handleOpenProposal}
          onProposalCreated={handleProposalCreated}
          onWorkflowFinished={handleWorkflowFinished}
        />
      )}

      {destination === "review-center" && (
        <ReviewCenter
          repositoryId={activeRepositoryId}
          proposals={knownProposals}
          selectedProposalId={proposalId}
          onSelectProposal={setProposalId}
          onProposalCreated={handleProposalCreated}
          onStatusChange={handleProposalStatusChange}
        />
      )}

      {destination === "activity" && (
        <Activity
          repositoryId={activeRepositoryId}
          selectedInvestigationId={selectedId}
          openError={activityError}
          onOpenInvestigation={(id) => void openInvestigation(id)}
          onOpenProposal={handleOpenProposal}
        />
      )}

      {destination === "settings" && (
        <section className="panel settings-panel">
          <LLMModelSelector />
        </section>
      )}
    </AppShell>
  );
}

export default App;
