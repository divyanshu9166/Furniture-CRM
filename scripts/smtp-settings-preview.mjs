// Actual SMTP settings JSX with sample state only. No server action, database,
// credentials, SMTP connection or outgoing email is involved.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const root = process.cwd();
const page = fs.readFileSync('app/(dashboard)/settings/page.js', 'utf8');
const start = page.indexOf('{/* SMTP Presets */}');
const end = page.indexOf('<SenderSettings config={smtpForm}', start);
if (start < 0 || end < 0) throw new Error('SMTP settings JSX not found');
const fields = page.slice(start, end);
const entry = `
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import {Eye,EyeOff} from 'lucide-react';
import SenderSettings from '@/components/email/SenderSettings';
import {changeSmtpPort,changeSmtpEncryption,smtpTransportProblem,smtpConfigSchema,formatSmtpError} from '@/lib/email-senders';
function Preview(){
 const [smtpForm,setSmtpForm]=useState({smtpHost:'smtp.hostinger.com',smtpPort:587,smtpSecure:true,smtpUser:'info@example.com',smtpPass:'',smtpFromName:'Example Furniture',smtpFromEmail:'sales@example.com',smtpAliases:[{email:'sales@example.com',name:'Sales'}]});
 const [showSmtpPass,setShowSmtpPass]=useState(false),[result,setResult]=useState(null),[testFrom,setTestFrom]=useState('');
 const smtpHasPassword=true,smtpTransportError=smtpTransportProblem(smtpForm.smtpPort,smtpForm.smtpSecure);
 function changeSmtpForm(update){setSmtpForm(update);setResult(null)}
 return <main className="dashboard-content max-w-4xl mx-auto p-5 space-y-4"><h1 className="text-xl font-bold">Email Setup (SMTP)</h1><p className="text-sm text-muted">Local sample preview — no SMTP, save or email sending.</p><div className="glass-card p-4 sm:p-6 space-y-4">${fields}<SenderSettings config={smtpForm} onChange={changeSmtpForm} testFrom={testFrom} onTestFromChange={setTestFrom}/><button disabled={!!smtpTransportError} className="rounded-xl bg-accent px-4 py-3 text-white disabled:opacity-40" onClick={()=>{const parsed=smtpConfigSchema.safeParse({...smtpForm,smtpPass:'sample-only-not-a-real-password'});setResult(parsed.success?'Configuration valid (sample only; no SMTP connection made).':formatSmtpError(parsed.error))}}>Validate sample configuration</button>{result&&<p role="status" className="text-sm text-foreground">{result}</p>}<output aria-label="Transport state" className="block text-sm text-muted">Port: {smtpForm.smtpPort} · Mode: {smtpForm.smtpSecure?'SSL/TLS':'STARTTLS'} · Default: {smtpForm.smtpFromEmail}</output></div></main>
}
createRoot(document.getElementById('root')).render(<Preview/>);
`;
const plugin = {name:'smtp-qa',setup(builder){builder.onResolve({filter:/^@\//},args=>{
 const base=path.join(root,args.path.slice(2));
 const found=['','.js','.tsx','.ts'].map(ext=>base+ext).find(file=>fs.existsSync(file)&&fs.statSync(file).isFile());
 if(!found)throw new Error('Missing preview dependency: '+args.path);
 return {path:found};
})}};
const js=await build({stdin:{contents:entry,loader:'jsx',resolveDir:root},loader:{'.js':'jsx'},bundle:true,write:false,jsx:'automatic',format:'iife',plugins:[plugin],define:{'process.env.NODE_ENV':'"development"'}});
const globals=await postcss([tailwind({base:root,optimize:false})]).process(fs.readFileSync('app/globals.css','utf8'),{from:path.join(root,'app/globals.css')});
const css=globals.css+'\n'+fs.readFileSync('app/mobile.css','utf8');
http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/preview.js'){res.setHeader('Content-Type','application/javascript');res.end(js.outputFiles[0].text);return;}
 if(req.url==='/preview.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>SMTP pairing QA · sample only</title><link rel="stylesheet" href="/preview.css"></head><body class="bg-background text-foreground"><div id="root"></div><script src="/preview.js"></script></body></html>');
}).listen(4321,'127.0.0.1',()=>console.log('Sample-only SMTP pairing QA: http://127.0.0.1:4321'));
