interface PatchDiffViewerProps {
  diff: string;
}

export function PatchDiffViewer({ diff }: PatchDiffViewerProps) {
  const lines = diff.split("\n");

  return (
    <div
      className="patch-diff"
      role="region"
      aria-label="Unified patch diff"
      tabIndex={0}
    >
      <pre>
        <code>
          {lines.map((line, index) => {
            const kind = line.startsWith("@@")
              ? "diff-hunk"
              : line.startsWith("+++") || line.startsWith("---")
                ? "diff-header"
                : line.startsWith("+")
                  ? "diff-added"
                  : line.startsWith("-")
                    ? "diff-removed"
                    : "diff-context";

            return (
              <span className={`patch-diff-line ${kind}`} key={`${index}-${line}`}>
                <span className="patch-diff-line-number" aria-hidden="true">
                  {index + 1}
                </span>
                <span>{line || " "}</span>
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
