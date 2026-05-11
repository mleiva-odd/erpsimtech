const { spawnSync } = require('node:child_process');

const result = spawnSync('npx', ['tsx', 'prisma/seed.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
