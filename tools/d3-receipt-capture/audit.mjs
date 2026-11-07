import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {SQL_RECEIPT_QUERY} from './sources.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const ts=require('typescript');
const production=['capture.mjs','sources.mjs'];
const allowed=new Set(['node:fs/promises','node:path','node:crypto','node:perf_hooks','node:timers/promises','../d3-evidence-capture/comparison.mjs','../d3-evidence-capture/xdr-reader.mjs','./sources.mjs']);
const forbidden=new Set(['sign','signEnvelope','authorize','sendTransaction','simulateTransaction','broadcast','prepareAndSimulate','prepareReplacement','runMutation','mutate','step','exec','execFile','execFileSync','spawn','spawnSync','eval','Function','TransactionBuilder','Keypair']);
export function auditCaptureSource(text,name='capture.mjs'){
 const tree=ts.createSourceFile(name,text,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);
 function fail(){throw Error('CAPTURE_MUTATION_OR_UNKNOWN_CAPABILITY');}
 function visit(node){
  if(ts.isImportDeclaration(node)){if(!ts.isStringLiteral(node.moduleSpecifier)||!allowed.has(node.moduleSpecifier.text))fail();}
  if(ts.isCallExpression(node)||ts.isNewExpression(node)){
   const e=node.expression,n=ts.isIdentifier(e)?e.text:ts.isPropertyAccessExpression(e)?e.name.text:null;
   if(forbidden.has(n)||ts.isElementAccessExpression(e)||e.kind===ts.SyntaxKind.ImportKeyword||n==='require')fail();
   if(n==='fetch'&&name!=='sources.mjs')fail();
   if(n==='fetch'&&(!ts.isIdentifier(node.arguments[0])||node.arguments[0].text!=='RPC'))fail();
   if(n==='query'){
    const q=node.arguments[0];
    if(ts.isStringLiteral(q)){if(!['BEGIN TRANSACTION READ ONLY','ROLLBACK'].includes(q.text))fail();}
    else if(ts.isObjectLiteralExpression(q)){
     const text=q.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(tree)==='text');
     if(!text||!ts.isIdentifier(text.initializer)||text.initializer.text!=='SQL_RECEIPT_QUERY')fail();
    }else fail();
   }
  }
  if(ts.isPropertyAssignment(node)&&node.name.getText(tree)==='method'&&ts.isStringLiteral(node.initializer)&&!['POST','getTransaction'].includes(node.initializer.text))fail();
  ts.forEachChild(node,visit);
 }
 visit(tree);return true;
}
export function auditCaptureTooling(){
 for(const name of production)auditCaptureSource(readFileSync(resolve(root,name),'utf8'),name);
 if(!/^SELECT\s/.test(SQL_RECEIPT_QUERY)||/;|\b(?:INSERT|UPDATE|DELETE|MERGE|CALL|DO|COPY|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|SET)\b/i.test(SQL_RECEIPT_QUERY))throw Error('SQL_NOT_SELECT_ONLY');
 const sources=readFileSync(resolve(root,'sources.mjs'),'utf8');
 if(!sources.includes("method:'getTransaction'")||!sources.includes("const RPC='https://soroban-testnet.stellar.org'")||!sources.includes("redirect:'error'")||!sources.includes("'BEGIN TRANSACTION READ ONLY'"))throw Error('READONLY_BOUNDARY_NOT_FOUND');
 const helperPaths=['comparison.mjs','xdr-reader.mjs','common.mjs'];
 for(const name of helperPaths){const text=readFileSync(resolve(root,'../d3-evidence-capture',name),'utf8');
  if(/\.\s*(?:sign|signEnvelope|authorize|sendTransaction|simulateTransaction|broadcast)\s*\(/.test(text)||/from\s+['"][^'"]*backend\/src/.test(text))throw Error('READONLY_HELPER_DRIFT');
 }
 return {status:'PASS',CAPTURE_TOOLING_NETWORK_MUTATION_PATHS:0,productionFiles:production,sqlQuerySha256:createHash('sha256').update(SQL_RECEIPT_QUERY).digest('hex'),
  rpcMethods:['getTransaction'],fixedRpc:'https://soroban-testnet.stellar.org',sqlStatements:['BEGIN TRANSACTION READ ONLY','fixed parameterized SELECT','ROLLBACK'],
  arbitrarySql:false,fullSdkRoot:false,signer:false,transactionBuilder:false,childProcesses:false,scope:'Reviewed module graph and immutable source adapters; assumes trusted Node/OS and the existing pool. Not protection against replacement of the runtime or a malicious supplied pool.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(auditCaptureTooling(),null,2));
