import { prepareOfflineController } from '../d3-24-offline-controller/controller.mjs';
import { D324_TIME } from '../../backend/src/application/d324-authority.ts';
import { RUN1 } from '../d3-24-ratification/identity.mjs';

// Composition adapter. The only execution port currently connected is the
// existing synthetic controller. No alternate entrypoint or authority loader.
export async function prepareD324Bridge({ sessionOptions, localControl, port }) {
  const { control } = sessionOptions;
  if (port.classification !== 'OFFLINE_SYNTHETIC' ||
      typeof control.admitRevalidated !== 'function' || typeof control.discard !== 'function')
    throw Error('D324_BRIDGE_BINDINGS_REQUIRED');

  let prepared;
  const bridgeControl = Object.freeze({
    async prepare(headers) {
      const receipt = await control.prepare(headers);
      prepared = Object.freeze({ id: receipt.id, effectiveNotAfter: receipt.effectiveNotAfter });
      return receipt;
    },
    async admitRevalidated(id, headers, input) {
      if (id !== prepared?.id || Date.now() >= prepared.effectiveNotAfter)
        throw Error('D324_BRIDGE_SESSION_WINDOW_CLOSED');
      // The server remains the admission authority. No client receipt, local
      // pin or clock can replace its signed-input and transaction checks.
      return control.admitRevalidated(id, headers, input);
    },
    checkAdmission: ack => control.checkAdmission(ack),
    discard: id => control.discard(id),
  });
  const controller = await prepareOfflineController({ classification: 'OFFLINE_SYNTHETIC',
    sessionOptions: { ...sessionOptions, control: bridgeControl }, localControl, port });
  return Object.freeze({
    summary: Object.freeze({ ...controller.summary, operatorSha: RUN1.businessSha, planHash: RUN1.planHash,
      effectiveNotAfter: prepared.effectiveNotAfter, maximumExecutionMs: D324_TIME.executionMs,
      sessionMarginMs: D324_TIME.sessionMarginMs }),
    async execute(fixture) {
      if (!fixture || Object.keys(fixture).length !== 1 ||
          !Object.hasOwn(fixture, 'fixtureOnly') || fixture.fixtureOnly !== true) {
        await controller.close();
        throw Error('D324_BRIDGE_FIXTURE_REQUIRED');
      }
      return controller.execute(Object.freeze({ fixtureOnly: true }));
    },
    close: controller.close,
  });
}
