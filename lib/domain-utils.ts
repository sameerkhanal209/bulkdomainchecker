import dns from 'node:dns/promises';

type CheckStatus = 'available' | 'taken' | 'invalid' | 'rate_limited';

export interface DomainResult {
  domain: string;
  status: CheckStatus;
  message: string;
}

export interface WhoisResult {
  domain: string;
  status: 'found' | 'not_found' | 'invalid' | 'error';
  message: string;
  registrar?: string;
  registrarIanaId?: string;
  abuseEmail?: string;
  abusePhone?: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  dnssec?: string;
  registryDomainId?: string;
  nameservers?: string[];
  statuses?: string[];
  contacts?: WhoisContact[];
  notices?: string[];
  links?: string[];
}

export interface WhoisContact {
  role: string;
  name?: string;
  organization?: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  address?: string;
}

export interface DnsLookupResult {
  domain: string;
  status: 'found' | 'invalid' | 'error';
  message: string;
  records: {
    A: string[];
    AAAA: string[];
    CNAME: string[];
    MX: string[];
    NS: string[];
    TXT: string[];
    SOA: string[];
  };
}

type DnsRecordMap = DnsLookupResult['records'];
type RdapBootstrap = {
  services?: Array<[string[], string[]]>;
};

const CACHE_VERSION = 2;
const rdapCache = new Map<string, { timestamp: number; version: number; value: DomainResult }>();
const rdapBootstrapCache = new Map<string, { timestamp: number; endpoints: string[] }>();
const rdapEndpointOverrides: Record<string, string[]> = {
  me: ['https://rdap.nic.me', 'https://rdap.org'],
};
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

function getEventDate(events: Array<{ eventAction?: string; eventDate?: string }> | undefined, actions: string[]) {
  return events?.find((event) => event.eventAction && actions.includes(event.eventAction))?.eventDate;
}

function getRegistrarName(entities: Array<{ roles?: string[]; vcardArray?: unknown[]; handle?: string }> | undefined) {
  const registrar = entities?.find((entity) => entity.roles?.includes('registrar'));
  if (!registrar) {
    return undefined;
  }

  const vcardArray = Array.isArray(registrar.vcardArray) ? registrar.vcardArray : [];
  const fields = Array.isArray(vcardArray[1]) ? vcardArray[1] : [];

  for (const field of fields) {
    if (Array.isArray(field) && (field[0] === 'fn' || field[0] === 'org')) {
      return String(field[3] ?? field[2] ?? registrar.handle ?? '').trim() || undefined;
    }
  }

  return registrar.handle;
}

function getEntityByRole(
  entities: Array<{ roles?: string[]; vcardArray?: unknown[]; handle?: string; publicIds?: Array<{ type?: string; identifier?: string }> }> | undefined,
  role: string,
) {
  return entities?.find((entity) => entity.roles?.includes(role));
}

function getPublicId(entity: { publicIds?: Array<{ type?: string; identifier?: string }> } | undefined, type: string) {
  return entity?.publicIds?.find((item) => item.type?.toLowerCase() === type.toLowerCase())?.identifier;
}

function readVcardFields(vcardArray: unknown[] | undefined) {
  const fields = Array.isArray(vcardArray?.[1]) ? (vcardArray?.[1] as unknown[]) : [];

  const data: {
    name?: string;
    organization?: string;
    email?: string;
    phone?: string;
    country?: string;
    city?: string;
    address?: string;
  } = {};

  for (const field of fields) {
    if (!Array.isArray(field) || field.length < 4) {
      continue;
    }

    const key = String(field[0] ?? '');
    const params = typeof field[1] === 'object' && field[1] ? (field[1] as Record<string, unknown>) : {};
    const value = field[3];

    if (key === 'fn' && typeof value === 'string') {
      data.name = value.trim() || data.name;
    }

    if (key === 'org') {
      if (typeof value === 'string') {
        data.organization = value.trim() || data.organization;
      } else if (Array.isArray(value) && typeof value[0] === 'string') {
        data.organization = value[0].trim() || data.organization;
      }
    }

    if (key === 'email' && typeof value === 'string') {
      data.email = value.replace(/^mailto:/i, '').trim() || data.email;
    }

    if (key === 'tel' && typeof value === 'string') {
      data.phone = value.replace(/^tel:/i, '').trim() || data.phone;
    }

    if (key === 'adr' && Array.isArray(value)) {
      const parts = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
      const countryName = typeof params.cc === 'string' ? params.cc.trim() : '';
      const city = parts[3] || undefined;
      const country = parts[6] || countryName || undefined;
      const address = parts.slice(0, 3).concat(parts[4], parts[5]).filter(Boolean).join(', ');

      data.city = city || data.city;
      data.country = country || data.country;
      data.address = address || data.address;
    }
  }

  return data;
}

