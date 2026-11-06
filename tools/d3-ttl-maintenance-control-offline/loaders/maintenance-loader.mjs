import {readScopedHandle} from '../custody.mjs';
export const loadMaintenanceHandle=(port,namespace)=>readScopedHandle('MAINTENANCE',port,namespace);
