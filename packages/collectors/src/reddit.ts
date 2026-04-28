import { config, type Collector, type RawComplaint, type SourceConfigParams } from '@painradar/core';

type RedditPostData = {
  id: string;
  permalink: string;
  author: string;
  title: string;
  selftext: string;
  created_utc: number;
  ups: number;
  num_comments: number;
  subreddit: string;
  link_flair_text: string | null;
  over_18: boolean;
  locked: boolean;
  removed_by_category: string | null;
};

type RedditListing = {
  data: {
    children: { data: RedditPostData }[];
    after: string | null;
  };
};

type RedditConfig = { subreddits: string[] };

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  if (!config.reddit.clientId || !config.reddit.clientSecret) {
    throw new Error('Reddit OAuth env vars missing: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET');
  }
  const auth = Buffer.from(`${config.reddit.clientId}:${config.reddit.clientSecret}`).toString(
    'base64',
  );
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.reddit.userAgent,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`Reddit auth failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

function isRedditConfig(cfg: SourceConfigParams): cfg is RedditConfig {
  return Array.isArray((cfg as RedditConfig).subreddits);
}

async function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const redditCollector: Collector = {
  name: 'reddit',
  async *collect(opts: {
    since: Date;
    config: SourceConfigParams;
  }): AsyncIterable<RawComplaint> {
    if (!isRedditConfig(opts.config)) {
      throw new Error('reddit collector requires { subreddits: string[] } in config.params');
    }
    const token = await getAccessToken();
    const sinceEpoch = Math.floor(opts.since.getTime() / 1000);

    for (const sub of opts.config.subreddits) {
      let after: string | null = null;
      let stop = false;
      while (!stop) {
        const url = new URL(`https://oauth.reddit.com/r/${sub}/new.json`);
        url.searchParams.set('limit', '100');
        if (after) url.searchParams.set('after', after);
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': config.reddit.userAgent,
          },
        });
        if (!res.ok) {
          throw new Error(`Reddit fetch /r/${sub} failed: ${res.status} ${await res.text()}`);
        }
        const listing = (await res.json()) as RedditListing;

        for (const child of listing.data.children) {
          const p = child.data;
          if (p.over_18 || p.locked || p.removed_by_category) continue;
          if (p.created_utc < sinceEpoch) {
            stop = true;
            break;
          }
          if (!p.selftext || p.selftext.length < 40) continue;

          yield {
            source: 'reddit',
            source_id: `${p.subreddit}/${p.id}`,
            url: `https://www.reddit.com${p.permalink}`,
            author: p.author,
            title: p.title,
            body: p.selftext,
            created_at: new Date(p.created_utc * 1000).toISOString(),
            source_signals: {
              upvotes: p.ups,
              num_comments: p.num_comments,
              subreddit: p.subreddit,
              flair: p.link_flair_text ?? '',
            },
          };
        }

        after = listing.data.after;
        if (!after) stop = true;
        await pause(1100);
      }
    }
  },
};
