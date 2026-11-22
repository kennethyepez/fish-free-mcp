import { DatabaseSync } from 'node:sqlite';
import { ServiceError, MAX_AUDIO_BYTES } from './policy.js';

export type Job = {id:string; actor:string; digest:string; state:string; created_at:number; error_code:string|null; bytes:number|null; sha256:string|null};
export class Store {
  constructor(readonly db:DatabaseSync) {
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS fish_jobs(id TEXT PRIMARY KEY, actor TEXT NOT NULL, digest TEXT NOT NULL,
        state TEXT NOT NULL, created_at INTEGER NOT NULL, text_bytes INTEGER NOT NULL,
        error_code TEXT, bytes INTEGER, sha256 TEXT);
      CREATE TABLE IF NOT EXISTS fish_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS fish_jobs_by_actor ON fish_jobs(actor,created_at);`);
    // An interrupted POST has an unknown upstream result. Never replay it automatically.
    db.prepare("UPDATE fish_jobs SET state='unknown', error_code='INTERRUPTED' WHERE state='sending'").run();
  }
  get(id:string,actor:string) { return this.db.prepare('SELECT * FROM fish_jobs WHERE id=? AND actor=?').get(id,actor) as unknown as Job|undefined; }
  claim(id:string,actor:string,digest:string,textBytes:number,now=Date.now()) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const old=this.get(id,actor);
      if(old) {
        if(old.digest!==digest) throw new ServiceError('ID_REUSED','Ese identificador corresponde a otro texto o voz. Usa uno nuevo.',409);
        this.db.exec('COMMIT'); return {fresh:false,job:old};
      }
      if(this.db.prepare('SELECT id FROM fish_jobs WHERE id=?').get(id)) throw new ServiceError('ID_UNAVAILABLE','Usa otro identificador.',409);
      const storage=this.db.prepare("SELECT COALESCE(SUM(CASE WHEN state='failed' THEN 0 ELSE COALESCE(bytes,?) END),0) AS n FROM fish_jobs").get(MAX_AUDIO_BYTES) as {n:number};
      if(storage.n+MAX_AUDIO_BYTES>268_435_456)throw new ServiceError('STORAGE_LIMIT','Voiceover storage is full. Save or download your audio before requesting maintenance.',507);
      const recent=this.db.prepare('SELECT COUNT(*) AS n FROM fish_jobs WHERE actor=? AND created_at>?').get(actor,now-60_000) as {n:number};
      const today=this.db.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(text_bytes),0) AS bytes FROM fish_jobs WHERE actor=? AND created_at>?').get(actor,now-86_400_000) as {n:number;bytes:number};
      if(recent.n>=5 || today.n>=100 || today.bytes+textBytes>80_000) throw new ServiceError('RATE_LIMIT','You reached the connection limit. Wait before generating another voiceover.',429);
      this.db.prepare("INSERT INTO fish_jobs(id,actor,digest,state,created_at,text_bytes) VALUES(?,?,?,'sending',?,?)").run(id,actor,digest,now,textBytes);
      this.db.exec('COMMIT'); return {fresh:true,job:this.get(id,actor)!};
    } catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  finish(id:string,state:'complete'|'unknown'|'failed',data:{error_code?:string;bytes?:number;sha256?:string}={}) {
    this.db.prepare('UPDATE fish_jobs SET state=?,error_code=?,bytes=?,sha256=? WHERE id=?').run(state,data.error_code??null,data.bytes??null,data.sha256??null,id);
  }
  setting(key:string) { return (this.db.prepare('SELECT value FROM fish_settings WHERE key=?').get(key) as {value:string}|undefined)?.value; }
  set(key:string,value:string) { this.db.prepare('INSERT INTO fish_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value); }
}
