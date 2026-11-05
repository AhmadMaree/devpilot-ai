import { useEffect, useState } from "react";

export const destinations = [
  "dashboard",
  "repositories",
  "ai-workspace",
  "review-center",
  "activity",
  "settings",
] as const;

export type Destination = (typeof destinations)[number];

function destinationFromHash(): Destination {
  const hash = window.location.hash.slice(1);
  return destinations.find((destination) => destination === hash) ?? "dashboard";
}

export function useHashNavigation(): Destination {
  const [destination, setDestination] = useState(destinationFromHash);

  useEffect(() => {
    const updateDestination = () => setDestination(destinationFromHash());
    window.addEventListener("hashchange", updateDestination);
    window.addEventListener("popstate", updateDestination);

    return () => {
      window.removeEventListener("hashchange", updateDestination);
      window.removeEventListener("popstate", updateDestination);
    };
  }, []);

  return destination;
}
