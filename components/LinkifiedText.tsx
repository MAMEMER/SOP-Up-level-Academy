import { ExternalLink } from "lucide-react";

// Renders free text where any https:// URL becomes a short "เปิดลิงก์" button instead of the raw
// URL. A long raw URL has no break points, so on a 390px phone it ran ~600px past its box.
const URL_PATTERN = /(https:\/\/[^\s]+)/g;

export function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} className="inline-open-link" href={part} target="_blank" rel="noopener noreferrer" title={part}>
            <ExternalLink size={14} aria-hidden="true" />
            เปิดลิงก์
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}
