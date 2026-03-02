const SKIP_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "heic",
  "zip", "rar", "7z", "gz", "br", "zst",
  "mp4", "mkv", "mov", "avi", "webm",
  "mp3", "aac", "ogg", "flac", "wma",
]);

function shouldSkip(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return (
    SKIP_EXTS.has(ext) ||
    file.type.startsWith("image/") ||
    file.type.startsWith("video/") ||
    file.type.startsWith("audio/")
  );
}

/**
 * Gzip-compresses a file using the browser's built-in CompressionStream.
 * Returns the original file unchanged for already-compressed formats.
 * Compressed files are named `originalname.gz`.
 */
export async function compressFile(file: File): Promise<File> {
  if (shouldSkip(file)) return file;
  const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
  const blob = await new Response(stream).blob();
  return new File([blob], `${file.name}.gz`, { type: "application/gzip" });
}

/**
 * Decompresses a gzip blob if `storedName` ends in `.gz`.
 * Returns the decompressed blob and the original filename (without `.gz`).
 */
export async function decompressBlob(
  blob: Blob,
  storedName: string
): Promise<{ blob: Blob; name: string }> {
  if (!storedName.endsWith(".gz")) return { blob, name: storedName };
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  const out = await new Response(stream).blob();
  return { blob: out, name: storedName.slice(0, -3) };
}
