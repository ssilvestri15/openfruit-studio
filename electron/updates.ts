import type { StudioUpdateChannel, StudioUpdatePreference, StudioUpdateResult } from '../shared/updates';

const repository = 'ssilvestri15/openfruit-studio';
export const studioReleasesUrl = `https://github.com/${repository}/releases`;
const versionPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const numericIdentifier = /^\d+$/;

function parseVersion(value: string) {
  const match = versionPattern.exec(value);
  if (!match) return null;
  const prerelease = match[4]?.split('.') ?? [];
  if (prerelease.some(part => /^0\d+$/.test(part))) return null;
  const core = match.slice(1, 4);
  return {
    core: core.map(part => BigInt(part)),
    prerelease,
    label: core.join('.') + (match[4] ? '-' + match[4] : '')
  };
}

type Version = NonNullable<ReturnType<typeof parseVersion>>;

export function studioUpdateChannel(version: string, preference: StudioUpdatePreference = 'auto'): StudioUpdateChannel {
  if (preference !== 'auto') return preference;
  return parseVersion(version)?.prerelease.length ? 'preview' : 'stable';
}

function compareVersions(left: Version, right: Version): number {
  for (const index of [0, 1, 2]) {
    if (left.core[index] !== right.core[index]) return left.core[index] > right.core[index] ? 1 : -1;
  }

  const a = left.prerelease;
  const b = right.prerelease;
  if (!a.length || !b.length) return Number(!a.length) - Number(!b.length);

  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] === b[index]) continue;
    const aNumeric = numericIdentifier.test(a[index]);
    const bNumeric = numericIdentifier.test(b[index]);
    if (aNumeric && bNumeric) return BigInt(a[index]) > BigInt(b[index]) ? 1 : -1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a[index] > b[index] ? 1 : -1;
  }
  return a.length - b.length;
}

export async function checkForStudioUpdate(
  current: string,
  request: (url: string, options: RequestInit) => Promise<Response>,
  channel = studioUpdateChannel(current)
): Promise<StudioUpdateResult> {
  const installed = parseVersion(current);
  if (!installed) return { status: 'unavailable' };
  const preview = channel === 'preview';

  try {
    const endpoint = preview ? 'releases?per_page=100' : 'releases/latest';
    const response = await request(`https://api.github.com/repos/${repository}/${endpoint}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return { status: 'unavailable' };
    const payload = await response.json();
    const releases = preview ? payload : [payload];
    if (!Array.isArray(releases)) return { status: 'unavailable' };
    let bestVersion = installed;
    let bestTag: string | undefined;
    for (const release of releases) {
      if (release?.draft !== false || typeof release.tag_name !== 'string') continue;
      const candidate = parseVersion(release.tag_name);
      if (!candidate) continue;
      const isPrerelease = candidate.prerelease.length > 0;
      if (release.prerelease !== isPrerelease || (isPrerelease && !preview)) continue;
      if (compareVersions(candidate, bestVersion) <= 0) continue;
      bestVersion = candidate;
      bestTag = release.tag_name;
    }
    if (!bestTag) return { status: 'current' };

    return {
      status: 'available',
      update: {
        version: bestVersion.label,
        releaseUrl: `${studioReleasesUrl}/tag/${encodeURIComponent(bestTag)}`
      }
    };
  } catch {
    return { status: 'unavailable' };
  }
}
