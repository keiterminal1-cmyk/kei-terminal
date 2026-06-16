import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 8787;
const CACHE_MS = Number(process.env.CACHE_MS || 60000);

app.use(cors());
app.use(express.json());

const cache = new Map();

function cacheKey(name, value) {
  return `${name}:${value}`;
}

async function cachedFetchJson(key, url, options = {}) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_MS) {
    return { cached: true, data: cached.data };
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      'user-agent': 'KaspaRadar/1.3',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    return { cached: false, error: `Upstream error ${response.status}`, status: response.status };
  }

  const data = await response.json();
  cache.set(key, { time: Date.now(), data });
  return { cached: false, data };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, app: 'Kaspa Radar Live Data Server', version: '1.3.0' });
});

app.get('/api/prices', async (req, res) => {
  try {
    const ids = String(req.query.ids || 'kaspa').replace(/[^a-zA-Z0-9,\-]/g, '');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`;
    const result = await cachedFetchJson(cacheKey('prices', ids), url);
    if (result.error) return res.status(result.status || 502).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Price proxy error', message: error.message });
  }
});

app.get('/api/github', async (req, res) => {
  try {
    const repos = String(req.query.repos || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean)
      .slice(0, 10);

    if (!repos.length) return res.json({ cached: false, data: {} });

    const output = {};
    for (const repo of repos) {
      const safeRepo = repo.replace(/[^a-zA-Z0-9_\-./]/g, '');
      const commitsUrl = `https://api.github.com/repos/${safeRepo}/commits?per_page=1`;
      const releasesUrl = `https://api.github.com/repos/${safeRepo}/releases?per_page=1`;
      const repoUrl = `https://api.github.com/repos/${safeRepo}`;

      const [commits, releases, meta] = await Promise.all([
        cachedFetchJson(cacheKey('github_commits', safeRepo), commitsUrl),
        cachedFetchJson(cacheKey('github_releases', safeRepo), releasesUrl),
        cachedFetchJson(cacheKey('github_meta', safeRepo), repoUrl)
      ]);

      output[safeRepo] = {
        commits: commits.data || [],
        releases: releases.data || [],
        meta: meta.data || null,
        errors: [commits.error, releases.error, meta.error].filter(Boolean)
      };
    }

    res.json({ cached: false, data: output });
  } catch (error) {
    res.status(500).json({ error: 'GitHub proxy error', message: error.message });
  }
});

app.get('/api/defillama/protocol/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').replace(/[^a-zA-Z0-9_\-]/g, '');
    const url = `https://api.llama.fi/protocol/${slug}`;
    const result = await cachedFetchJson(cacheKey('defillama_protocol', slug), url);
    if (result.error) return res.status(result.status || 502).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'DefiLlama proxy error', message: error.message });
  }
});

app.get('/api/defillama/protocols', async (_req, res) => {
  try {
    const url = 'https://api.llama.fi/protocols';
    const result = await cachedFetchJson('defillama_protocols', url);
    if (result.error) return res.status(result.status || 502).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'DefiLlama proxy error', message: error.message });
  }
});

app.get('/api/kaspa/network', async (_req, res) => {
  const sources = [
    'https://api.kaspa.org/info/network',
    'https://api.kas.fyi/network/info'
  ];

  for (const url of sources) {
    try {
      const result = await cachedFetchJson(cacheKey('kaspa_network', url), url);
      if (!result.error) return res.json({ ...result, source: url });
    } catch (_e) {
      // try next source
    }
  }

  res.status(502).json({ error: 'Kaspa network endpoint unavailable' });
});

app.get('/api/kaspa/hashrate', async (_req, res) => {
  const sources = [
    'https://api.kaspa.org/info/hashrate',
    'https://api.kas.fyi/hashrate'
  ];

  for (const url of sources) {
    try {
      const result = await cachedFetchJson(cacheKey('kaspa_hashrate', url), url);
      if (!result.error) return res.json({ ...result, source: url });
    } catch (_e) {
      // try next source
    }
  }

  res.status(502).json({ error: 'Kaspa hashrate endpoint unavailable' });
});

app.post('/api/enrich', async (req, res) => {
  try {
    const projects = Array.isArray(req.body.projects) ? req.body.projects : [];
    const enriched = [];

    for (const project of projects) {
      const copy = { ...project, live: { ...(project.live || {}) } };

      if (project.api?.provider === 'coingecko' && project.api.id) {
        const ids = project.api.id;
        const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`;
        const price = await cachedFetchJson(cacheKey('prices', ids), priceUrl);
        const pd = price.data?.[ids];
        if (pd) {
          copy.price = pd.usd ?? copy.price;
          copy.marketCap = pd.usd_market_cap ?? copy.marketCap;
          copy.volume24h = pd.usd_24h_vol ?? copy.volume24h;
          copy.live.priceChange24h = pd.usd_24h_change ?? null;
          copy.live.lastUpdatedAt = pd.last_updated_at ?? null;
        }
      }

      if (project.defillama?.slug) {
        const slug = project.defillama.slug;
        const tvl = await cachedFetchJson(cacheKey('defillama_protocol', slug), `https://api.llama.fi/protocol/${slug}`);
        if (tvl.data && !tvl.error) {
          copy.live.tvl = tvl.data.tvl ?? tvl.data.currentChainTvls ?? null;
          copy.live.defillamaName = tvl.data.name ?? null;
          copy.live.chains = tvl.data.chains ?? [];
        }
      }

      if (Array.isArray(project.github) && project.github.length) {
        const repoStats = [];
        for (const r of project.github.slice(0, 5)) {
          const repo = `${r.owner}/${r.repo}`.replace(/[^a-zA-Z0-9_\-./]/g, '');
          const meta = await cachedFetchJson(cacheKey('github_meta', repo), `https://api.github.com/repos/${repo}`);
          const releases = await cachedFetchJson(cacheKey('github_releases', repo), `https://api.github.com/repos/${repo}/releases?per_page=1`);
          repoStats.push({
            repo,
            stars: meta.data?.stargazers_count ?? null,
            forks: meta.data?.forks_count ?? null,
            openIssues: meta.data?.open_issues_count ?? null,
            pushedAt: meta.data?.pushed_at ?? null,
            latestRelease: Array.isArray(releases.data) ? releases.data[0]?.published_at || null : null
          });
        }
        copy.live.github = repoStats;
      }

      enriched.push(copy);
    }

    res.json({ ok: true, updatedAt: new Date().toISOString(), projects: enriched });
  } catch (error) {
    res.status(500).json({ error: 'Enrichment error', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Kaspa Radar live data server running on http://localhost:${PORT}`);
});
