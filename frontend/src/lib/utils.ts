export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1_048_576).toFixed(2)} MB`;
}

export function fileEmoji(mime: string, name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎵";
  if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) return "📦";
  if (["js", "ts", "jsx", "tsx", "py", "rs", "go", "java"].includes(ext)) return "💻";
  if (ext === "pdf") return "📑";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (mime.startsWith("text/") || ["md", "txt"].includes(ext)) return "📄";
  return "📁";
}
