import {ensure,type Command} from '../domain.ts';

export type ApplicationCommandKind=Exclude<Command['kind'],'set_role'>;
export interface RequiredAuthority {
 role:'USER'|'ADMIN'|'COLLECTOR'|'RECYCLER';
 ownsRequest?:true;
 actorField?:'collector'|'recycler';
}
// Exhaustive at compile time, own-property checked at runtime. No client-selected role.
const fixed={
 register_battery:{role:'ADMIN'},
 open_return:{role:'USER'},
 cancel_return:{role:'USER',ownsRequest:true},
 confirm_collection:{role:'COLLECTOR',actorField:'collector'},
 confirm_recycling:{role:'RECYCLER',actorField:'recycler'},
} as const satisfies Record<Exclude<ApplicationCommandKind,'pay_reward'>,RequiredAuthority>;

/** requestOwner comes from SQL. Durable rewards use their immutable attempt/request link. */
export function requiredAuthority(kind:Command['kind'],principal:string,requestOwner:string|null=null):RequiredAuthority {
 if(kind==='pay_reward')return requestOwner===principal?{role:'USER',ownsRequest:true}:{role:'ADMIN'};
 ensure(Object.hasOwn(fixed,kind),'AuthorizationRevoked');
 return fixed[kind as keyof typeof fixed];
}
