import type { Octokit } from 'octokit';

/**
 * Adds in-memory caching for read-only GitHub API calls on the Octokit instance.
 * Caches rest methods starting with 'get' or 'list', paginate, and graphql calls.
 */
export function addOctokitCache(octokit: Octokit): void {
  const cache = new Map<string, any>();
  // Wrap rest.* methods (get and list)
  if (octokit.rest) {
    for (const areaKey of Object.keys(octokit.rest)) {
      const area = (octokit.rest as any)[areaKey];
      if (typeof area !== 'object') continue;
      for (const methodName of Object.keys(area)) {
        const orig = (area as any)[methodName];
        if (typeof orig !== 'function') continue;
        if (/^(get|list)/.test(methodName)) {
          (area as any)[methodName] = async function(...args: any[]) {
            const key = `rest.${areaKey}.${methodName}:${JSON.stringify(args)}`;
            if (cache.has(key)) {
              return cache.get(key);
            }
            const result = await orig.apply(this, args);
            cache.set(key, result);
            return result;
          };
        }
      }
    }
  }
  // Wrap paginate
  if (typeof (octokit as any).paginate === 'function') {
    const origPaginate = (octokit as any).paginate.bind(octokit);
    (octokit as any).paginate = async function(...args: any[]) {
      const key = `paginate:${JSON.stringify(args)}`;
      if (cache.has(key)) {
        return cache.get(key);
      }
      const result = await origPaginate(...args);
      cache.set(key, result);
      return result;
    };
  }
  // Wrap graphql
  if (typeof (octokit as any).graphql === 'function') {
    const origGraphql = (octokit as any).graphql.bind(octokit);
    (octokit as any).graphql = async function(...args: any[]) {
      const key = `graphql:${JSON.stringify(args)}`;
      if (cache.has(key)) {
        return cache.get(key);
      }
      const result = await origGraphql(...args);
      cache.set(key, result);
      return result;
    };
  }
}