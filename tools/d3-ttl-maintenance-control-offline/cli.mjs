#!/usr/bin/env node
import {local,assertFreeze,check} from './core.mjs';
import {custodyModel,auditSourceGraph} from './custody.mjs';
import {auditInstalledBoundaries} from './audit.mjs';
import {reconstruct} from './journal.mjs';
import {correlateHistory} from './chain.mjs';
import {whitelistProvenance} from './provenance.mjs';
import {model,custodyGraph,fixtureHistory,observation,provenanceFixture} from './fixtures.mjs';
try{local();check(process.argv.length===3&&process.argv[2]==='--local','EXPLICIT_LOCAL_ONLY');assertFreeze();const c=custodyModel(model()),g=custodyGraph(),imports=auditSourceGraph(g.sources,g.definitions),audit=auditInstalledBoundaries(),h=fixtureHistory(3),state=reconstruct(h.records,h.creation,h.checkpoint),anchor=correlateHistory(h.creation,h.records,observation(h)),f=provenanceFixture(),provenance=whitelistProvenance(f.review,f.bundle,'SYNTHETIC_OFFLINE');console.log(JSON.stringify({result:'TTL_CUSTODY_DURABLE_ACCOUNTING_OFFLINE_GATE_READY',classification:'SYNTHETIC_OFFLINE_ONLY',executionAuthorized:false,custody:c.status,importIsolation:imports.status,installedAudit:audit,counters:state.status,syntheticSimulationsUsed:state.simulationsUsed,syntheticExtendAttemptsUsed:state.extendAttemptsUsed,syntheticIncludedCount:anchor.includedCount,businessRemainingUnchanged:state.businessRemaining,provenance:provenance.status,liveAccountsCreated:0,realKeypairsGenerated:0,liveSimulations:0,signatures:0,broadcasts:0},null,2));}catch(e){console.error(JSON.stringify({status:'STOP',code:e.code??'OFFLINE_CONTROL_STOP'}));process.exitCode=1;}
