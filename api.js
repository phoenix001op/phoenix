/* ==========================================================================
   PHOENIX — Kitsu API layer (kitsu.io/api/edge, JSON:API format)
   No auth required for GET requests. Kitsu has its own anime database
   (rather than live-scraping MyAnimeList like Jikan), so it's noticeably
   more stable — no 500/504s from an upstream site being down.
   ========================================================================== */

const KITSU_BASE = 'https://kitsu.io/api/edge';

async function _kitsuFetch(path) {
  let res;
  try {
    res = await fetch(`${KITSU_BASE}${path}`, {
      headers: { 'Accept': 'application/vnd.api+json' }
    });
  } catch (networkErr) {
    console.error('Phoenix: network-level fetch failure for', path, networkErr);
    throw new Error('NETWORK: could not reach Kitsu at all — check your connection or that you\'re running via http(s), not a double-clicked file.');
  }

  if (!res.ok) {
    console.error(`Phoenix: Kitsu responded ${res.status} for`, path);
    throw new Error(`Kitsu request failed: ${res.status}`);
  }

  return res.json(); // { data: [...] or {...}, included: [...] }
}

/**
 * Kitsu returns genres/productions as separate relationships (via ?include=),
 * listed in a flat `included` array alongside the main resource(s).
 * This resolves a relationship's ids back into full objects from `included`.
 */
function _resolveRelated(resource, relName, includedByTypeId) {
  const rels = resource.relationships?.[relName]?.data;
  if (!rels) return [];
  const list = Array.isArray(rels) ? rels : [rels];
  return list
    .map(ref => includedByTypeId.get(`${ref.type}:${ref.id}`))
    .filter(Boolean);
}

function _indexIncluded(included) {
  const map = new Map();
  (included || []).forEach(item => map.set(`${item.type}:${item.id}`, item));
  return map;
}

/** Derives "Spring 2023" style season text from a YYYY-MM-DD start date. */
function _seasonFromDate(startDate) {
  if (!startDate) return null;
  const [yearStr, monthStr] = startDate.split('-');
  const month = Number(monthStr);
  const year = yearStr;
  if (!month || !year) return null;
  const season = month <= 2 || month === 12 ? 'Winter'
    : month <= 5 ? 'Spring'
    : month <= 8 ? 'Summer'
    : 'Fall';
  return `${season} ${year}`;
}

/** Turns "www.crunchyroll.com" into "Crunchyroll" as a fallback display name. */
function _siteNameFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const label = host.split('.')[0];
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return 'Watch link';
  }
}

/**
 * Normalizes a raw Kitsu anime resource into the shape Phoenix uses
 * everywhere. `includedByTypeId` is only needed when genres/studios
 * were requested via ?include=.
 */
function _normalize(resource, includedByTypeId) {
  const a = resource.attributes;
  const poster = a.posterImage || {};
  const idx = includedByTypeId || new Map();

  const genres = _resolveRelated(resource, 'genres', idx).map(g => ({ name: g.attributes.name }));

  // studios come two hops away: anime -> animeProductions -> producer
  const productions = _resolveRelated(resource, 'animeProductions', idx);
  const studios = productions
    .map(prod => _resolveRelated(prod, 'producer', idx)[0])
    .filter(Boolean)
    .map(p => p.attributes.name);

  // where to watch — anime -> streamingLinks -> streamer (site name)
  const streamingResources = _resolveRelated(resource, 'streamingLinks', idx);
  const streamingLinks = streamingResources
    .map(link => {
      const url = link.attributes?.url;
      if (!url) return null;
      const streamer = _resolveRelated(link, 'streamer', idx)[0];
      return { url, siteName: streamer?.attributes?.siteName || _siteNameFromUrl(url) };
    })
    .filter(Boolean);

  return {
    mal_id: resource.id, // Kitsu id — used as our internal id everywhere
    title: a.canonicalTitle,
    title_english: a.titles?.en || a.titles?.en_jp || a.canonicalTitle,
    images: {
      jpg: {
        image_url: poster.medium || poster.small || poster.large || '',
        large_image_url: poster.large || poster.original || poster.medium || ''
      }
    },
    score: a.averageRating ? Number(a.averageRating) / 10 : null, // Kitsu is 0-100, we want 0-10
    ratingRank: a.ratingRank || null,
    popularityRank: a.popularityRank || null,
    type: a.subtype || a.showType || 'TV',
    year: a.startDate ? Number(a.startDate.slice(0, 4)) : null,
    season: _seasonFromDate(a.startDate),
    episodes: a.episodeCount,
    status: a.status === 'current' ? 'Airing'
      : a.status === 'finished' ? 'Finished Airing'
      : a.status === 'upcoming' ? 'Not yet aired'
      : (a.status || ''),
    genres,
    studios: [...new Set(studios)],
    streamingLinks,
    synopsis: a.synopsis
  };
}

function _normalizeList(json) {
  const idx = _indexIncluded(json.included);
  return (json.data || []).map(resource => _normalize(resource, idx));
}

const PhoenixAPI = {
  /**
   * Search anime by title. `type` optionally narrows to a subtype
   * (TV, movie, OVA, ONA, special, music).
   */
  async search(query, type = 'all', limit = 15) {
    const q = encodeURIComponent(query.trim());
    let path = `/anime?filter[text]=${q}&page[limit]=${limit}&include=genres`;
    if (type !== 'all') path += `&filter[subtype]=${type}`;
    const json = await _kitsuFetch(path);
    return _normalizeList(json);
  },

  /**
   * Get a themed list: 'airing', 'upcoming', or 'bypopularity' (all-time favorites).
   * `type` optionally narrows to a subtype (TV, movie, OVA, ONA, special, music).
   * `offset` pages further into the ranked list — pass a random multiple of
   * `limit` to get a genuinely different batch each time (used by Refresh).
   */
  async getList(filter = 'airing', type = 'all', limit = 18, offset = 0) {
    let path;
    if (filter === 'airing') {
      path = `/anime?filter[status]=current&sort=-userCount&page[limit]=${limit}&page[offset]=${offset}&include=genres`;
    } else if (filter === 'upcoming') {
      path = `/anime?filter[status]=upcoming&sort=-userCount&page[limit]=${limit}&page[offset]=${offset}&include=genres`;
    } else {
      // bypopularity — all-time favorites, ranked by how many users have it in their library
      path = `/anime?sort=-userCount&page[limit]=${limit}&page[offset]=${offset}&include=genres`;
    }
    if (type !== 'all') path += `&filter[subtype]=${type}`;
    const json = await _kitsuFetch(path);
    return _normalizeList(json);
  },

  /**
   * Top 50 highest-rated: kind = 'movie' or 'series' (TV).
   * Kitsu caps pages at 20, so fetch 3 pages and keep the first 50.
   */
  async getTop50(kind = 'movie') {
    const subtype = kind === 'series' ? 'TV' : 'movie';
    const pages = await Promise.all([0, 20, 40].map(offset =>
      _kitsuFetch(`/anime?sort=ratingRank&filter[subtype]=${subtype}&page[limit]=20&page[offset]=${offset}&include=genres`)
        .then(_normalizeList)
    ));
    return pages.flat().slice(0, 50);
  },

  /**
   * Full detail for a single anime by its Kitsu id, including studio/producer
   * info and streaming availability (where to watch it).
   */
  async getById(id) {
    const json = await _kitsuFetch(`/anime/${id}?include=genres,animeProductions.producer,streamingLinks.streamer`);
    const idx = _indexIncluded(json.included);
    return _normalize(json.data, idx);
  }
};