// Run only from an authenticated administrative shell on the verified host.
// Creates a short-lived enrollment capability; never deletes users, passkeys or audio.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes,createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
process.umask(0o077);
if(process.argv[2]!=='prepare-enrollment')throw new Error('Specify prepare-enrollment from the authorized administrative shell.');
const data=process.env.DATA_DIR??'/data';const db=new DatabaseSync(join(data,'service.sqlite'));
const code=randomBytes(32).toString('base64url');
db.exec('BEGIN IMMEDIATE');
try {
  const put=db.prepare('INSERT INTO fish_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  put.run('recovery_hash',createHash('sha256').update(code).digest('hex'));
  put.run('recovery_expires_at',String(Date.now()+600_000));
  writeFileSync(join(data,'recovery-code.txt'),code+'\n',{mode:0o600});
  db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
console.log('Temporary enrollment prepared for ten minutes. The code is in the private data volume; no credentials or narrations were removed.');
