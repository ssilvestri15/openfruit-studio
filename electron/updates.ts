import type { StudioUpdate } from '../shared/updates';

const repository = 'ssilvestri15/openfruit-studio';
const versionPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export async function checkForStudioUpdate(
  current: string,
  request: (url: string, options: RequestInit) => Promise<Response>
): Promise<StudioUpdate | null> {
  const installed = versionPattern.exec(current);
  if (!installed) return null;

  try {
    const response = await request(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const release = await response.json();
    if (release?.draft !== false || release?.prerelease !== false || typeof release.tag_name !== 'string') return null;
    const latest = versionPattern.exec(release.tag_name);
    if (!latest || latest[4]) return null;

    let newer = Boolean(installed[4]);
    for (const part of [1, 2, 3]) {
      const difference = BigInt(latest[part]) - BigInt(installed[part]);
      if (difference === 0n) continue;
      newer = difference > 0n;
      break;
    }
    if (!newer) return null;

    return {
      version: latest.slice(1, 4).join('.'),
      releaseUrl: `https://github.com/${repository}/releases/tag/${encodeURIComponent(release.tag_name)}`
    };
  } catch {
    return null;
  }
}
