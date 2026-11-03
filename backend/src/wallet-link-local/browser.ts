import { TARGET, WALLET_A, challengeText, selectedWallet, signChallenge, type Challenge, type Profile, type Provider } from './protocol.ts';
declare global {interface Window {freighterApi?:Provider}}
const element=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const login=element<HTMLFormElement>('login'),password=element<HTMLInputElement>('password');
const connect=element<HTMLButtonElement>('connect'),sign=element<HTMLButtonElement>('sign'),logout=element<HTMLButtonElement>('logout');
const loginButton=element<HTMLButtonElement>('login-button');
let profile:Profile|null=null,challenge:Challenge|null=null,sessionBusy=false;
function message(text:string){element('status').textContent=text;}
function sessionControls(){loginButton.disabled=sessionBusy||!!profile;connect.disabled=sessionBusy||!profile;logout.disabled=sessionBusy||!profile;sign.disabled=sessionBusy||!profile||!challenge;}
function reset(){profile=null;challenge=null;element('summary').textContent='';element('wallets').textContent='';sessionControls();}
class RequestError extends Error {
  readonly status:number;readonly code:string;
  constructor(status:number,code:string){super(code);this.status=status;this.code=code;}
}
async function request<T>(path:string,body?:unknown):Promise<T> {
  const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
    headers:body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok){
    // Only this known recovery code crosses the UI boundary; never echo raw error payloads.
    let code='RequestRejected';
    try{const error=await response.json() as {error?:{code?:unknown}};if(error.error?.code==='LogoutFirst')code='LogoutFirst';}catch{ /* Safe generic failure. */ }
    throw new RequestError(response.status,code);
  }
  return response.json() as Promise<T>;
}
function renderProfile(p:Profile) {
  if(!p || p.source!=='TESTNET' || !Array.isArray(p.wallets) || !p.wallets.some(w=>w?.address===WALLET_A))throw new Error('ProfileRejected');
  profile=p;
  element('wallets').textContent=`Wallet A: ${p.wallets.some(w=>w.address===WALLET_A)?'VERIFICADA':'AUSENTE'} · Wallet B: ${p.wallets.some(w=>w.address===TARGET && Number.isFinite(Date.parse(w.verifiedAt)))?'VERIFICADA':'PENDIENTE'}`;
}
login.addEventListener('submit',async event=>{
  event.preventDefault();if(sessionBusy){password.value='';return;}sessionBusy=true;sessionControls();
  try {
    const pending=request('/auth/login',{email:element<HTMLInputElement>('email').value,password:password.value});password.value='';
    await pending;renderProfile(await request<Profile>('/api/me'));
    message('Sesión validada. Selecciona Wallet B y Testnet en Varial. Conectar no solicita una firma.');
  }catch(error){
    if(error instanceof RequestError && error.status===409 && error.code==='LogoutFirst'){
      try{renderProfile(await request<Profile>('/api/me'));message('Ya existe una sesión activa. Puedes continuar o cerrar sesión.');}
      catch{reset();message('No se pudo restaurar la sesión. Inicia sesión de nuevo.');}
    }else{
      if(!profile || error instanceof RequestError && [401,403].includes(error.status) || error instanceof Error && error.message==='ProfileRejected')reset();
      message(profile?'No se pudo completar el intento. El perfil anterior se conserva; puedes cerrar sesión.':'Login o perfil rechazado. Usa la cuenta existente que ya tiene Wallet A. No se cambió ninguna credencial.');
    }
  }
  finally{password.value='';sessionBusy=false;sessionControls();}
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
  if(sessionBusy)return;sessionBusy=true;sessionControls();
  try{await request('/auth/logout',{});reset();message('Sesión local cerrada.');}
  catch{
    try{renderProfile(await request<Profile>('/api/me'));message('No se pudo confirmar el cierre. La sesión sigue activa; puedes intentar cerrarla.');}
    catch{reset();message('Sesión local no disponible; cierre remoto no confirmado.');}
  }finally{password.value='';sessionBusy=false;sessionControls();}
});
reset();
async function restoreOnLoad(){
  sessionBusy=true;sessionControls();
  try{renderProfile(await request<Profile>('/api/me'));message('Ya existe una sesión activa. Puedes continuar o cerrar sesión.');}
  catch{reset();message('Inicia sesión con la cuenta existente que ya tiene Wallet A.');}
  finally{sessionBusy=false;sessionControls();}
}
void restoreOnLoad();
