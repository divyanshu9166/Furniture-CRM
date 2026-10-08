// Loopback/sample-only QA. Real inbox components; no auth, Meta, DB or sockets.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const root = process.cwd();
const fixtures = `
import {useEffect,useSyncExternalStore} from 'react';
let callbacks = {};
export const useRealtime = options => { useEffect(()=>{callbacks=options;return()=>{callbacks={}}});return {isConnected:false}; };
export const emitMessage = message => callbacks.onMessageEvent?.({eventType:'INSERT',new:message,old:{}});
export const useAuth = ()=>({user:{id:'qa-user',name:'QA Administrator'}});
export const useTotalUnread = ()=>2;
export const useRouter = ()=>({replace:url=>{history.replaceState(null,'',url);window.dispatchEvent(new Event('qa-navigation'));}});
export const useSearchParams = ()=>{useSyncExternalStore(cb=>{window.addEventListener('qa-navigation',cb);return()=>window.removeEventListener('qa-navigation',cb)},()=>location.search);return new URLSearchParams(location.search)};
`;
const entry = String.raw`
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Toaster} from 'sonner';
import {WhatsAppMarketingClient} from '@/app/(dashboard)/whatsapp-marketing/whatsapp-marketing-client';
import {emitMessage} from 'qa-fixtures';
const initial=new URLSearchParams(location.search);
if(!initial.has('c')&&!initial.has('list'))history.replaceState(null,'','?tab=inbox&c=sample-one');
let failSend=false,failLoad=false,sequence=100;
const contact=(id,name)=>({id,user_id:'qa-user',name,phone:'919000000000',created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
const contacts=[contact('contact-one','Sample Customer'),contact('contact-two','Second Customer — long display name')];
const conversations=contacts.map((c,i)=>({id:i?'sample-two':'sample-one',contact_id:c.id,contact:c,user_id:'qa-user',status:'open',needs_human:false,unread_count:0,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_message_at:new Date().toISOString(),last_message_text:i?'A separate chat':'Bihar'}));
const msg=(id,text,sender='customer',conversation='sample-one',extra={})=>({id,conversation_id:conversation,sender_type:sender,content_type:'text',content_text:text,status:'read',created_at:new Date(Date.now()-60000+sequence++).toISOString(),...extra});
const messages=[msg('one','Hello, I am looking for office furniture.'),msg('two','Thank you for sharing the quantity. Could you please let me know your city and state, along with your preferred timeline for the project?','bot'),msg('three','Nalanda'),msg('four','Bihar'),msg('five','Hindi: हमें ऑफिस के लिए फर्नीचर चाहिए।\nEmoji: 🙏 🪑\nA long URL: https://example.com/catalog/'+ 'collection'.repeat(8)),msg('six','Your showroom visit is confirmed.\nWe will share the details shortly.','agent','sample-one',{content_type:'template',reply_to_message_id:'three'}),msg('seven','This mock send failed','agent','sample-one',{status:'failed'}),msg('eight','Messages from this chat must stay separate.','customer','sample-two')];
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async (url,options={})=>{
 const target=new URL(String(url),location.origin),route=target.pathname;
 if(route==='/api/whatsapp/config')return json({connected:true});
 if(route==='/api/whatsapp/profiles')return json({data:[{id:'profile',user_id:'qa-user',full_name:'QA Administrator'}]});
 if(route==='/api/whatsapp/conversations')return failLoad?json({error:'Simulated loading failure'},503):json({data:conversations});
 if(route==='/api/whatsapp/messages')return failLoad?json({error:'Simulated loading failure'},503):json({data:messages.filter(m=>m.conversation_id===target.searchParams.get('conversation_id'))});
 if(route==='/api/whatsapp/reactions')return json({data:[]});
 if(route==='/api/whatsapp/templates')return json({templates:[{id:'template',name:'sample_visit',body_text:'Hello {{1}}, visit us on {{2}}.',category:'Utility',status:'Approved',language:'en'},{id:'invalid-template',name:'sample_media_template',body_text:'See our catalog',header_type:'image',category:'Marketing',status:'Approved'}]});
 if(route==='/api/whatsapp/send'){
  const body=JSON.parse(options.body),rejected=failSend;
  await new Promise(resolve=>setTimeout(resolve,1200));
  if(rejected)return json({error:'Simulated failure: no WhatsApp message sent'},503);
  const saved=msg('saved-'+sequence++,body.content_text,'agent',body.conversation_id,{content_type:body.message_type,status:'sent',reply_to_message_id:body.reply_to_message_id,message_id:'mock-meta',created_at:new Date().toISOString()});
  messages.push(saved); emitMessage(saved); return json({message_id:saved.id,whatsapp_message_id:'mock-meta'});
 }
 if(route.endsWith('/human-takeover')){const body=JSON.parse(options.body);const c=conversations.find(c=>route.includes(c.id));if(c)c.needs_human=body.needs_human;return json({success:true});}
 if(route.startsWith('/api/whatsapp/conversations/')){const body=JSON.parse(options.body||'{}');const c=conversations.find(c=>route.endsWith(c.id));if(c)Object.assign(c,body);return json({success:true});}
 if(route.endsWith('/notes'))return json({data:options.method==='POST'?{id:'qa-note',note_text:JSON.parse(options.body).note_text,created_at:new Date().toISOString()}:[]});
 if(route.startsWith('/api/whatsapp/contacts/'))return json({data:route.endsWith('/deals')?[]:{tags:[]}});
 if(route==='/api/whatsapp/react')return json({success:true});
 throw new Error('Blocked unmocked network request: '+route);
};
function Preview(){
 const [dark,setDark]=useState(initial.get('theme')==='dark');
 useEffect(()=>{document.documentElement.classList.toggle('dark',dark);document.body.classList.add('wa-light-active')},[dark]);
 return <div className="flex h-dvh min-w-0 flex-col bg-background text-foreground">
  <div className="qa-topbar flex h-14 shrink-0 items-center gap-3 overflow-x-auto border-b border-border bg-surface px-3 py-2 text-xs md:h-16">
   <span>Local sample inbox · no Meta/DB</span>
   <button onClick={()=>setDark(v=>!v)} className="rounded border border-border px-2 py-2">Toggle theme</button>
   <label><input type="checkbox" onChange={e=>{failSend=e.target.checked}}/> Fail mock send</label>
   <label><input type="checkbox" onChange={e=>{failLoad=e.target.checked}}/> Fail mock loading</label>
   <button onClick={()=>{const c=new URLSearchParams(location.search).get('c')||'sample-one';const m=msg('incoming-'+sequence++,'New sample customer message','customer',c);messages.push(m);emitMessage(m)}} className="rounded border border-border px-2 py-2">Simulate incoming</button>
  </div>
  <div className="dashboard-shell flex min-h-0 min-w-0 flex-1">
   <aside className="hidden w-[260px] shrink-0 border-r border-border bg-surface p-5 md:block"><p>Sample CRM sidebar</p><p className="mt-3 text-sm text-accent">WhatsApp Marketing</p></aside>
   <main className="dashboard-content min-h-0 min-w-0 flex-1 overflow-y-auto p-6"><WhatsAppMarketingClient/></main>
  </div><Toaster/>
 </div>
}
createRoot(document.getElementById('root')).render(<Preview/>);
`;
const plugin={name:'safe-inbox-qa',setup(builder){
 builder.onResolve({filter:/^(qa-fixtures|next\/navigation|@\/hooks\/use-auth|@\/hooks\/use-realtime|@\/lib\/use-total-unread)$/},()=>({path:'fixtures',namespace:'qa'}));
 builder.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:fixtures,loader:'jsx',resolveDir:root}));
 builder.onResolve({filter:/^@\/components\/whatsapp\/(dashboard|broadcasts|automations|contacts|pipelines|settings|logs|agent)\//},()=>({path:'other-tabs',namespace:'qa-other'}));
 builder.onLoad({filter:/.*/,namespace:'qa-other'},()=>({contents:['OverviewTab','BroadcastsTab','AutomationsTab','ContactsTab','PipelinesTab','SettingsTab','ApiLogsTab','AgentTab'].map(name=>'export const '+name+'=()=>null;').join('\n'),loader:'jsx',resolveDir:root}));
 builder.onResolve({filter:/^@\//},args=>{
  const base=path.resolve(root,args.path.slice(2));
  const found=['', '.tsx','.ts','.js','.jsx'].map(ext=>base+ext).find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
  if(!found)throw new Error('Missing module '+args.path);
  return {path:found};
 });
}};
const js=await build({stdin:{contents:entry,resolveDir:root,loader:'jsx'},loader:{'.js':'jsx'},bundle:true,write:false,jsx:'automatic',format:'iife',plugins:[plugin],define:{'process.env.NODE_ENV':'"development"'}});
const compiled=await postcss([tailwind({base:root,optimize:false})]).process(fs.readFileSync('app/globals.css','utf8'),{from:path.join(root,'app/globals.css')});
const css=compiled.css+'\n'+fs.readFileSync('app/mobile.css','utf8')+'\n.qa-topbar>*{flex-shrink:0;white-space:nowrap}';
http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/preview.js'){res.setHeader('Content-Type','application/javascript');res.end(js.outputFiles[0].text);return;}
 if(req.url==='/preview.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>WhatsApp inbox QA · sample only</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>');
}).listen(4320,'127.0.0.1',()=>console.log('Safe WhatsApp inbox QA: http://127.0.0.1:4320'));
