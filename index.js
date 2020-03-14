const http = require('http');
const os = require('os');
const { URL } = require('url');
const EventEmitter = require('events');

const got = require('got');
const concat = require('concat-stream');
const address = require('network-address');
const version = require('./package.json');

const DEFAULT_USER_AGENT = `${os.platform()}/${os.release()} UPnP/1.1 ${
  version.name
}/${version.version}`;
const SUBSCRIPTION_TIMEOUT = 300;
const SUBSCRIPTION_TIMEOUT_MIN = 30;

const {
  parseDeviceDescription,
  parseServiceDescription,
  parseSOAPResponse,
  parseEvents,
  parseTimeout
} = require('./response');
const { createSOAPAction } = require('./request');
const { resolveService } = require('./util');
const error = require('./error');

class UPnPClient {
  constructor({ url, userAgent = DEFAULT_USER_AGENT }) {
    this.url = new URL(url);
    this.deviceDescription = null;
    this.serviceDescriptions = {};
    this.eventsServer = null;
    this.subscriptions = {};

    this.eventEmitter = new EventEmitter();
    this.handleStateUpdate = this.handleStateUpdate.bind(this);

    this.client = got.extend({
      headers: {
        'user-agent': userAgent
      }
    });
  }

  async getDeviceDescription() {
    if (!this.deviceDescription) {
      const response = await this.client(this.url);
      this.deviceDescription = parseDeviceDescription(response.body, this.url);
    }

    return this.deviceDescription;
  }

  async hasService(serviceId) {
    serviceId = resolveService(serviceId);
    const description = await this.getDeviceDescription();

    return Boolean(description.services[serviceId]);
  }

  async getServiceDescription(serviceId) {
    if (!(await this.hasService(serviceId))) {
      throw error.NoService(serviceId);
    }

    const service = this.deviceDescription.services[serviceId];
    if (!this.serviceDescriptions[serviceId]) {
      const response = await this.client(service.SCPDURL);
      this.serviceDescriptions[serviceId] = parseServiceDescription(
        response.body
      );
    }

    return this.serviceDescriptions[serviceId];
  }

  async getVariableServiceId(variable, force) {
    const { services } = await this.getDeviceDescription();

    for (const serviceId of Object.keys(services)) {
      const { stateVariables } = await this.getServiceDescription(serviceId);
      if (!stateVariables) {
        continue;
      }

      for (const v in stateVariables) {
        if (
          v === variable &&
          (stateVariables[v].sendEvents || force === true)
        ) {
          return serviceId;
        }
      }
    }
  }

  async call(serviceId, actionName, data) {
    serviceId = resolveService(serviceId);
    const description = await this.getServiceDescription(serviceId);
    const action = description.actions[actionName];
    if (!action) {
      throw error.NoAction(actionName);
    }

    const service = this.deviceDescription.services[serviceId];
    const SOAPAction = createSOAPAction(service, actionName, data);

    const res = await this.client({
      throwHttpErrors: false,
      url: service.controlURL,
      method: 'POST',
      body: SOAPAction,
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'Content-Length': SOAPAction.length,
        Connection: 'close',
        SOAPACTION: `"${service.serviceType}#${actionName}"`
      }
    });

    if (res.statusCode !== 200) {
      throw error.UPnPError(res.statusCode, res.body);
    }

