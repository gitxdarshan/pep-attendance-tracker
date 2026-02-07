import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.cache',
  '.config',
  '.upm',
  'dist',
  '.replit',
  'replit.nix',
  '.local',
  'generated-icon.png',
  'package-lock.json',
  'scripts/push-to-github.ts',
  'attached_assets'
];

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (shouldIgnore(fullPath)) return;
    
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

async function main() {
  const repoName = 'pep-attendance-tracker';
  
  console.log('🔗 Connecting to GitHub...');
  const octokit = await getGitHubClient();
  
  const { data: user } = await octokit.users.getAuthenticated();
  console.log(`✅ Authenticated as: ${user.login}`);
  
  let repo;
  try {
    const { data } = await octokit.repos.get({
      owner: user.login,
      repo: repoName
    });
    repo = data;
    console.log(`📁 Repository "${repoName}" already exists`);
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`📁 Creating repository "${repoName}"...`);
      const { data } = await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: 'PEP Attendance Tracker - Track student attendance for Physical Education Program',
        private: false,
        auto_init: true
      });
      repo = data;
      console.log(`✅ Repository created: ${repo.html_url}`);
      console.log('⏳ Waiting for repo initialization...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      throw error;
    }
  }

  console.log('📦 Collecting files...');
  const files = getAllFiles('.');
  console.log(`Found ${files.length} files to push`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const file of files) {
    const relativePath = file.startsWith('./') ? file.slice(2) : file;
    try {
      const content = fs.readFileSync(file);
      const base64Content = content.toString('base64');
      
      let sha: string | undefined;
      try {
        const { data: existingFile } = await octokit.repos.getContent({
          owner: user.login,
          repo: repoName,
          path: relativePath
        });
        if (!Array.isArray(existingFile) && 'sha' in existingFile) {
          sha = existingFile.sha;
        }
      } catch (e) {
        // File doesn't exist yet
      }
      
      await octokit.repos.createOrUpdateFileContents({
        owner: user.login,
        repo: repoName,
        path: relativePath,
        message: `Add ${relativePath}`,
        content: base64Content,
        sha
      });
      
      successCount++;
      process.stdout.write(`\r📤 Uploaded ${successCount}/${files.length} files...`);
    } catch (e: any) {
      errorCount++;
      console.log(`\n⚠️ Failed to upload ${relativePath}: ${e.message}`);
    }
  }
  
  console.log('');
  console.log('');
  console.log('✅ Successfully pushed to GitHub!');
  console.log(`📊 Uploaded: ${successCount} files, Failed: ${errorCount} files`);
  console.log(`📎 Repository URL: ${repo.html_url}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
