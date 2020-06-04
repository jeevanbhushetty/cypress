/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const _ = require("lodash");
const EE = require("events");
const debug = require("debug")("cypress:server:plugins");
const Promise = require("bluebird");

const UNDEFINED_SERIALIZED = "__cypress_undefined__";

const serializeError = err => _.pick(err, "name", "message", "stack", "code", "annotated", "type");

module.exports = {
  serializeError,

  wrapIpc(aProcess) {
    const emitter = new EE();

    aProcess.on("message", message => emitter.emit(message.event, ...message.args));

    return {
      send(event, ...args) {
        if (aProcess.killed) { return; }

        return aProcess.send({
          event,
          args
        });
      },

      on: emitter.on.bind(emitter),
      removeListener: emitter.removeListener.bind(emitter)
    };
  },

  wrapChildPromise(ipc, invoke, ids, args = []) {
    return Promise.try(() => invoke(ids.eventId, args)).then(function(value) {
      //# undefined is coerced into null when sent over ipc, but we need
      //# to differentiate between them for 'task' event
      if (value === undefined) {
        value = UNDEFINED_SERIALIZED;
      }
      return ipc.send(`promise:fulfilled:${ids.invocationId}`, null, value);}).catch(err => ipc.send(`promise:fulfilled:${ids.invocationId}`, serializeError(err)));
  },

  wrapParentPromise(ipc, eventId, callback) {
    const invocationId = _.uniqueId("inv");

    return new Promise(function(resolve, reject) {
      var handler = function(err, value) {
        ipc.removeListener(`promise:fulfilled:${invocationId}`, handler);

        if (err) {
          debug("promise rejected for id %s %o", invocationId, ":", err.stack);
          reject(_.extend(new Error(err.message), err));
          return;
        }

        if (value === UNDEFINED_SERIALIZED) {
          value = undefined;
        }

        debug(`promise resolved for id '${invocationId}' with value`, value);

        return resolve(value);
      };

      ipc.on(`promise:fulfilled:${invocationId}`, handler);

      return callback(invocationId);
    });
  }
};
