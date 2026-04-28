const cmd = process.argv[2];

switch (cmd) {
  case 'process': {
    const { classify } = await import('./classify.js');
    const { cluster } = await import('./cluster.js');
    const { score } = await import('./score.js');
    const { flag } = await import('./flag.js');
    await classify();
    await cluster();
    await score();
    await flag();
    break;
  }
  case 'brief': {
    const { brief } = await import('./brief.js');
    await brief();
    break;
  }
  default:
    console.error(`Unknown pipeline command: ${cmd}`);
    console.error('Available: process, brief');
    process.exit(1);
}