function extractWhoisContacts(
  entities: Array<{ roles?: string[]; vcardArray?: unknown[]; handle?: string; entities?: Array<{ roles?: string[]; vcardArray?: unknown[]; handle?: string }> }> | undefined,
) {
  const contacts: WhoisContact[] = [];

  function visitEntity(entity: { roles?: string[]; vcardArray?: unknown[]; handle?: string; entities?: Array<{ roles?: string[]; vcardArray?: unknown[]; handle?: string }> }) {
    const roles = entity.roles ?? [];
    const role = roles.find((item) => item !== 'registrar');
    const fields = readVcardFields(entity.vcardArray);

    if (role && (fields.name || fields.organization || fields.email || fields.phone || fields.country || fields.city || fields.address)) {
      contacts.push({
        role,
        ...fields,
      });
    }

    for (const child of entity.entities ?? []) {
      visitEntity(child);
    }
  }

  for (const entity of entities ?? []) {
    visitEntity(entity);
  }

  const unique = new Map<string, WhoisContact>();
  for (const contact of contacts) {
    const key = [contact.role, contact.name, contact.organization, contact.email, contact.phone, contact.country, contact.city, contact.address].join('|');
    if (!unique.has(key)) {
      unique.set(key, contact);
    }
  }

  return Array.from(unique.values());
}

function getAbuseContact(
  entities: Array<{ roles?: string[]; vcardArray?: unknown[]; handle?: string; entities?: Array<{ roles?: string[]; vcardArray?: unknown[]; handle?: string }> }> | undefined,
) {
  const abuseEntity = entities?.find((entity) => entity.roles?.includes('abuse'));
  if (!abuseEntity) {
    return {};
  }

  const fields = readVcardFields(abuseEntity.vcardArray);
  return {
    abuseEmail: fields.email,
    abusePhone: fields.phone,
  };
}

function getNotices(notices: Array<{ title?: string; description?: string[] }> | undefined) {
  return notices?.flatMap((notice) => {
    const parts = [notice.title, ...(notice.description ?? [])].filter(Boolean) as string[];
    return parts.length ? [parts.join(': ')] : [];
  });
}

function getLinks(links: Array<{ href?: string; value?: string }> | undefined) {
  return links?.map((item) => item.href || item.value).filter(Boolean) as string[] | undefined;
}

function getDomainTld(domain: string) {
  const labels = domain.split('.').filter(Boolean);
  return labels.length > 1 ? labels[labels.length - 1] : '';
}

