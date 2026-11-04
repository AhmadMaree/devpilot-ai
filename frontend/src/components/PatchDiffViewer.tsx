
interface PatchDiffViewerProps {
  diff: string;
}

export function PatchDiffViewer({
  diff,
}: PatchDiffViewerProps) {
  const lines = diff.split("\n");

  return (
    <div
      style={{
        overflowX: "auto",
        border: "1px solid #d1d5db",
        borderRadius: 8,
        fontFamily: "monospace",
        fontSize: 13,
      }}
    >
      {lines.map((line, index) => {
        const isAdded =
          line.startsWith("+") &&
          !line.startsWith("+++");

        const isRemoved =
          line.startsWith("-") &&
          !line.startsWith("---");

        const background = isAdded
          ? "#dcfce7"
          : isRemoved
            ? "#fee2e2"
            : "#ffffff";

        return (
          <div
            key={index}
            style={{
              background,
              padding: "3px 12px",
              whiteSpace: "pre",
            }}
          >
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}
