import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA = join(import.meta.dir, 'prisma', 'schema.prisma');
const MIGRATIONS = join(import.meta.dir, 'prisma', 'migrations');

async function prisma(args: string[]): Promise<{ code: number; output: string }> {
  const child = Bun.spawn(['bunx', 'prisma', ...args, '--schema', SCHEMA], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const output = `${stdout}${stderr}`;
  process.stdout.write(output);
  return { code, output };
}

function baselineMigration(): string {
  const first = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()[0];
  if (!first) throw new Error(`no migrations found in ${MIGRATIONS}`);
  return first;
}

const deploy = await prisma(['migrate', 'deploy']);

if (deploy.code !== 0 && deploy.output.includes('P3005')) {
  const baseline = baselineMigration();
  console.log(`[MIGRATE] database was created with db push; baselining it as ${baseline}`);

  const push = await prisma(['db', 'push', '--skip-generate']);
  if (push.code !== 0) process.exit(push.code);

  const resolve = await prisma(['migrate', 'resolve', '--applied', baseline]);
  if (resolve.code !== 0) process.exit(resolve.code);

  const retry = await prisma(['migrate', 'deploy']);
  process.exit(retry.code);
}

process.exit(deploy.code);
