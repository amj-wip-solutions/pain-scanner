import type { Collector } from '@painradar/core';
import { redditCollector } from './reddit.js';

export const collectors: Record<string, Collector> = {
  reddit: redditCollector,
};
