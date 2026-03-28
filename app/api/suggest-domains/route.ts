import { NextRequest, NextResponse } from 'next/server';
import { checkDomainAvailability, DomainResult } from '../../../lib/domain-utils';

type SuggestionCache = {
  timestamp: number;
  version: number;
  suggestions: string[];
  results: Record<string, DomainResult>;
};

const CACHE_VERSION = 2;
const suggestionCache = new Map<string, SuggestionCache>();

const WORDLIST = [
  // ACTION / CTA (high CTR prefixes)
  'get', 'try', 'use', 'start', 'build', 'launch', 'grow', 'scale', 'boost', 'create',
  'make', 'discover', 'unlock', 'explore', 'find', 'grab', 'pick', 'choose', 'join', 'switch',

  // TRUST / AUTHORITY (great suffixes)
  'pro', 'hub', 'labs', 'works', 'systems', 'solutions', 'group', 'network', 'center', 'world',
  'expert', 'insider', 'academy', 'vault', 'engine', 'source', 'base', 'desk', 'zone', 'space',

  // TECH / SAAS (very strong SEO)
  'tech', 'app', 'tools', 'toolkit', 'stack', 'flow', 'cloud', 'api', 'data', 'byte',
  'dev', 'code', 'ai', 'bot', 'automation', 'platform', 'engine', 'system', 'suite', 'logic',

  // STARTUP STYLE / TRENDY
  'nova', 'spark', 'pulse', 'shift', 'forge', 'wave', 'orbit', 'nexus', 'zen', 'core',
  'edge', 'grid', 'frame', 'loop', 'flux', 'sync', 'node', 'vector', 'layer', 'matrix',

  // SEO / UTILITY
  'calc', 'calculator', 'convert', 'converter', 'tools', 'generator', 'builder', 'checker',
  'finder', 'tracker', 'planner', 'analyzer', 'optimizer', 'scanner', 'tester', 'editor',

  // FREE / VALUE (CTR magnets)
  'free', 'best', 'top', 'easy', 'fast', 'smart', 'simple', 'quick', 'instant', 'ultimate',
  'pro', 'plus', 'max', 'prime', 'direct', 'online', 'now', 'today', 'daily', 'guide',

  // BUSINESS / MONEY
  'fund', 'wealth', 'capital', 'finance', 'invest', 'trade', 'market', 'growth', 'profit', 'income',
  'credit', 'bank', 'pay', 'cash', 'deal', 'deals', 'sale', 'store', 'shop', 'cart',

  // CONTENT / MEDIA
  'media', 'press', 'news', 'insights', 'story', 'voice', 'stream', 'video', 'photo', 'image',
  'content', 'blog', 'journal', 'digest', 'review', 'report', 'guide', 'hub', 'feed', 'daily',

  // HEALTH / WELLNESS
  'health', 'fit', 'well', 'care', 'clinic', 'med', 'vital', 'mind', 'body', 'life',
  'therapy', 'healing', 'balance', 'boost', 'energy', 'nutrition', 'fitness', 'wellness',

  // EDUCATION / LEARNING
  'learn', 'study', 'course', 'class', 'academy', 'school', 'mentor', 'skill', 'brain', 'focus',
  'training', 'lessons', 'tutorials', 'guide', 'program', 'mastery', 'labs', 'camp',

  // REAL WORLD / LOCAL
  'home', 'house', 'place', 'space', 'zone', 'spot', 'base', 'hub', 'center', 'point',
  'city', 'local', 'global', 'world', 'direct', 'connect', 'link', 'bridge',

  // NATURE / BRANDABLE (good for uniqueness)
  'green', 'leaf', 'seed', 'root', 'spring', 'field', 'forest', 'river', 'ocean', 'earth',
  'sun', 'moon', 'star', 'sky', 'stone', 'peak', 'trail', 'path',

  // ECOM / PRODUCT
  'brand', 'trend', 'style', 'wear', 'goods', 'supply', 'market', 'store', 'shop', 'cart',
  'bazaar', 'mart', 'outlet', 'collection', 'pick', 'select', 'buy', 'deal',

  // HIGH-CONVERSION SUFFIXES (gold for SEO)
  'hq', 'co', 'io', 'app', 'site', 'web', 'online', 'tools', 'guide', 'hub',
  'center', 'world', 'base', 'desk', 'zone', 'space', 'point', 'labs'
];

function normalizeSearchTerm(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildSuggestions(term: string): string[] {
  const candidates = new Set<string>();

  for (const word of WORDLIST) {
    candidates.add(`${word}${term}`);
    candidates.add(`${term}${word}`);
  }

  return Array.from(candidates)
    .filter((domain) => domain.length >= 4 && domain.length <= 30)
    .filter((domain) => /^[a-z0-9]+$/i.test(domain));
}

async function checkSuggestionBatch(domains: string[]) {
  const checked = await Promise.all(domains.map((domain) => checkDomainAvailability(`${domain}.com`)));
  const results: Record<string, DomainResult> = {};

  checked.forEach((result) => {
    const baseDomain = result.domain.replace(/\.com$/i, '');
    results[baseDomain] = {
      domain: baseDomain,
      status: result.status,
      message: result.message,
    };
  });

  return results;
}

export async function GET(request: NextRequest) {
  const term = normalizeSearchTerm(request.nextUrl.searchParams.get('q') ?? '');
  const offset = Number(request.nextUrl.searchParams.get('offset') ?? '0');
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? '30'), 60);

  if (!term || term.length < 2) {
    return NextResponse.json({ suggestions: [], total: 0, hasMore: false, message: 'Enter at least 2 letters to generate names.' });
  }

  const now = Date.now();
  const oneHour = 1000 * 60 * 60;
  const cached = suggestionCache.get(term);

  if (!cached || cached.version !== CACHE_VERSION || now - cached.timestamp >= oneHour) {
    suggestionCache.set(term, {
      timestamp: now,
      version: CACHE_VERSION,
      suggestions: buildSuggestions(term),
      results: {},
    });
  }

  const entry = suggestionCache.get(term)!;
  const suggestions = entry.suggestions;
  const page = suggestions.slice(offset, offset + limit);
  const missingDomains = page.filter((domain) => !entry.results[domain]);

  if (missingDomains.length > 0) {
    const batchResults = await checkSuggestionBatch(missingDomains);
    entry.results = { ...entry.results, ...batchResults };
    entry.timestamp = now;
    entry.version = CACHE_VERSION;
    suggestionCache.set(term, entry);
  }

  const results = Object.fromEntries(page.map((domain) => [domain, entry.results[domain]]));

  return NextResponse.json({
    suggestions: page,
    results,
    total: suggestions.length,
    hasMore: offset + limit < suggestions.length,
    nextOffset: offset + page.length,
  });
}
