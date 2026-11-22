import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

// Inspect only the publishable checkout, including newly added files.
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const forbidden=/(^|\/)(node_modules|dist|data|secrets|artifacts)\/|\.(sqlite(?:-wal|-shm)?|db|clixml|pem|key|mp3|wav|mp4|zip|log)$|(^|\/)STATE\.md$/i;
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/gh[pousr]_[A-Za-z0-9]{30,}/,/github_pat_[A-Za-z0-9_]{40,}/,/AKIA[0-9A-Z]{16}/];
const failures=[];
for(const file of files){
  if(forbidden.test(file)||(/(^|\/)\.env(?:\.|$)/.test(file)&&!file.endsWith('.env.example')))failures.push(file+': excluded file type');
  if(/\.(?:jpg|jpeg|png)$/i.test(file))continue;
  const content=readFileSync(file,'utf8');
  if(patterns.some(pattern=>pattern.test(content)))failures.push(file+': possible credential');
}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`Publication guard passed for ${files.length} files. This complements, and does not replace, secret scanning and manual review.`);
