const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

const users = new Map();
const friends = new Map();
const dms = new Map();
const clients = new Map();

function dmKey(a, b) { return [a, b].sort().join('::'); }
function uid() { return crypto.randomBytes(6).toString('hex'); }

function broadcast(name, data) {
  const res = clients.get(name);
  if (res) res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastOnline() {
  const online = [...users.values()].filter(u => Date.now() - u.ts < 10000);
  clients.forEach((res, name) => {
    res.write(`data: ${JSON.stringify({ type: 'online', users: online })}\n\n`);
  });
}

function body(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function json(res, data, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost`);
  const p = url.pathname;

  if (req.method === 'GET' && p === '/') {
    const file = fs.readFileSync(path.join(__dirname, 'index.html'));
    res.writeHead(200, { 'Content-Type':
