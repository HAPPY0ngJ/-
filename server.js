const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

const users = new Map();
const dms = new Map();
const globalMsgs = [];
const clients = new Map();

function dmKey(a,b){return[a,b].sort().join('::');}
function uid(){return crypto.randomBytes(6).toString('hex');}

function broadcast(name,data){
  const res=clients.get(name);
  if(res)res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function broadcastAll(data){
  clients.forEach(res=>res.write(`data: ${JSON.stringify(data)}\n\n`));
}
function broadcastOnline(){
  const online=[...users.values()].filter(u=>Date.now()-u.ts<10000);
  clients.forEach(res=>res.write(`data: ${JSON.stringify({type:'online',users:online})}\n\n`));
}

function body(req){
  return new Promise((resolve,reject)=>{
    let b='';
    req.on('data',c=>b+=c);
    req.on('end',()=>{try{resolve(JSON.parse(b));}catch{resolve({});}});
    req.on('error',reject);
  });
}
function json(res,data,code=200){
  res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
  res.end(JSON.stringify(data));
}

const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}

  const url=new URL(req.url,`http://localhost`);
  const p=url.pathname;

  // index.html
  if(req.method==='GET'&&p==='/'){
    const file=fs.readFileSync(path.join(__dirname,'index.html'));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(file);return;
  }

  // register user
  if(req.method==='POST'&&p==='/user'){
    const{name,color}=await body(req);
    if(!name)return json(res,{error:'no name'},400);
    users.set(name,{name,color,ts:Date.now()});
    broadcastOnline();
    return json(res,{ok:true});
  }

  // delete user (탈퇴)
  if(req.method==='DELETE'&&p.startsWith('/user/')){
    const name=decodeURIComponent(p.slice(6));
    users.delete(name);
    clients.delete(name);
    broadcastOnline();
    return json(res,{ok:true});
  }

  // global chat history
  if(req.method==='GET'&&p==='/global'){
    return json(res,globalMsgs);
  }

  // global chat send
  if(req.method==='POST'&&p==='/global'){
    const{from,text,color}=await body(req);
    if(!from||!text)return json(res,{error:'missing'},400);
    const msg={id:uid(),from,text,color,ts:Date.now()};
    globalMsgs.push(msg);
    if(globalMsgs.length>500)globalMsgs.shift();
    broadcastAll({type:'global',message:msg});
    return json(res,{ok:true});
  }

  // DM history
  if(req.method==='GET'&&p.startsWith('/dm/')){
    const parts=p.slice(4).split('/');
    if(parts.length<2)return json(res,[]);
    const key=dmKey(decodeURIComponent(parts[0]),decodeURIComponent(parts[1]));
    return json(res,dms.get(key)||[]);
  }

  // DM send
  if(req.method==='POST'&&p==='/dm'){
    const{from,to,text,color}=await body(req);
    if(!from||!to||!text)return json(res,{error:'missing'},400);
    const msg={id:uid(),from,to,text,color,ts:Date.now()};
    const key=dmKey(from,to);
    if(!dms.has(key))dms.set(key,[]);
    const hist=dms.get(key);
    hist.push(msg);
    if(hist.length>500)hist.shift();
    broadcast(from,{type:'dm',message:msg});
    broadcast(to,{type:'dm',message:msg});
    return json(res,{ok:true});
  }

  // SSE
  if(req.method==='GET'&&p.startsWith('/events/')){
    const name=decodeURIComponent(p.slice(8));
    res.writeHead(200,{
      'Content-Type':'text/event-stream',
      'Cache-Control':'no-cache',
      'Connection':'keep-alive',
      'Access-Control-Allow-Origin':'*',
    });
    clients.set(name,res);
    const online=[...users.values()].filter(u=>Date.now()-u.ts<10000);
    res.write(`data: ${JSON.stringify({type:'online',users:online})}\n\n`);
    req.on('close',()=>{clients.delete(name);});
    return;
  }

  res.writeHead(404);res.end('Not found');
});

setInterval(()=>{
  const now=Date.now();let changed=false;
  users.forEach((u,k)=>{if(now-u.ts>10000){users.delete(k);changed=true;}});
  if(changed)broadcastOnline();
},5000);

server.listen(PORT,()=>console.log(`\n🚀 Vela Chat → http://localhost:${PORT}\n`));
