import dns from 'node:dns/promises';

type CheckStatus = 'available' | 'taken' | 'invalid' | 'rate_limited';

export interface DomainResult {
  domain: string;
  status: CheckStatus;
  message: string;
}

const CACHE_VERSION = 2;
const rdapCache = new Map<string, { timestamp: number; version: number; value: DomainResult }>();
const benignDnsErrors = new Set([
  'ENODATA',
  'ENOTFOUND',
  'ESERVFAIL',
  'ETIMEOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENFILE',
  'FORMERR',
  'NOTFOUND',
]);

function normalizeDomain(value: string): string {
  let domain = value.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.replace(/^www\./, '');
  domain = domain.replace(/[\s\/]+$/, '');
  return domain;
}

function isDomainValid(domain: string): boolean {
  return /^[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/i.test(domain);
}

function isDnsMiss(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
  return benignDnsErrors.has(code);
}

async function checkDnsRegistration(domain: string): Promise<DomainResult | null> {
  const lookups: Array<Promise<{ type: string; values: string[] } | null>> = [
    dns.resolve4(domain).then((values) => (values.length ? { type: 'A', values } : null)).catch((error) => {
      if (isDnsMiss(error)) return null;
      throw error;
    }),
    dns.resolve6(domain).then((values) => (values.length ? { type: 'AAAA', values } : null)).catch((error) => {
      if (isDnsMiss(error)) return null;
      throw error;
    }),
    dns.resolveCname(domain).then((values) => (values.length ? { type: 'CNAME', values } : null)).catch((error) => {
      if (isDnsMiss(error)) return null;
      throw error;
    }),
    dns.resolveMx(domain).then((values) => (values.length ? { type: 'MX', values: values.map((item) => item.exchange) } : null)).catch((error) => {
      if (isDnsMiss(error)) return null;
      throw error;
    }),
    dns.resolveNs(domain).then((values) => (values.length ? { type: 'NS', values } : null)).catch((error) => {
      if (isDnsMiss(error)) return null;
      throw error;
    }),
    dns.resolveTxt(domain).then((values) => {
      const flattened = values.flat().filter(Boolean);
      return flattened.length ? { type: 'TXT', values: flattened } : null;
    }).catch((error) => {
      if (isDnsMiss(error)) return null;
      throw error;
    }),
    dns.resolveSoa(domain).then((soa) => (soa?.nsname ? { type: 'SOA', values: [soa.nsname] } : null)).catch((error) => {
      if (isDnsMiss(error)) return null;
      throw error;
    }),
  ];

  const records = await Promise.all(lookups);
  const found = records.find(Boolean);
  if (!found) {
    return null;
  }

  return {
    domain,
    status: 'taken',
    message: 'Registered',
  };
}

export async function checkDomainAvailability(domainRaw: string): Promise<DomainResult> {
  const domain = normalizeDomain(domainRaw);
  if (!domain || !isDomainValid(domain)) {
    return { domain: domainRaw, status: 'invalid', message: 'Invalid domain format' };
  }

  try {
    const dnsResult = await checkDnsRegistration(domain);
    if (dnsResult) {
      return dnsResult;
    }
  } catch {
    // If DNS cannot prove registration, fall back to RDAP.
  }

  const cached = rdapCache.get(domain);
  const oneHour = 1000 * 60 * 60;
  if (cached && cached.version === CACHE_VERSION && Date.now() - cached.timestamp < oneHour) {
    return cached.value;
  }

  const endpoint = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'User-Agent': 'BulkDomainChecker/1.0',
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    let result: DomainResult;
    if (res.status === 404) {
      result = { domain, status: 'available', message: 'Available' };
    } else if (res.status === 429) {
      result = { domain, status: 'available', message: 'rate_limited: RDAP lookup was limited' };
    } else if (res.status >= 200 && res.status < 400) {
      result = { domain, status: 'taken', message: 'Registered' };
    } else {
      result = { domain, status: 'available', message: `rate_limited: RDAP returned status ${res.status}` };
    }

    rdapCache.set(domain, { timestamp: Date.now(), version: CACHE_VERSION, value: result });
    return result;
  } catch (e) {
    return { domain, status: 'available', message: 'rate_limited: RDAP lookup failed' };
  }
}
