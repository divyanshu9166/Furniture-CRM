// Sample-only QA: render the actual campaign page and import worker. No server
// actions, database, SMTP credentials, outgoing emails or production access.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const root = process.cwd();
// Optional smoke test of the actual Next production worker artifacts. Turbopack's
// createWorker helper supplies bootstrap params and clears the module type.
const productionWorker = process.argv.includes('--production-worker');
const productionAssets = new Map();
let workerUrl = '/recipient-import-worker.js';
if (productionWorker) {
  const directory = path.join(root, '.next/static/chunks');
  let descriptor;
  for (const file of fs.readdirSync(directory)) {
    if (!file.endsWith('.js')) continue;
    const match = fs.readFileSync(path.join(directory, file), 'utf8').match(/\.b\([^,]+,"(static\/chunks\/turbopack-worker[^"]+)",(\[[^\]]+\])/);
    if (match) { descriptor = { entry: match[1], chunks: JSON.parse(match[2]) }; break; }
  }
  if (!descriptor) throw new Error('Build the app first; no production worker descriptor found.');
  for (const file of [descriptor.entry, ...descriptor.chunks]) {
    if (!/^static\/chunks\/[^/\\]+\.js$/.test(file)) throw new Error('Unexpected production artifact path');
    productionAssets.set('/_next/' + file, fs.readFileSync(path.join(root, '.next', file)));
  }
  workerUrl = '/_next/' + descriptor.entry + '#params=' + encodeURIComponent(JSON.stringify([descriptor.chunks.map(file => '/_next/' + file), '', '', '']));
}
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import Page from './app/(dashboard)/email-marketing/page.js';createRoot(document.getElementById('root')).render(<main className="dashboard-content p-4 sm:p-6"><p className="mb-4 text-sm text-muted">Local sample QA — no database, SMTP or real email sending.</p><Page/></main>);`;
const fixture = `
import {emptyRecipientSelection,normalizeCampaignRecipients,recipientSelectionSchema} from '@/lib/email-audience';
import {emailFailureMessage} from '@/lib/email-errors';
const contacts=[{id:1,name:'Alice Sample',email:'alice@example.com',emailSubscribed:true},{id:2,name:'Unsubscribed Sample',email:'unsubscribed@example.com',emailSubscribed:false},{id:3,name:'Invalid Sample',email:'invalid-email',emailSubscribed:true},{id:4,name:'Bob Sample',email:'bob@example.com',emailSubscribed:true},...Array.from({length:56},(_,i)=>({id:i+5,name:'Sample client '+(i+5),email:'client'+(i+5)+'@example.com',emailSubscribed:true}))];
const base={subject:'Office furniture',body:'<p>Hello {{customerName}}</p>',fromEmail:'sales@example.com',fromName:'Sales',audience:'all',audienceFilter:null,isABTest:false,abSplitPercent:50,opened:0,clicked:0,bounced:0,unsubscribed:0,totalRecipients:0,recipientCount:0,sent:0,createdAt:new Date().toISOString(),isAutomated:false,status:'DRAFT'};
let campaigns=[{...base,id:1,name:'Sample furniture campaign'}];
export async function getEmailCampaigns(){return {success:true,data:campaigns};}
export async function getEmailTemplates(){return {success:true,data:[]};}
export async function getAudienceStats(){return {success:true,data:{total:60,withEmail:60,subscribed:59,leads:10,customers:10}};}
export async function getEmailConfigStatus(){return {success:true,configured:true,trackingConfigured:true,smtpUser:'info@example.com',fromEmail:'info@example.com',fromName:'Example Furniture',senders:[{email:'info@example.com',name:'Example Furniture'},{email:'sales@example.com',name:'Sales'}]};}
export async function searchCampaignContacts({search='',page=1}){const matching=contacts.filter(row=>(row.name+' '+row.email).toLowerCase().includes(search.toLowerCase()));return {success:true,data:{contacts:matching.slice((page-1)*50,page*50).map(row=>({...row,selectable:row.emailSubscribed&&row.email.includes('@')})),total:matching.length,page}};}
export async function previewCampaignRecipients(audience,filter){try{const selected=audience==='selected'?recipientSelectionSchema.parse({...emptyRecipientSelection(),...filter,consentConfirmed:true}):null;const chosen=contacts.filter(row=>row.emailSubscribed&&(!selected||selected.contactIds.includes(row.id))).map(row=>({...row,contactId:row.id}));const rows=[...chosen,...(selected?.emails||[]).map(row=>({...row,contactId:null}))];const result=normalizeCampaignRecipients(rows,['unsubscribed@example.com','manual-blocked@example.com']);return {success:true,data:{...result,total:result.recipients.length,unavailableContacts:0}};}catch(error){return {success:false,error:error.message}}}
export async function createEmailCampaign(payload){try{if(payload.audience==='selected')recipientSelectionSchema.parse(payload.audienceFilter);const saved={...base,...payload,id:campaigns.length+1};campaigns=[saved,...campaigns];return {success:true,data:{id:saved.id}};}catch(error){return {success:false,error:'Sample validation: '+error.issues?.[0]?.message}};}
export async function updateEmailCampaign(id,payload){campaigns=campaigns.map(row=>row.id===id?{...row,...payload}:row);return {success:true};}
export async function duplicateCampaign(id){const row=campaigns.find(row=>row.id===id);return createEmailCampaign({...row,name:row.name+' (Copy)'});}
export async function sendEmailCampaign(){return {success:false,error:emailFailureMessage(new Error('554 5.7.1 Outbound sending is disabled for this account'))+' Sample only: no SMTP attempted.'};}
export async function createEmailTemplate(){return {success:false,error:'QA template writes disabled'};}
export async function updateEmailTemplate(){return {success:false,error:'QA template writes disabled'};}
export async function deleteEmailTemplate(){return {success:false,error:'QA deletion disabled'};}
export async function deleteEmailCampaign(){return {success:false,error:'QA deletion disabled'};}
export async function setEmailAutomationActive(){return {success:false,error:'QA automation writes disabled'};}
export async function getCampaignAnalytics(){return {success:false,error:'QA analytics disabled'};}
`;
const plugin = {name:'sample-email-actions',setup(builder){
  builder.onResolve({filter:/^(next\/link|@\/app\/actions\/email-campaigns)$/},args=>({path:args.path,namespace:'fixture'}));
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='next/link'?"import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}":fixture,loader:'jsx',resolveDir:root}));
  builder.onResolve({filter:/^@\//},args=>{const base=path.join(root,args.path.slice(2));const file=['','.js','.tsx','.ts'].map(ext=>base+ext).find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());if(!file)throw new Error('Missing dependency: '+args.path);return {path:file};});
  // Adapt worker loading only; all form, import and recipient logic stays real.
  builder.onLoad({filter:/CampaignRecipients\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace("new URL('../../lib/email-recipient-import.worker.ts', import.meta.url)",JSON.stringify(workerUrl)).replace("{ type: 'module' }",productionWorker ? '{}' : "{ type: 'module' }"),loader:'tsx',resolveDir:path.dirname(args.path)}));
}};
const bundle = await build({stdin:{contents:entry,loader:'jsx',resolveDir:root},loader:{'.js':'jsx'},bundle:true,write:false,jsx:'automatic',format:'iife',plugins:[plugin],define:{'process.env.NODE_ENV':'"development"'}});
const worker = await build({entryPoints:['lib/email-recipient-import.worker.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
const globals = await postcss([tailwind({base:root,optimize:false})]).process(fs.readFileSync('app/globals.css','utf8'),{from:path.join(root,'app/globals.css')});
const css=globals.css+'\n'+fs.readFileSync('app/mobile.css','utf8');
http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(productionAssets.has(req.url)){res.setHeader('Content-Type','application/javascript');res.end(productionAssets.get(req.url));return;}
  if(req.url==='/preview.js'||req.url==='/recipient-import-worker.js'){res.setHeader('Content-Type','application/javascript');res.end(req.url==='/preview.js'?bundle.outputFiles[0].text:worker.outputFiles[0].text);return;}
  if(req.url==='/preview.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Campaign recipient QA · sample only</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>');
}).listen(4322,'127.0.0.1',()=>console.log('Sample-only recipient QA: http://127.0.0.1:4322' + (productionWorker ? ' (Next production worker)' : '')));
