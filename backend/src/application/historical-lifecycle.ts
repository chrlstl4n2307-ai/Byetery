import {ensure} from '../domain.ts';

/** Owner-retired partial RUN1: public identifiers, not a new state machine. */
export const HISTORICAL_DEPLOYMENT='5c0cad2f-5f25-4216-8068-6cb9d2d26325';
export const HISTORICAL_BATTERY='BYE-D3-R1-20261104-AF7A44A515AC';
export function assertLifecycleWritable(deploymentId:string,batteryId:string):void{
  ensure(deploymentId!==HISTORICAL_DEPLOYMENT||batteryId!==HISTORICAL_BATTERY,'HistoricalLifecyclePermanentlyNonCounting');
}
