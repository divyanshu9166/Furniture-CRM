// Local interactive QA using the REAL sender components, but sample data only.
// No auth, credentials, database, SMTP, save API or email sending is involved.
import fs from 'node:fs';
import http from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const entry = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SenderSettings from './components/email/SenderSettings.js';
import SenderSelect from './components/email/SenderSelect.js';
function Preview() {
  const [config, setConfig] = useState({smtpUser:'info@example.com',smtpFromName:'Example Furniture',smtpFromEmail:'info@example.com',smtpAliases:[{email:'contact@example.com',name:'Contact'},{email:'sales@example.com',name:'Sales'},{email:'support@example.com',name:'Support'}]});
  const [testFrom, setTestFrom] = useState('');
  const [selected, setSelected] = useState('sales@example.com');
  const senders = [{email:config.smtpUser,name:config.smtpFromName},...config.smtpAliases].filter(sender => sender.email);
  return <main className="dashboard-content max-w-4xl mx-auto p-5 space-y-5">
    <h1 className="text-xl font-bold">Email sender configuration</h1><p className="text-xs text-muted">Interactive QA · sample addresses · no emails sent or settings saved</p>
    <div className="glass-card p-4"><SenderSettings config={config} onChange={setConfig} testFrom={testFrom} onTestFromChange={setTestFrom} /></div>
    <div className="glass-card p-4 space-y-3"><h2 className="font-semibold">Campaign sender</h2><SenderSelect value={selected} onChange={setSelected} senders={senders} defaultEmail={config.smtpFromEmail} /><output aria-label="Chosen campaign sender" className="block text-xs break-all">Selected: {selected || config.smtpFromEmail}</output></div>
    <output aria-label="Configured sender state" className="block text-xs break-all">Default: {config.smtpFromEmail} · Aliases: {config.smtpAliases.length}</output>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
`;
const js = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'jsx' }, loader: { '.js': 'jsx' }, bundle: true, write: false, jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' } });
const globals = await postcss([tailwind({ base: process.cwd(), optimize: false })]).process(fs.readFileSync('app/globals.css', 'utf8'), { from: `${process.cwd()}/app/globals.css` });
const css = `${globals.css}\n${fs.readFileSync('app/mobile.css', 'utf8')}`;
http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/preview.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(js.outputFiles[0].text); return; }
  if (req.url === '/preview.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email Alias QA</title><link rel="stylesheet" href="/preview.css"></head><body class="font-sans bg-background text-foreground"><div id="root"></div><script src="/preview.js"></script></body></html>');
}).listen(4318, '127.0.0.1', () => console.log('Interactive alias QA: http://127.0.0.1:4318 (sample only, no SMTP/DB)'));