    const result = parseSOAPResponse(res.body, actionName, action.outputs);
    return result;
  }

  async on(variable, listener, options = {}) {
    const serviceId = await this.getVariableServiceId(variable, options.force);
    if (!serviceId) {
      throw error.NoEvents(variable);
    }

    this.eventEmitter.on(variable, listener);
    await this.subscribe(serviceId, this.handleStateUpdate);
  }

  async off(variable, listener) {
    this.eventEmitter.off(variable, listener);
    const serviceId = await this.getVariableServiceId(variable, true);
    await this.unsubscribe(serviceId, this.handleStateUpdate);
  }

  emit(...args) {
    this.eventEmitter.emit(...args);
  }

  async removeAllListeners() {
    this.eventEmitter.removeAllListeners();
    await this.clearSubscriptions();
  }

  handleStateUpdate(e) {
    this.eventEmitter.emit(e.name, e.value);
  }

  async subscribe(serviceId, listener) {
    serviceId = resolveService(serviceId);

    const subs = this.subscriptions[serviceId];
    if (subs) {
      if (!subs.listeners.includes(listener)) {
        this.subscriptions[serviceId].listeners.push(listener);
      }
      return;
    }

    if (!(await this.hasService(serviceId))) {
      throw error.NoService(serviceId);
    }

    const service = this.deviceDescription.services[serviceId];
    const server = await this.getEventsServer();
    const url = new URL(service.eventSubURL);
    const res = await this.client({
      url,
      throwHttpErrors: false,
      method: 'SUBSCRIBE',
      headers: {
        HOST: url.host,
        CALLBACK: `<http://${server.address().address}:${
          server.address().port
        }/>`,
        NT: 'upnp:event',
        TIMEOUT: `Second-${SUBSCRIPTION_TIMEOUT}`
      }
    });

    if (res.statusCode !== 200) {
      this.stopEventsServer();
      throw error.Subscribe(res.statusCode);
    }

    const { sid, timeout } = res.headers;
    const renewTimeout = Math.max(
      parseTimeout(timeout) - SUBSCRIPTION_TIMEOUT_MIN,
      SUBSCRIPTION_TIMEOUT_MIN
    );

    const timer = setTimeout(
      () =>
        this.renewSubscription({
          url,
          sid,
          serviceId
        }),
      renewTimeout * 1000
    );

    this.subscriptions[serviceId] = {
      sid,
      url,
      timer,
      listeners: [listener]
    };
  }

  async unsubscribe(serviceId, listener) {
    serviceId = resolveService(serviceId);

    const subscription = this.subscriptions[serviceId];
    if (!subscription) {
      return;
    }

    const index = subscription.listeners.indexOf(listener);
    if (index === -1) {
      return;
    }
    subscription.listeners.splice(index, 1);

    if (subscription.listeners.length !== 0) {
      return;
    }

    clearTimeout(subscription.timer);

    const res = await this.client({
      url: subscription.url,
      throwHttpErrors: false,
      method: 'UNSUBSCRIBE',
      headers: {
        HOST: subscription.url.host,
        SID: subscription.sid
      }
    });

    if (res.statusCode !== 200) {
      throw error.Unsubscribe(res.statusCode);
    }

    delete this.subscriptions[serviceId];
    this.stopEventsServer();
  }

  async renewSubscription({ url, sid, serviceId }) {
    const res = await this.client({
      url,
      throwHttpErrors: false,
      method: 'SUBSCRIBE',
      headers: {
        HOST: url.host,
        SID: sid,
        TIMEOUT: `Second-${SUBSCRIPTION_TIMEOUT}`
      }
    });

    if (res.statusCode !== 200) {
      this.stopEventsServer();
      throw error.SubscriptionRenewal(res.statusCode);
    }

    const timeout = parseTimeout(res.headers.timeout);
    const renewTimeout = Math.max(
      timeout - SUBSCRIPTION_TIMEOUT_MIN,
      SUBSCRIPTION_TIMEOUT_MIN
    ); // renew 30 seconds before expiration
    const timer = setTimeout(
      () =>
        this.renewSubscription({
          url,
          sid,
          serviceId
        }),
      renewTimeout * 1000
    );
    this.subscriptions[serviceId].timer = timer;
  }

  async getEventsServer() {
    if (!this.eventsServer) {
      this.eventsServer = await this.createEventsServer();
    }

    if (!this.eventsServer.listening) {
      await new Promise(resolve => {
        this.eventsServer.listen(0, address.ipv4(), resolve);
      });
    }

    return this.eventsServer;
  }

  createEventsServer() {
    return http.createServer(req =>
      req.pipe(concat(buf => this.eventsServerRequestHandler(req, buf)))
    );
  }

  eventsServerRequestHandler(req, buf) {
    const { sid } = req.headers;
    const events = parseEvents(buf);
    const keys = Object.keys(this.subscriptions);
    const serviceId = keys.find(key => this.subscriptions[key].sid === sid);

    if (!serviceId) {
      // silently ignore unknown SIDs
      return;
    }

    const listeners = this.subscriptions[serviceId].listeners;
    listeners.forEach(listener => events.forEach(e => listener(e)));
  }

  stopEventsServer() {
    if (this.hasSubscriptions()) {
      return;
    }

    this.eventsServer.close();
    this.eventsServer = null;
  }

  hasSubscriptions() {
    return Object.keys(this.subscriptions).length !== 0;
  }

  clearSubscriptions() {
    this.subscriptions = {};
    this.stopEventsServer();
  }
}

module.exports = UPnPClient;
