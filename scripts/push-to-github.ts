import { Octokit } from '@octokit/rest';
import * as fs from 'fs';

async function getAccessToken(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;

  const headers: Record<string, string> = { 'Accept': 'application/json' };

  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (xReplitToken) {
    headers['X_REPLIT_TOKEN'] = xReplitToken;
  }

  const res = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    { headers }
  );
  const data = await res.json();
  const item = data.items?.[0];
  const token = item?.settings?.access_token || item?.settings?.oauth?.credentials?.access_token;
  if (!token) {
    throw new Error('GitHub access token not found. Response: ' + JSON.stringify(data).substring(0, 200));
  }
  return token;
}

const FILES_TO_PUSH = [
  { path: 'server/push.ts', message: 'Add push notification module with VAPID web-push support' },
  { path: 'server/routes.ts', message: 'Add push subscription API endpoints' },
  { path: 'server/scraper.ts', message: 'Integrate push notifications with scraper refresh cycle' },
  { path: 'client/public/sw.js', message: 'Add push event handler to service worker' },
  { path: 'client/src/pages/Home.tsx', message: 'Add push notification subscription flow with iOS PWA support' },
];

async function main() {
  const repoName = 'pep-attendance-tracker';

  console.log('Connecting to GitHub...');
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token });

  const { data: user } = await octokit.users.getAuthenticated();
  console.log(`Authenticated as: ${user.login}`);

  try {
    await octokit.repos.get({ owner: user.login, repo: repoName });
    console.log(`Repository "${repoName}" exists`);
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`Creating repository "${repoName}"...`);
      await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: 'PEP Attendance Tracker - Track student attendance for Physical Education Program',
        private: false,
        auto_init: true,
      });
      console.log('Repository created, waiting for initialization...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      throw error;
    }
  }

  for (const file of FILES_TO_PUSH) {
    console.log(`\nPushing: ${file.path}`);

    const content = fs.readFileSync(file.path);
    const base64Content = content.toString('base64');

    let sha: string | undefined;
    try {
      const { data: existingFile } = await octokit.repos.getContent({
        owner: user.login,
        repo: repoName,
        path: file.path,
      });
      if (!Array.isArray(existingFile) && 'sha' in existingFile) {
        sha = existingFile.sha;
        console.log(`  File exists, SHA: ${sha.substring(0, 7)}`);
      }
    } catch (e: any) {
      if (e.status === 404) {
        console.log('  File is new');
      }
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: user.login,
      repo: repoName,
      path: file.path,
      message: file.message,
      content: base64Content,
      sha,
    });

    console.log(`  Committed: "${file.message}"`);
  }

  console.log(`\nAll ${FILES_TO_PUSH.length} files pushed successfully!`);
  console.log(`Repository: https://github.com/${user.login}/${repoName}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
