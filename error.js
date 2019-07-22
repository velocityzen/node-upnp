const parser = require('fast-xml-parser');

const code = {
  NO_SERVICE: 'NO_SERVICE',
  NO_ACTION: 'NO_ACTION',
  NO_EVENTS: 'NO_EVENTS',
  UPNP: 'UPNP',
  SUBSCRIBE: 'SUBSCRIBE',
  SUBSCRIBE_RENEW: 'SUBSCRIBE_RENEW',
  UNSUBSCRIBE: 'UNSUBSCRIBE'
}

function NoService(serviceId) {
  const err = new Error(`Service ${serviceId} not provided by device`);
  err.code = code.NO_SERVICE;
  return err;
}

function NoAction(serviceId) {
  const err = new Error(`Action ${serviceId} not implemented by service`);
  err.code = code.NO_ACTION;
  return err;
}

function UPnPError(statusCode, xmlString) {
  const envelope = parser.parse(xmlString);
  const error = envelope['s:Envelope']['s:Body']['s:Fault'].detail.UPnPError;
  const { errorCode, errorDescription } = error;
  const err = new Error(`(${errorCode}) ${errorDescription}`);
  err.code = code.UPNP;
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

function NoEvents(variable) {
  const err = new Error(`Variable ${variable} does not generate event messages`);
  err.code = code.NO_EVENTS;
  return err;
}

function Subscribe(statusCode) {
  const err = new Error('Subscription error');
  err.code = code.SUBSCRIBE;
  err.statusCode = statusCode;
  return err;
}

function SubscriptionRenewal(statusCode) {
  const err = new Error('Subscription renewal error');
  err.code = code.SUBSCRIBE_RENEW;
  err.statusCode = statusCode;
  return err;
}

function Unsubscribe(statusCode) {
  const err = new Error('Unsubscription error');
  err.code = code.UNSUBSCRIBE;
  err.statusCode = statusCode;
  return err;
}

module.exports = {
  code,
  NoService,
  NoAction,
  NoEvents,
  UPnPError,
  Subscribe,
  SubscriptionRenewal,
  Unsubscribe
}
