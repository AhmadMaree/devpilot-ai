# DevPilot AI

### Multi-Agent AI Engineering Assistant

**DevPilot AI** is a cloud-deployed, full-stack AI engineering assistant that helps developers understand, investigate, and work with existing codebases using retrieval-augmented generation (RAG) and multi-agent workflows.

Built with **LangGraph, FastAPI, React, Azure OpenAI, and Azure AI Search**, DevPilot AI connects repository knowledge with AI-assisted investigation, code generation, and review workflows.

**[Live Demo](https://devpilot-frontend-dev.bravegrass-915607b9.italynorth.azurecontainerapps.io)** | **[GitHub Repository](https://github.com/AhmadMaree/devpilot-ai)**

---

## Overview

Understanding an unfamiliar codebase, locating relevant implementation details, and preparing changes can be time-consuming.

DevPilot AI brings these activities into one application by combining repository ingestion, semantic search, contextual question answering, and agent-based development workflows.

Developers can import a GitHub repository, explore its contents using natural language, investigate implementation details, and generate proposed code patches for review.

## Key Features

### Repository Ingestion

- Import public GitHub repositories.
- Process repository source files for AI-assisted retrieval.
- Store repository snapshots using Azure Blob Storage.
- Index searchable code content using Azure AI Search.

### AI-Powered Codebase Q&A

- Ask natural-language questions about an indexed repository.
- Retrieve relevant source-code context using RAG.
- Generate contextual answers using Azure OpenAI.
- Help developers locate implementation details and understand code structure.

### Multi-Agent Investigation

- Orchestrate investigation workflows using LangGraph.
- Retrieve relevant repository context.
- Analyze developer questions and implementation tasks.
- Produce investigation results to support development decisions.

### AI Developer Agent

- Generate proposed code patches based on repository context.
- Support a structured patch-generation workflow.
- Present generated changes for developer inspection.

### Review and Approval Workflow

- Support review and QA stages for generated changes.
- Provide an approval step before accepting proposed changes.
- Keep developers involved in AI-assisted code modifications.

### Cloud Deployment

- React and TypeScript frontend.
- Python FastAPI backend.
- Dockerized application components.
- Azure Container Apps hosting.
- PostgreSQL persistence.
- GitHub Actions continuous integration.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI, Pydantic |
| Agent orchestration | LangGraph |
| LLM | Azure OpenAI |
| Embeddings | Azure OpenAI embeddings |
| Retrieval | Azure AI Search |
| Object storage | Azure Blob Storage |
| Database | PostgreSQL |
| Containers | Docker |
| Hosting | Azure Container Apps |
| CI | GitHub Actions |
| Container registry | GitHub Container Registry (GHCR) |

---

## System Architecture

DevPilot AI separates its user interface, backend APIs, AI workflows, and cloud data services.

```text
                 Developer / Browser
                          |
                          v
                React + TypeScript
                    Frontend
                          |
                          v
                  FastAPI Backend
                          |
            +-------------+-------------+
            |             |             |
            v             v             v
       Repository       Codebase      Investigation
        Ingestion         Q&A           Workflow
            |             |             |
            v             v             v
       Azure Blob     Azure AI       LangGraph
        Storage        Search          Agents
            |             |             |
            +-------------+-------------+
                          |
                          v
                    Azure OpenAI
                          |
                          v
                  Developer Agent
                          |
                          v
                  Proposed Code Patch
                          |
                          v
                  Review / QA / Approval

       PostgreSQL — Application Persistence
       Azure Container Apps — Cloud Hosting
       GitHub Actions — Continuous Integration
```

The frontend and backend are deployed as separate Azure Container Apps.

---

## Retrieval-Augmented Generation (RAG)

DevPilot AI uses RAG to provide repository-aware responses rather than relying exclusively on the language model's general knowledge.

### Ingestion Pipeline

1. A developer submits a GitHub repository.
2. The backend retrieves and processes repository files.
3. Repository content is prepared for indexing.
4. Embeddings are generated using the configured embedding model.
5. Indexed content is stored in Azure AI Search.
6. Repository snapshots are maintained in Azure Blob Storage.

### Retrieval Pipeline

1. The developer submits a question or investigation request.
2. The backend searches the indexed repository.
3. Relevant code context is retrieved.
4. The retrieved context is provided to the language model.
5. The application generates a repository-aware response.

This approach enables questions such as:

- Where is repository ingestion implemented?
- How does the authentication workflow work?
- Which files handle API requests?
- Where is a specific service or function defined?
- What parts of the codebase are relevant to a requested change?

---

## Multi-Agent Development Workflow

DevPilot AI uses LangGraph to coordinate AI-assisted engineering tasks.

### Investigation

The investigation workflow gathers relevant repository context and analyzes the developer's request.

### Patch Generation

The Developer Agent uses the investigation results and retrieved code context to propose implementation changes.

### Review and QA

Generated changes can be inspected through review and QA stages before developer approval.

### Human Oversight

DevPilot AI is designed as an AI-assisted engineering tool, not an autonomous replacement for developer judgment. Generated changes should be reviewed and validated before use.

---

## Azure Deployment

DevPilot AI is hosted on Microsoft Azure using containerized frontend and backend applications.

| Azure Service | Purpose |
|---|---|
| Azure Container Apps | Host frontend and backend |
| Azure OpenAI | LLM inference and embeddings |
| Azure AI Search | Repository retrieval and indexing |
| Azure Blob Storage | Repository snapshot storage |
| Azure Database for PostgreSQL | Persistent application data |

The deployment uses publicly accessible HTTPS endpoints provided by Azure Container Apps.

### Live Application

[Open DevPilot AI](https://devpilot-frontend-dev.bravegrass-915607b9.italynorth.azurecontainerapps.io)

The application is configured as a private, authenticated workspace. Public visitors may encounter a login screen rather than an unrestricted demo.

---

## Continuous Integration

The GitHub Actions workflow supports automated quality checks and container-image publishing.

The CI pipeline includes:

- Python linting and automated tests.
- Frontend linting and production build.
- Dependency security auditing.
- Docker image builds.
- Container image publishing to GHCR.

Azure Container Apps deployment is managed separately from the CI pipeline.

---

## Local Development

### Prerequisites

- Python and pip
- Node.js and npm
- Git
- Access to the required AI and Azure services
- PostgreSQL or the configured database connection

### Clone the Repository

```powershell
git clone https://github.com/AhmadMaree/devpilot-ai.git
cd devpilot-ai
```

### Backend

From the backend directory, create a Python virtual environment and install the project's dependencies.

```powershell
cd backend

python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
```

Configure the required environment variables for database connectivity, Azure services, authentication, and LLM access.

Start the FastAPI application using the backend's configured ASGI entry point.

### Frontend

```powershell
cd frontend

npm install
npm run dev
```

Configure the frontend API endpoint to communicate with the backend.

**Note:** Exact environment-variable names, backend startup commands, and local service requirements should be taken from the current repository configuration.

---

## Security Considerations

DevPilot AI includes authentication and protected API access.

The project uses environment-based configuration for sensitive service credentials and connection settings.

For deployment:

- Keep API keys and database passwords out of source control.
- Store production secrets in secure application configuration.
- Restrict access to sensitive cloud resources.
- Review AI-generated code before applying changes.
- Apply appropriate network and database access restrictions.

The current application is intended as a private workspace rather than a public multi-tenant SaaS product.

---

## Demo Walkthrough

A typical DevPilot AI workflow is:

1. Sign in to the application.
2. Import a public GitHub repository.
3. Wait for repository ingestion and indexing.
4. Ask a question about the repository.
5. Run an AI investigation.
6. Generate a proposed code patch.
7. Review the generated changes.
8. Complete the review and approval workflow.

### Suggested Demo Question

**Where is repository ingestion implemented, and how does the API trigger it?**

This demonstrates repository retrieval, code understanding, and contextual question answering.

---

## Current Scope and Limitations

DevPilot AI is a capstone engineering project focused on practical AI-assisted development workflows.

Current considerations include:

- The application uses a private authenticated workspace.
- Generated patches require human review and validation.
- Deployment to Azure Container Apps is managed separately from CI.
- AI-generated results depend on the selected model and retrieved repository context.
- Production-grade multi-user isolation and fully automated delivery are outside the current project scope.

---

## Future Improvements

Potential enhancements include:

- Automated pull-request creation.
- GitHub webhook integrations.
- Expanded automated patch testing.
- More advanced code-review evaluation.
- Multi-user workspaces with repository-level access controls.
- Additional observability and agent execution tracing.
- Fully automated Azure deployment.

---

## Project Purpose

DevPilot AI was developed as a practical AI engineering capstone demonstrating the integration of:

- Full-stack application development.
- Agentic AI orchestration.
- Retrieval-augmented generation.
- Cloud-native architecture.
- Azure AI services.
- Containerization and CI.
- Human-in-the-loop AI development workflows.

The project combines software engineering experience with modern AI application architecture to explore how AI agents can support real development tasks.

---

## Author

**Ahmad Maree**

[GitHub](https://github.com/AhmadMaree)

## License

This project is licensed under the MIT License.
See the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 Ahmad Maree.

---
*DevPilot AI — AI-assisted software engineering powered by RAG, LangGraph, and Azure.*