async function getRdapEndpointsForTld(tld: string): Promise<string[]> {
  const normalizedTld = tld.toLowerCase();
  if (!normalizedTld) {
    return ['https://rdap.org'];
  }

  const overrideEndpoints = rdapEndpointOverrides[normalizedTld];
  if (overrideEndpoints) {
    return overrideEndpoints;
  }

  const cached = rdapBootstrapCache.get(normalizedTld);
  const oneDay = 1000 * 60 * 60 * 24;
  if (cached && Date.now() - cached.timestamp < oneDay) {
    return cached.endpoints;
  }

  try {
    const response = await fetch('https://data.iana.org/rdap/dns.json', {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BulkDomainChecker/1.0',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`rdap-bootstrap-${response.status}`);
    }

    const body = await response.json().catch(() => null) as RdapBootstrap | null;
    const services = body?.services ?? [];

    for (const service of services) {
      const [tlds, endpoints] = service;
      if (Array.isArray(tlds) && tlds.some((item) => item.toLowerCase() === normalizedTld) && Array.isArray(endpoints) && endpoints.length > 0) {
        const cleaned = endpoints.map((item) => item.replace(/\/+$/, ''));
        rdapBootstrapCache.set(normalizedTld, { timestamp: Date.now(), endpoints: cleaned });
        return cleaned;
      }
    }
  } catch {
    // Fall back to the generic RDAP gateway if bootstrap lookup fails.
  }

  const fallback = ['https://rdap.org'];
  rdapBootstrapCache.set(normalizedTld, { timestamp: Date.now(), endpoints: fallback });
  return fallback;
}

async function fetchRdapResponse(domain: string) {
  const tld = getDomainTld(domain);
  const endpoints = await getRdapEndpointsForTld(tld);
  let lastResponse: Response | null = null;
  let sawNotFound = false;

  for (const base of endpoints) {
    try {
      const response = await fetch(`${base}/domain/${encodeURIComponent(domain)}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'BulkDomainChecker/1.0',
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      if (response.ok || response.status === 429) {
        return response;
      }

      if (response.status === 404) {
        sawNotFound = true;
        lastResponse = response;
        continue;
      }

      lastResponse = response;
    } catch {
      // Try the next endpoint if one registry URL fails.
    }
  }

  if (sawNotFound) {
    return new Response(null, { status: 404 });
  }

  if (lastResponse) {
    return lastResponse;
  }

  return fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    method: 'GET',
    headers: {
      'User-Agent': 'BulkDomainChecker/1.0',
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
}

function emptyDnsRecordMap(): DnsRecordMap {
  return { A: [], AAAA: [], CNAME: [], MX: [], NS: [], TXT: [], SOA: [] };
}

function dedupeRecords(records: DnsRecordMap): DnsRecordMap {
  return {
    A: Array.from(new Set(records.A)),
    AAAA: Array.from(new Set(records.AAAA)),
    CNAME: Array.from(new Set(records.CNAME)),
    MX: Array.from(new Set(records.MX)),
    NS: Array.from(new Set(records.NS)),
    TXT: Array.from(new Set(records.TXT)),
    SOA: Array.from(new Set(records.SOA)),
  };
}

async function fetchDnsJson(name: string, type: string) {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/dns-json',
      'User-Agent': 'BulkDomainChecker/1.0',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`dns-json-${type}-${response.status}`);
  }

  return response.json().catch(() => null) as Promise<{ Answer?: Array<{ data?: string }> } | null>;
}

async function lookupDnsRecordsOverHttps(domain: string): Promise<DnsRecordMap> {
  const [a, aaaa, cname, mx, ns, txt, soa] = await Promise.all([
    fetchDnsJson(domain, 'A').catch(() => null),
    fetchDnsJson(domain, 'AAAA').catch(() => null),
    fetchDnsJson(domain, 'CNAME').catch(() => null),
    fetchDnsJson(domain, 'MX').catch(() => null),
    fetchDnsJson(domain, 'NS').catch(() => null),
    fetchDnsJson(domain, 'TXT').catch(() => null),
    fetchDnsJson(domain, 'SOA').catch(() => null),
  ]);

  return dedupeRecords({
    A: a?.Answer?.map((item) => item.data).filter(Boolean) as string[] ?? [],
    AAAA: aaaa?.Answer?.map((item) => item.data).filter(Boolean) as string[] ?? [],
    CNAME: cname?.Answer?.map((item) => item.data).filter(Boolean) as string[] ?? [],
    MX: mx?.Answer?.map((item) => item.data).filter(Boolean) as string[] ?? [],
    NS: ns?.Answer?.map((item) => item.data).filter(Boolean) as string[] ?? [],
    TXT: txt?.Answer?.map((item) => item.data).filter(Boolean) as string[] ?? [],
    SOA: soa?.Answer?.map((item) => item.data).filter(Boolean) as string[] ?? [],
  });
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

  try {
    const res = await fetchRdapResponse(domain);

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

export async function lookupWhoisRecord(domainRaw: string): Promise<WhoisResult> {
  const domain = normalizeDomain(domainRaw);
  if (!domain || !isDomainValid(domain)) {
    return { domain: domainRaw, status: 'invalid', message: 'Invalid domain format' };
  }

  try {
    const res = await fetchRdapResponse(domain);

    if (res.status === 404) {
      return { domain, status: 'not_found', message: 'No WHOIS record was found for this domain.' };
    }

    if (res.status < 200 || res.status >= 400) {
      return { domain, status: 'error', message: `WHOIS lookup failed with status ${res.status}.` };
    }

    const body = await res.json().catch(() => null) as {
      events?: Array<{ eventAction?: string; eventDate?: string }>;
      entities?: Array<{
        roles?: string[];
        vcardArray?: unknown[];
        handle?: string;
        publicIds?: Array<{ type?: string; identifier?: string }>;
        entities?: Array<{ roles?: string[]; vcardArray?: unknown[]; handle?: string }>;
      }>;
      nameservers?: Array<{ ldhName?: string }>;
      status?: string[];
      notices?: Array<{ title?: string; description?: string[] }>;
      links?: Array<{ href?: string; value?: string }>;
      secureDNS?: { delegationSigned?: boolean };
      handle?: string;
    } | null;

    const registrarEntity = getEntityByRole(body?.entities, 'registrar');
    const abuseContact = getAbuseContact(body?.entities);

    return {
      domain,
      status: 'found',
      message: 'WHOIS record found.',
      registrar: getRegistrarName(body?.entities),
      registrarIanaId: getPublicId(registrarEntity, 'IANA Registrar ID'),
      abuseEmail: abuseContact.abuseEmail,
      abusePhone: abuseContact.abusePhone,
      createdAt: getEventDate(body?.events, ['registration']),
      updatedAt: getEventDate(body?.events, ['last changed', 'last update of RDAP database']),
      expiresAt: getEventDate(body?.events, ['expiration']),
      dnssec: typeof body?.secureDNS?.delegationSigned === 'boolean' ? (body.secureDNS.delegationSigned ? 'Signed' : 'Unsigned') : undefined,
      registryDomainId: body?.handle,
      nameservers: body?.nameservers?.map((item) => item.ldhName).filter(Boolean) as string[] | undefined,
      statuses: body?.status,
      contacts: extractWhoisContacts(body?.entities),
      notices: getNotices(body?.notices),
      links: getLinks(body?.links),
    };
  } catch {
    return { domain, status: 'error', message: 'WHOIS lookup failed right now.' };
  }
}

export async function lookupDnsRecords(domainRaw: string): Promise<DnsLookupResult> {
  const domain = normalizeDomain(domainRaw);
  if (!domain || !isDomainValid(domain)) {
    return {
      domain: domainRaw,
      status: 'invalid',
      message: 'Invalid domain format',
      records: emptyDnsRecordMap(),
    };
  }

  const [a, aaaa, cname, mx, ns, txt, soa] = await Promise.all([
    dns.resolve4(domain).catch(() => [] as string[]),
    dns.resolve6(domain).catch(() => [] as string[]),
    dns.resolveCname(domain).catch(() => [] as string[]),
    dns.resolveMx(domain).then((values) => values.map((item) => `${item.priority} ${item.exchange}`)).catch(() => [] as string[]),
    dns.resolveNs(domain).catch(() => [] as string[]),
    dns.resolveTxt(domain).then((values) => values.map((item) => item.join(''))).catch(() => [] as string[]),
    dns.resolveSoa(domain).then((record) => (record?.nsname ? [`${record.nsname} ${record.hostmaster}`] : [])).catch(() => [] as string[]),
  ]);

  let records = dedupeRecords({
    A: a,
    AAAA: aaaa,
    CNAME: cname,
    MX: mx,
    NS: ns,
    TXT: txt,
    SOA: soa,
  });

  let hasAny = Object.values(records).some((items) => items.length > 0);

  if (!hasAny) {
    try {
      const dohRecords = await lookupDnsRecordsOverHttps(domain);
      const dohHasAny = Object.values(dohRecords).some((items) => items.length > 0);
      if (dohHasAny) {
        records = dohRecords;
        hasAny = true;
      }
    } catch {
      // Keep the local DNS result if DoH also fails.
    }
  }

  return {
    domain,
    status: hasAny ? 'found' : 'error',
    message: hasAny ? 'DNS records found.' : 'No DNS records were returned for this domain.',
    records,
  };
}
