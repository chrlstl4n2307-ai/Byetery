import { FreighterAdapter, challengeText } from '/wallet-adapter.js';
const target='GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS';
const adapter=new FreighterAdapter(async()=>window.freighterApi);
const button=document.querySelector('#connect'),sign=document.querySelector('#sign'),status=document.querySelector('#status'),message=document.querySelector('#message');
let challenge=null,pending=null,busy=false;
async function request(path,body,key=crypto.randomUUID()){
  const r=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error'});
  const data=await r.json();if(!r.ok)throw new Error(data.error?.code??'RequestRejected');return data;
}
button.addEventListener('click',async()=>{
  if(busy||pending)return;busy=true;button.disabled=true;sign.disabled=true;status.textContent='Conecta USER-1 en Freighter con Testnet seleccionado.';
  try{
    const account=await adapter.connect();if(account.address!==target)throw new Error('Selecciona la dirección USER-1 indicada. No se solicitó desafío para otra wallet.');
    challenge=await request('/wallet/challenge',{address:target});
    message.textContent=challengeText(challenge);sign.disabled=false;status.textContent='Desafío SEP53_V2 listo. Revisa el mensaje y aprueba personalmente la firma en Freighter.';
  }catch(e){challenge=null;status.textContent=e.message??'No se pudo conectar.';}
  finally{busy=false;button.disabled=false;}
});
sign.addEventListener('click',async()=>{
  if(busy||!challenge)return;busy=true;button.disabled=true;sign.disabled=true;
  try{
    if(!pending){
      const proof=await adapter.signChallenge(challenge);
      if(proof.address!==target)throw new Error('AccountChanged');
      pending={key:crypto.randomUUID(),body:{challengeId:challenge.challengeId,signature:proof.signatureBase64}};
    }
    const result=await request('/wallet/verify',pending.body,pending.key);
    if(result.verified!==true||result.address!==target||result.source!=='TESTNET')throw new Error('VerificationMismatch');
    pending=null;challenge=null;message.textContent='';status.textContent='Wallet USER-1 verificada y vinculada a la cuenta de prueba autenticada. No se ejecutó ninguna transacción Stellar.';
    sign.hidden=true;button.hidden=true;
  }catch(e){status.textContent=e.message??'Verificación pendiente.';if(pending)sign.textContent='Reintentar la misma verificación';}
  finally{busy=false;button.disabled=false;if(challenge)sign.disabled=false;}
});
