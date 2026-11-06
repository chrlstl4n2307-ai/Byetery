import {readScopedHandle} from '../custody.mjs';
export const loadBusinessHandle=(port,namespace)=>readScopedHandle('BUSINESS',port,namespace);
