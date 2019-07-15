# Modern UPnP Client Library

[![NPM Version](https://img.shields.io/npm/v/node-upnp.svg?style=flat-square)](https://www.npmjs.com/package/node-upnp)
[![NPM Downloads](https://img.shields.io/npm/dt/node-upnp.svg?style=flat-square)](https://www.npmjs.com/package/node-upnp)

Modern UPnP client with async/await support and sane extansable codebase.

## Install

`npm i node-upnp`

## Usage

```js
const UPnPClient = require('node-upnp');

const client = new UPnPClient({
  url: 'http://192.168.1.150:44042/some.xml'
});

const desc = await client.getDeviceDescription();
console.log('Device', desc);
```

## API

### async getDeviceDescription()

returns device description

### async getServiceDescription(serviceId)

returns service description

### async call(serviceId, actionName, data)

calls `actionName` for `serviceId` with `data` and return a result

### async subscribe(serviceId, listener)

subscribes for `serviceId` service updates. Keeps the subsription alive.

### async unsubscribe(serviceId, listener)

unsubscribes from `serviceId` service updates.

### hasSubscriptions()

returns `true/false` is the client has any active subscriptions

### clearSubscriptions()

clears all subscriptions

License MIT
