import {defineConfig} from '../../frontend/node_modules/vitest/dist/config.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../frontend/',import.meta.url));
export default defineConfig({root,envDir:false,
 plugins:[{name:'b44-nonsuperuser-fixture-connection-only',enforce:'pre',transform(source,id){
  if(!id.replaceAll('\\','/').endsWith('/frontend/tests/review-postgres.ts'))return;
  // Preserve source files and all assertions. Select the already-approved direct
  // NOSUPERUSER executor for fixture setup; the restricted app connection stays.
  const replacements=[
   ['new Pool({ ...config, max: 2, connectionTimeoutMillis: 3000 })','new Pool({ ...config, user: "postgres", max: 2, connectionTimeoutMillis: 3000 })'],
   ['new Pool({ ...config, database, max: 2 })','new Pool({ ...config, database, user: "postgres", max: 2 })']
  ];
  for(const [from,to] of replacements){if(source.split(from).length!==2)throw Error('UnexpectedFixtureConnectionShape');source=source.replace(from,to);}
  return {code:source,map:null};
 }}],
 resolve:{alias:{'@':fileURLToPath(new URL('../../frontend/src',import.meta.url)),
  'server-only':fileURLToPath(new URL('../../frontend/tests/server-only-stub.ts',import.meta.url))}},
 test:{maxWorkers:1,fileParallelism:false,environment:'jsdom',include:['tests/**/*.test.{ts,tsx}'],
  setupFiles:[fileURLToPath(new URL('../../frontend/tests/setup.ts',import.meta.url))]}
});
