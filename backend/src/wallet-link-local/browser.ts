import { TARGET, WALLET_A, challengeText, selectedWallet, signChallenge, type Challenge, type Profile, type Provider } from './protocol.ts';
declare global {interface Window {freighterApi?:Provider}}
const element=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const login=element<HTMLFormElement>('login'),password=element<HTMLInputElement>('password');
const connect=element<HTMLButtonElement>('connect'),sign=element<HTMLButtonElement>('sign'),logout=element<HTMLButtonElement>('logout');
let profile:Profile|null=null,challenge:Challenge|null=null;
function message(text:string){element('status').textContent=text;}
function reset(){profile=null;challenge=null;sign.disabled=true;connect.disabled=true;logout.disabled=true;element('summary').textContent='';element('wallets').textContent='';}
async function request<T>(path:string,body?:unknown):Promise<T> {
  const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
    headers:body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok)throw new Error('RequestRejected');return response.json() as Promise<T>;
}
function renderProfile(p:Profile) {
  if(p.source!=='TESTNET' || !p.wallets.some(w=>w.address===WALLET_A))throw new Error('ProfileRejected');
  profile=p;
  element('wallets').textContent=`Wallet A: ${p.wallets.some(w=>w.address===WALLET_A)?'VERIFICADA':'AUSENTE'} · Wallet B: ${p.wallets.some(w=>w.address===TARGET && Number.isFinite(Date.parse(w.verifiedAt)))?'VERIFICADA':'PENDIENTE'}`;
}
login.addEventListener('submit',async event=>{
  event.preventDefault();reset();element<HTMLButtonElement>('login-button').disabled=true;
  try {
    const pending=request('/auth/login',{email:element<HTMLInputElement>('email').value,password:password.value});password.value='';
    await pending;renderProfile(await request<Profile>('/api/me'));
    connect.disabled=false;logout.disabled=false;message('Sesión validada. Selecciona Wallet B y Testnet en Varial. Conectar no solicita una firma.');
  }catch{reset();message('Login o perfil rechazado. Usa la cuenta existente que ya tiene Wallet A. No se cambió ninguna credencial.');}
  finally{password.value='';element<HTMLButtonElement>('login-button').disabled=false;}
});
connect.addEventListener('click',async()=>{
  connect.disabled=true;sign.disabled=true;challenge=null;
  try {
    const provider=window.freighterApi;if(!provider || !profile)throw new Error('WalletUnavailable');
    const account=await provider.requestAccess();if(account.error || account.address!==TARGET)throw new Error('WalletMismatch');
    await selectedWallet(provider);
    const issued=await request<Challenge>('/api/wallet/challenge',{address:TARGET});
    challengeText(issued,profile.userId);challenge=issued;
    element('summary').textContent=`Network: Stellar Testnet\nPurpose: Link wallet to Byetery\nAddress: ${TARGET}\nAction: MESSAGE SIGNATURE ONLY\nExpires: ${issued.expiresAt}`;
    sign.disabled=false;message('Desafío preparado. Revisa el resumen. La firma requiere tu siguiente clic y aprobación personal en la wallet.');
  }catch{challenge=null;message('STOP: cuenta, red, sesión o desafío incompatible. No se solicitó firma.');}
  finally{connect.disabled=!profile;}
});
sign.addEventListener('click',async()=>{
  sign.disabled=true;connect.disabled=true;logout.disabled=true;
  try {
    const provider=window.freighterApi;if(!provider || !challenge || !profile)throw new Error('NotReady');
    message('Aprueba tú mismo solo la firma del mensaje Byetery. CANCELA si aparece una transacción o autorización Soroban.');
    const signature=await signChallenge(provider,challenge,profile.userId);
    const result=await request<{verified:boolean;address:string;source:string}>('/api/wallet/verify',{challengeId:challenge.challengeId,signature});
    if(!result.verified || result.address!==TARGET || result.source!=='TESTNET')throw new Error('VerificationRejected');
    renderProfile(await request<Profile>('/api/me'));
    if(!profile.wallets.some(w=>w.address===TARGET))throw new Error('LinkMissing');
    message('Wallet B verificada. Wallet A preservada. STOP: no se ejecuta ningún lifecycle ni RUN1.');
  }catch{message('Firma cancelada o verificación no confirmada. STOP. Consulta el perfil antes de reintentar; no se asume éxito.');}
  finally{challenge=null;element('summary').textContent='';connect.disabled=!profile;logout.disabled=!profile;}
});
logout.addEventListener('click',async()=>{
  try{await request('/auth/logout',{});message('Sesión local cerrada.');}
  catch{message('Sesión local eliminada; cierre remoto no confirmado.');}finally{reset();password.value='';}
});
reset();
