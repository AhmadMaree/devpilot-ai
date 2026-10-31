\# DevPilot AI — API Contract



Version: 1.0

Status: Proposed, not implemented

Base path: /api/v1





\## 1. Health



GET /health



Response:

{

&#x20; "status": "ok",

&#x20; "version": "0.1.0"

}



\## 2. Demo Repositories



GET /api/v1/demo/repositories



Response:

{

&#x20; "repositories": \[

&#x20;   {

&#x20;     "id": "demo-react",

&#x20;     "name": "React Demo Application",

&#x20;     "description": "Prepared public demo repository",

&#x20;     "indexed": true,

&#x20;     "commit\_sha": "demo-revision"

&#x20;   }

&#x20; ]

}



The values above are illustrative.





\## 3. Recorded Demo Investigations



GET /api/v1/demo/investigations



Response:

{

&#x20; "investigations": \[

&#x20;   {

&#x20;     "id": "demo-modal-scroll",

&#x20;     "title": "Unexpected modal scrollbar",

&#x20;     "repository\_id": "demo-react",

&#x20;     "mode": "recorded"

&#x20;   }

&#x20; ]

}



GET /api/v1/demo/investigations/{id}



Returns a saved investigation report with:

\- Recorded workflow stages

\- Findings

\- Source references

\- Optional proposed patch

\- Test results only if genuinely recorded



This endpoint must not invoke an LLM.





\## 4. Quick Answer



POST /api/v1/questions



Authentication: Required



Request:

{

&#x20; "repository\_id": "demo-react",

&#x20; "question": "Where is modal height calculated?"

}



Response:

{

&#x20; "answer": "Example response",

&#x20; "citations": \[

&#x20;   {

&#x20;     "repository\_id": "demo-react",

&#x20;     "commit\_sha": "demo-revision",

&#x20;     "path": "src/Modal.tsx",

&#x20;     "start\_line": 20,

&#x20;     "end\_line": 42

&#x20;   }

&#x20; ],

&#x20; "status": "completed"

}



\## 7. Start Investigation



POST /api/v1/investigations



Authentication: Required



Request:

{

&#x20; "repository\_id": "demo-react",

&#x20; "question": "Investigate the modal scrollbar",

&#x20; "mode": "deep"

}



Response:

{

&#x20; "investigation\_id": "UUID",

&#x20; "status": "queued"

}



\## 8. Investigation Status



GET /api/v1/investigations/{id}



Authentication: Required



Response:

{

&#x20; "id": "UUID",

&#x20; "status": "running",

&#x20; "current\_stage": "retrieval",

&#x20; "created\_at": "2026-10-31T00:00:00Z"

}



Possible statuses:

\- queued

\- running

\- waiting\_for\_approval

\- completed

\- failed

\- cancelled



\## 9. Investigation Events



GET /api/v1/investigations/{id}/events



Authentication: Required



Transport: Server-Sent Events (SSE)



Example event:



event: stage\_updated

data: {"stage":"retrieval","status":"completed"}



The client must handle reconnection and duplicate

event delivery.



\## 10. Investigation Report



GET /api/v1/investigations/{id}/report



Authentication: Required



Response includes:

\- Summary

\- Findings

\- Supporting citations

\- Uncertainties

\- Suggested actions

\- Proposed patch, if available

\- Actual validation status, if available



\## 11. Approval



POST /api/v1/investigations/{id}/approval



Authentication: Required



Request:

{

&#x20; "decision": "approve"

}



Possible decisions:

\- approve

\- reject



Approval is valid only for a pending, authorized

operation and does not grant arbitrary code execution.



\## 12. Error Format



{

&#x20; "error": {

&#x20;   "code": "SEARCH\_UNAVAILABLE",

&#x20;   "message": "Repository search is temporarily unavailable.",

&#x20;   "request\_id": "UUID"

&#x20; }

}

