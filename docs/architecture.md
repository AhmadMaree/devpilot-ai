\# DevPilot AI — System Architecture

Version: 1.0



\## 1. Architecture Style



DevPilot uses a modular monolith backend with

separate ingestion, retrieval, AI orchestration,

persistence, and API modules.



The frontend is a separate React application.



This avoids unnecessary microservices while keeping

clear boundaries for testing and future scaling.



\## 2. Main Components



\### Frontend

Technology:

\- React

\- TypeScript

\- Vite

\- TanStack Query

\- React Router



\### Backend API

Technology:

\- Python

\- FastAPI

\- Pydantic



\### Ingestion Service



Responsibilities:

\- Import approved public repositories

\- Validate file types and sizes

\- Exclude generated and sensitive content

\- Normalize source documents

\- Create chunks

\- Preserve source metadata

\- Maintain revision-aware index records



\### Retrieval Service



Responsibilities:

\- Keyword retrieval

\- Vector retrieval

\- Hybrid retrieval

\- Metadata filtering

\- Result ranking

\- Evidence packaging



\### RAG Service



Responsibilities:

\- Receive questions

\- Retrieve relevant evidence

\- Build bounded model context

\- Generate grounded answers

\- Return source references

\- Handle insufficient evidence



\### LangGraph Orchestrator

Workflow:



START

&#x20; |

&#x20; v

Planner

&#x20; |

&#x20; v

Retriever

&#x20; |

&#x20; v

Code Analyst

&#x20; |

&#x20; v

Reviewer

&#x20; |

&#x20; v

Report Generator

&#x20; |

&#x20; v

END





\### Persistence

Local:

\- SQLite for application state

\- Local search and vector indexes

\- Local files for approved demo artifacts



Azure:

\- Cosmos DB if eligible and justified

\- Azure AI Search Free tier if available

\- Azure Blob Storage if needed



Persistence adapters isolate implementation details.



\## 3. AI Model Strategy

Local development:

\- Ollama with Qwen3:4b

\- Local embedding model



Cloud deployment:

\- Azure OpenAI, if subscription and quota permit

\- Azure AI Search for cloud retrieval



\## 9. Failure Handling



The system must handle:

\- LLM unavailable

\- Search unavailable

\- No relevant documents

\- Ingestion failure

\- Invalid repository

\- Authentication failure

\- Workflow timeout

\- Usage limit reached

\- Backend cold start

\- Interrupted investigation



