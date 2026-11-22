import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Inspect only the publishable checkout, including newly added files.
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const forbidden=/(^|\/)(node_modules|dist|data|secrets|artifacts)\/|\.(sqlite(?:-wal|-shm)?|db|clixml|pem|key|mp3|wav|mp4|zip|log)$|(^|\/)STATE\.md$/i;
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/gh[pousr]_[A-Za-z0-9]{30,}/,/github_pat_[A-Za-z0-9_]{40,}/,/AKIA[0-9A-Z]{16}/];
const failures=[];
for(const file of files){
  // Only this explicitly reviewed, public English specimen may be published.
  // All other audio remains excluded, and changing its bytes invalidates approval.
  if(file==='docs/audio/fish-free-mcp-demo-en.mp3'){
    const audio=readFileSync(file);
    const manifest=JSON.parse(readFileSync('docs/audio/demo.json','utf8'));
    const mp3=audio.subarray(0,3).toString()==='ID3'||(audio[0]===0xff&&((audio[1]??0)&0xe0)===0xe0);
    if(!mp3||audio.length>2_097_152||audio.length!==manifest.bytes||createHash('sha256').update(audio).digest('hex')!==manifest.sha256)failures.push(file+': approved specimen integrity mismatch');
    continue;
  }
  if(forbidden.test(file)||(/(^|\/)\.env(?:\.|$)/.test(file)&&!file.endsWith('.env.example')))failures.push(file+': excluded file type');
  if(/\.(?:jpg|jpeg|png)$/i.test(file))continue;
  const content=readFileSync(file,'utf8');
  if(patterns.some(pattern=>pattern.test(content)))failures.push(file+': possible credential');
}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`Publication guard passed for ${files.length} files. This complements, and does not replace, secret scanning and manual review.`);
