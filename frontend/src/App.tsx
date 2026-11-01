import { useQuery } from "@tanstack/react-query";
import { getHealth } from "./api/api";
import { useMemo } from "react";


const App = () => {

  const health = useQuery({
    queryKey:["health"],
    queryFn: getHealth,
    retry: false,
    refetchInterval:30000
  })

  const backendStatus = useMemo(() => {
    const status = health.isPending? "Checking...": health.isError? "Offline" : "Connected"
    return status
  },[health])

  return (
     <main className="app">
      <header className="header">
        <div>
          <h1>DevPilot AI</h1>
          <p>Multi-Agent Software Engineering Assistant</p>
        </div>

        <span
          className="status"
          role="status"
          aria-live="polite"
        >
          Backend: {backendStatus}
        </span>
      </header>

      <section className="hero">
        <p className="eyebrow">Engineering intelligence</p>

        <h2>Understand your code. Investigate faster.</h2>

        <p>
          DevPilot will combine source-grounded RAG
          with LangGraph investigations to help
          developers understand software repositories.
        </p>

        <div className="features">
          <article>
            <h3>Repository Explorer</h3>
            <p>Coming in Milestone 4</p>
          </article>

          <article>
            <h3>RAG Assistant</h3>
            <p>Coming in Milestone 6</p>
          </article>

          <article>
            <h3>Multi-Agent Investigations</h3>
            <p>Coming in Milestone 11</p>
          </article>
        </div>
      </section>

      <footer>
        <span>DevPilot AI · Local Development</span>
        <span>
          API Version: {health.data?.version ?? "Unavailable"}
        </span>
      </footer>
    </main>
  )
}

export default App;