import { runInboundReplyLoop } from '../server/automation/brain/pie/inboundLoop';
import { closeBrainDb } from '../server/db';
async function main(){
  const out = await runInboundReplyLoop({
    mailboxes:['snehal.maurya@theboredmonkey.com','vatsal.vadecha@theboredmonkey.com'],
    limit:6, sinceDays:30, dryRun:true,
  });
  console.log('mode=',out.mode,'owners=',out.owners,'candidates=',out.candidates,'processed=',out.processed,'escalations=',out.escalations,'dryRun=',out.dryRun);
  for(const it of out.items){
    if(it.skipped){ console.log(`  [skip:${it.skipped}] ${it.leadEmail}`); continue; }
    console.log(`  ${(it.leadEmail||'').padEnd(34)} cls=${(it.classification||'').padEnd(14)} via=${it.method} action=${it.action}${it.escalation?' ['+it.escalation+']':''}`);
  }
  await closeBrainDb();
}
main().catch(e=>{console.error('ERR',e.message);process.exit(1);});
