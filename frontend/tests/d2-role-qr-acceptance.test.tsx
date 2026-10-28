import {Children,isValidElement,type ReactElement} from 'react';
import {render,screen} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {QRCodeSVG} from 'qrcode.react';
import {SessionProvider,Shell} from '@/components/session';
import {BatteryQR} from '@/components/battery';
import {request,qrValue} from '@/lib/client';
import {WebRuntimeProvider} from '@/components/web-runtime';
import type {Profile,Role} from '@/lib/types';
import Admin from '@/app/admin/page';
import Collector from '@/app/collector/page';
import Recycler from '@/app/recycler/page';
import Dashboard from '@/app/dashboard/page';
import BatteryPage from '@/app/battery/[batteryId]/page';

const mocks=vi.hoisted(()=>({push:vi.fn(),replace:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>mocks,usePathname:()=>'/dashboard',notFound:()=>{throw Error('FIXTURE_NOT_FOUND');}}));
vi.mock('@/lib/client',async original=>({...await original<typeof import('@/lib/client')>(),request:vi.fn()}));
const api=vi.mocked(request),id='BYE-D2-005-QR';
let roles:Role[]=['USER'];
beforeEach(()=>{
 roles=['USER'];mocks.push.mockReset();mocks.replace.mockReset();api.mockReset();
 api.mockImplementation(async path=>{
  if(path==='/auth/session')return {user:{id:'fixture-user',email:'fixture@example.test'}};
  if(path==='/api/me')return {userId:'fixture-user',roles,wallets:[],requests:[],hasMoreRequests:false,source:'MOCK'} satisfies Profile;
  return {batteryId:id,confirmedBatteryState:'REGISTERED',confirmedRewardState:'NOT_ELIGIBLE',source:'MOCK',pendingOperation:null,lastAttempt:null,metadata:{}};
 });
});
function mount(child:React.ReactNode){return render(<WebRuntimeProvider value={{environment:'DEV',source:'MOCK',readOnly:false}}><SessionProvider><Shell>{child}</Shell></SessionProvider></WebRuntimeProvider>);}
const pages=[['ADMIN',Admin,'Una identidad para cada batería'],['COLLECTOR',Collector,'Confirmar recepción'],['RECYCLER',Recycler,'Confirmar reciclaje']] as const;

it('actual USER dashboard route renders through the real SessionProvider and Gate',async()=>{
 mount(<Dashboard/>);await screen.findByRole('heading',{name:'Tu actividad circular'});
 expect(screen.queryByRole('link',{name:'Administración'})).toBeNull();
 expect(screen.queryByRole('link',{name:'Recolección'})).toBeNull();
 expect(screen.queryByRole('link',{name:'Reciclaje'})).toBeNull();
});
for(const [required,Page,heading] of pages){
 for(const role of ['USER','ADMIN','COLLECTOR','RECYCLER'] as const)it(`${role} interface access to ${required} uses its own role only`,async()=>{
  roles=role==='USER'?['USER']:['USER',role];mount(<Page/>);
  if(role===required)expect(await screen.findByRole('heading',{name:heading})).toBeTruthy();
  else {await screen.findByRole('heading',{name:'Acceso restringido'});expect(screen.queryByRole('heading',{name:heading})).toBeNull();}
 });
}
it('actual BatteryQR passes only production qrValue into the real encoder and matching link',()=>{
 const element=BatteryQR({id});
 const encoder=Children.toArray(element.props.children).find(child=>isValidElement(child)&&child.type===QRCodeSVG) as ReactElement<{value:string}>;
 expect(encoder).toBeTruthy();expect(encoder.props.value).toBe(qrValue(id));expect(encoder.props.value).toBe('/battery/BYE-D2-005-QR');
 const {container}=render(element);expect(container.querySelector('svg path')).toBeTruthy();
 expect(screen.getByRole('link',{name:id}).getAttribute('href')).toBe(encoder.props.value);
 expect(screen.getByText('Solo identifica la batería. No concede permisos.')).toBeTruthy();
 expect(new URL(encoder.props.value,'http://127.0.0.1:3000').search).toBe('');
 expect(encoder.props.value).not.toMatch(/token|session|role|membership|wallet|request|password|jwt|idempotency/i);
});
it('production QR normalizes only identifier navigation and malformed input stays in its encoded segment',()=>{
 expect(qrValue('  bye-d2-005-qr ')).toBe('/battery/'+id);
 for(const value of ['../admin','BYE/../../admin','BYE?role=ADMIN']){
  const path=qrValue(value);expect(path.startsWith('/battery/')).toBe(true);
  expect(new URL(path,'http://127.0.0.1:3000').search).toBe('');
  expect(path).not.toMatch(/\/admin$/i);
 }
});
it('actual battery route renders its known normalized record',async()=>{
 mount(await BatteryPage({params:Promise.resolve({batteryId:id})}));
 await screen.findByRole('heading',{name:id});expect(api).toHaveBeenCalledWith('/api/batteries/'+id);
});
it.each(['bye-d2-005-qr','A'.repeat(33),'BYE_0001','../admin','BYE/../../admin','BYE?role=ADMIN'])(
 'actual battery route rejects invalid decoded segment %s before fetching data',async batteryId=>{
  await expect(BatteryPage({params:Promise.resolve({batteryId})})).rejects.toThrow('FIXTURE_NOT_FOUND');expect(api).not.toHaveBeenCalled();
 });
