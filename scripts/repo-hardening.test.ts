/**
 * Regression guards for the repository's build, release and supply-chain hardening:
 * GitHub Actions pinning, scoping of release signing secrets, macOS entitlements and
 * the developer documentation that describes them.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const workflowsDir = join(root, '.github', 'workflows');

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

const workflowFiles = readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name));

/** A single `uses:` reference found in a workflow file. */
interface ActionReference {
  file: string;
  line: number;
  text: string;
}

function actionReferences(): ActionReference[] {
  return workflowFiles.flatMap((file) =>
    readFileSync(join(workflowsDir, file), 'utf8')
      .split('\n')
      .flatMap((text, index) =>
        /^\s*(?:-\s*)?uses:/.test(text) ? [{ file, line: index + 1, text: text.trim() }] : [],
      ),
  );
}

/** Splits a workflow into its steps (text blocks that start with `- name:` / `- uses:`). */
function steps(workflow: string): string[] {
  return workflow.split(/\n(?=\s+- (?:name|uses):)/);
}

describe('GitHub Actions workflows', () => {
  it('finds the workflows and their action references', () => {
    expect(workflowFiles).toEqual(expect.arrayContaining(['ci.yml', 'codeql.yml', 'release.yml']));
    expect(actionReferences().length).toBeGreaterThan(0);
  });

  it('pins every third-party action to a full commit SHA with a version comment', () => {
    const unpinned = actionReferences().filter(
      ({ text }) => !/^(?:-\s*)?uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+(?:\.\d+){0,2}$/.test(text),
    );
    expect(unpinned).toEqual([]);
  });

  it('uses CodeQL action v4', () => {
    const codeql = actionReferences().filter(({ text }) => text.includes('github/codeql-action/'));
    expect(codeql.length).toBe(2);
    for (const { text } of codeql) expect(text).toMatch(/ # v4(?:\.\d+){0,2}$/);
  });

  it('never exports secrets through $GITHUB_ENV', () => {
    for (const file of workflowFiles) {
      for (const step of steps(readFileSync(join(workflowsDir, file), 'utf8'))) {
        if (step.includes('secrets.')) expect(step).not.toMatch(/>>\s*"?\$GITHUB_ENV/);
      }
    }
  });

  it('scopes release signing secrets to the electron-builder packaging steps', () => {
    const release = read('.github/workflows/release.yml');
    const signingSecret = /secrets\.(?:CSC_|WIN_CSC_|APPLE_)/;
    const withSecrets = steps(release).filter((step) => signingSecret.test(step));
    expect(withSecrets.length).toBe(2);
    for (const step of withSecrets) {
      expect(step).toContain('npx --no-install electron-builder --publish always');
      expect(step).not.toContain('uses:');
    }
    const mac = withSecrets.find((step) => step.includes("runner.os == 'macOS'"));
    const win = withSecrets.find((step) => step.includes("runner.os == 'Windows'"));
    expect(mac).toMatch(/secrets\.CSC_LINK/);
    expect(mac).not.toMatch(/secrets\.WIN_CSC_/);
    expect(win).toMatch(/secrets\.WIN_CSC_LINK/);
    expect(win).not.toMatch(/secrets\.(?:CSC_|APPLE_)/);
  });

  it('installs dependencies without lifecycle scripts in the release packaging job', () => {
    const release = read('.github/workflows/release.yml');
    const packageJob = release.slice(release.indexOf('\n  package:'));
    expect(packageJob).toContain('run: npm ci --ignore-scripts');
    expect(packageJob).not.toMatch(/run: npm ci\s*$/m);
  });
});

describe('macOS entitlements', () => {
  const plist = read('build/entitlements.mac.plist');
  const keys = [...plist.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]);

  it('grants only allow-jit under the hardened runtime', () => {
    expect(keys).toEqual(['com.apple.security.cs.allow-jit']);
    expect(plist).toMatch(/<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\/>/);
  });

  it('is the entitlements file used for the app and its helpers', () => {
    const builder = read('electron-builder.yml');
    expect(builder).toContain('hardenedRuntime: true');
    expect(builder).toContain('entitlements: build/entitlements.mac.plist');
    expect(builder).toContain('entitlementsInherit: build/entitlements.mac.plist');
  });

  it('is documented accurately in the release guide', () => {
    expect(read('docs/release.md')).not.toMatch(/allow-unsigned-executable-memory`[^.]*required/);
  });
});

describe('developer documentation', () => {
  const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
  const development = read('docs/development.md');

  it('lists the icons script and uses it in the icon section', () => {
    expect(scripts.icons).toBe('electron scripts/generate-icons.mjs');
    expect(development).toMatch(/^\| `npm run icons`\s+\|/m);
    const iconSection = development.slice(development.indexOf('## Generating icons'));
    expect(iconSection).toMatch(/```bash\nnpm run icons\n```/);
  });

  it('describes the CodeQL triggers that codeql.yml actually uses', () => {
    const codeql = read('.github/workflows/codeql.yml');
    expect(codeql).toMatch(/push:\s*\n\s*branches: \[main\]/);
    expect(codeql).toMatch(/pull_request:\s*\n\s*branches: \[main\]/);
    expect(codeql).toMatch(/schedule:/);
    const security = read('SECURITY.md').replace(/\s+/g, ' ');
    expect(security).not.toContain('CodeQL on every push.');
    expect(security).toContain('CodeQL on every push to `main`, every pull request to `main` and weekly');
  });
});
