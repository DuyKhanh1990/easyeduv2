/**
 * Convert persisted media URLs into URLs the current web app can load.
 *
 * Uploaded files are stored as S3 URLs. The web app serves those files
 * through the same-origin proxy so private buckets and proxied Replit hosts
 * work consistently. Temporary browser URLs must remain untouched while a
 * file is being selected in a dialog.
 */
export function toMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith("/") ||
    url.startsWith("//")
  ) {
    return url;
  }

  const proxyMatch = url.match(/\/api\/media\/proxy\?url=([^&]+)/);
  if (proxyMatch) return `/api/media/proxy?url=${proxyMatch[1]}`;

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return `/api/media/proxy?url=${encodeURIComponent(url)}`;
  }

  return url;
}