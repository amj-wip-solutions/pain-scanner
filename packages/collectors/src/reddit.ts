import type { Collector, RawComplaint, SourceConfigParams } from '@painradar/core';

export const redditCollector: Collector = {
  name: 'reddit',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, require-yield
  async *collect(_opts: {
    since: Date;
    config: SourceConfigParams;
  }): AsyncIterable<RawComplaint> {
    // TODO: OAuth client_credentials flow against https://www.reddit.com/api/v1/access_token,
    // then paginated pull from each subreddit in opts.config.subreddits via /r/<sub>/new.json,
    // stop when item.id < last-seen source_id, yield RawComplaint per post.
    return;
  },
};
