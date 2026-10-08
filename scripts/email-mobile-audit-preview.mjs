// Local QA only: real email page/sidebar/footer and inventory tab JSX, mocked
// actions/session. No credentials, database, SMTP, production or customer data.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const root = process.cwd();
const inventory = fs.readFileSync('app/(dashboard)/inventory/page.js', 'utf8');
const tabStart = inventory.indexOf('<div className="ui-tabs', inventory.indexOf('{/* Tabs */}'));
const tabEnd = inventory.indexOf("\n      {tab === 'products' && (", tabStart);
if (tabStart < 0 || tabEnd < 0) throw new Error('Inventory tab JSX not found');
const inventoryTabs = inventory.slice(tabStart, tabEnd).trim();
const entry = `
import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
import {Package, MapPin, Bell, FileText, Layers, Boxes, Timer, Menu} from 'lucide-react';
import Sidebar from './components/Sidebar.js'; import BottomNav from './components/BottomNav.js';
import {SidebarProvider,useSidebarContext} from './components/SidebarContext.js';
import EmailMarketingPage from './app/(dashboard)/email-marketing/page.js';
function InventoryTabs() {
 const [tab,setTab] = useState('ledger'); const needsReorder = Array(94).fill(null);
 return <div className="space-y-5"><div className="ui-page-header"><h1 className="text-2xl font-bold">Inventory &amp; Warehouse</h1><p className="text-sm text-muted">Sample layout only · no database or email access</p></div>${inventoryTabs}
 <div className="glass-card p-5"><h2 className="font-semibold">{tab === 'ledger' ? 'Stock ledger' : tab}</h2><p className="text-sm text-muted mt-3">Swipe the navigation strip or use keyboard arrows to reach every tab.</p></div>
 {Array.from({length:8},(_,i)=><div key={i} className="glass-card p-5">Sample stock movement {i+1}</div>)}</div>;
}
function Preview() {
 const {setSidebarOpen} = useSidebarContext(); const email = new URLSearchParams(location.search).get('view')==='email';
 return <div className="flex min-h-screen bg-background"><Sidebar/><div className="dashboard-shell flex-1 min-w-0 md:ml-[260px]"><header className="mobile-top-safe sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-surface px-4 md:h-16"><button aria-label="Open sidebar" className="touch-target md:hidden" onClick={()=>setSidebarOpen(true)}><Menu size={20}/></button><strong>Furzentic · local QA</strong></header><main className="dashboard-content p-3.5 md:p-6 mobile-bottom-safe">{email ? <EmailMarketingPage/> : <InventoryTabs/>}</main></div><BottomNav/></div>;
}
createRoot(document.getElementById('root')).render(<SidebarProvider><Preview/></SidebarProvider>);
`;
const actionsFixture = `
const failure = new URLSearchParams(location.search).get('failure');
const base = {subject:'Office furniture',body:'<p>Hello {{customerName}}</p>',fromEmail:'sales@example.com',fromName:'Sales',audience:'all',isABTest:false,abSplitPercent:50,opened:0,clicked:0,bounced:0,unsubscribed:0,totalRecipients:0,recipientCount:0,sent:0,createdAt:new Date().toISOString(),isAutomated:false};
const campaigns = [{...base,id:1,name:'Sample failed campaign',status:'PAUSED',recipientCount:2,totalRecipients:2},{...base,id:2,name:'Sample lead automation',status:'SCHEDULED',isAutomated:true,triggerType:'new_lead',triggerDelay:36,sent:4,recipientCount:4,totalRecipients:4},{...base,id:3,name:'Sample furniture campaign',status:'DRAFT'}];
export async function getEmailCampaigns(){if(failure==='load')throw new Error('Simulated network failure');return {success:true,data:campaigns};}
export async function getEmailTemplates(){return {success:true,data:[]};}
export async function getAudienceStats(){return {success:true,data:{total:8,withEmail:8,subscribed:8,leads:4,customers:4}};}
export async function getEmailConfigStatus(){return {success:true,configured:true,trackingConfigured:true,smtpUser:'info@example.com',fromEmail:'info@example.com',fromName:'Example Furniture',senders:[{email:'info@example.com',name:'Example Furniture'},{email:'sales@example.com',name:'Sales'}]};}
export async function sendEmailCampaign(){throw new Error('Simulated SMTP/network failure — no email sent');}
export async function createEmailCampaign(){throw new Error('Simulated save failure — no data saved');}
export async function updateEmailCampaign(){throw new Error('Simulated save failure — no data saved');}
export async function createEmailTemplate(){throw new Error('Simulated template save failure');}
export async function updateEmailTemplate(){throw new Error('Simulated template save failure');}
export async function deleteEmailCampaign(){return {success:false,error:'QA: deletion disabled'};}
export async function deleteEmailTemplate(){return {success:false,error:'QA: deletion disabled'};}
export async function duplicateCampaign(){return {success:false,error:'QA: duplication disabled'};}
export async function setEmailAutomationActive(){return {success:false,error:'QA: no settings changed'};}
export async function getCampaignAnalytics(){return {success:false,error:'QA: analytics data disabled'};}
`;
const plugin = { name: 'qa-local-only', setup(builder) {
  builder.onResolve({filter:/^(next\/(link|image|navigation)|@\/components\/AuthProvider|@\/app\/actions\/)/}, args => ({path:args.path,namespace:'fixture'}));
  builder.onLoad({filter:/.*/,namespace:'fixture'}, args => {
    let contents;
    if(args.path==='next/link')contents="import React from 'react'; export default function Link({children,...props}){return <a {...props}>{children}</a>}";
    else if(args.path==='next/image')contents="import React from 'react'; export default function Image({priority,...props}){return <img {...props} src='/logo.png'/>}";
    else if(args.path==='next/navigation')contents="export const usePathname=()=>'/inventory';";
    else if(args.path==='@/components/AuthProvider')contents="export const useSession=()=>({data:{user:{role:'ADMIN',name:'Sample Administrator'}}});";
    else if(args.path.endsWith('/settings'))contents="export const getStoreSettings=async()=>({success:true,data:{}});";
    else if(args.path.endsWith('/indiamart'))contents="export const getIndiaMartConfig=async()=>({success:true,data:{enabled:false}});";
    else if(args.path.endsWith('/email-campaigns'))contents=actionsFixture;
    else throw new Error('Unmocked server action: '+args.path);
    return {contents,loader:'jsx',resolveDir:root};
  });
  builder.onResolve({filter:/^@\//},args=>({path:path.resolve(root,args.path.slice(2))+ (path.extname(args.path) ? '' : '.js')}));
} };
const js=await build({stdin:{contents:entry,resolveDir:root,loader:'jsx'},loader:{'.js':'jsx'},bundle:true,write:false,jsx:'automatic',format:'iife',plugins:[plugin],define:{'process.env.NODE_ENV':'"development"'}});
const compiled=await postcss([tailwind({base:root,optimize:false})]).process(fs.readFileSync('app/globals.css','utf8'),{from:path.join(root,'app/globals.css')});
const css=compiled.css+'\n'+fs.readFileSync('app/mobile.css','utf8');
http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/preview.js'){res.setHeader('Content-Type','application/javascript');res.end(js.outputFiles[0].text);return;}
  if(req.url==='/preview.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
  if(req.url==='/logo.png'){res.setHeader('Content-Type','image/png');res.end(fs.readFileSync('public/logo.png'));return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Email/mobile audit · sample only</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>');
}).listen(4319,'127.0.0.1',()=>console.log('Sample-only email/mobile QA: http://127.0.0.1:4319'));
