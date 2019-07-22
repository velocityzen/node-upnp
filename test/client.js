const test = require('ava');
const UPnPClient = require('../index');

const DEVICE_URL = process.env.UPNP_DEVICE_URL;
if (!DEVICE_URL) {
  throw Error('Please, use UPNP_DEVICE_URL env variabale to define test device url.');
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    //eslint-disable-next-line no-await-in-loop
    await callback(array[index], index, array);
  }
}

const client = new UPnPClient({
  url: DEVICE_URL
});

test.serial('get device description', async t => {
  const desc = await client.getDeviceDescription();
  t.truthy(desc.deviceType);
  t.truthy(desc.manufacturer);
  t.truthy(desc.modelName);
  t.truthy(desc.services);
});

test.serial('get all services descriptions', async t => {
  const desc = await client.getDeviceDescription();
  const servicesIds = Object.keys(desc.services);
  t.plan(servicesIds.length * 2);

  await asyncForEach(Object.keys(desc.services), async serviceId => {
    const serviceDesc = await client.getServiceDescription(serviceId);
    t.truthy(serviceDesc.actions);
    t.truthy(serviceDesc.stateVariables);
  });
});

test.serial('test call action. get/set volume', async t => {
  const desc = await client.getDeviceDescription();

  if (desc.services['urn:upnp-org:serviceId:RenderingControl']) {
    return t.pass();
  }

  const volume = await client.call('RenderingControl', 'GetVolume', {
    InstanceID: 0,
    Channel: 'Master'
  });

  t.is(typeof volume.CurrentVolume, 'number');

  await client.call('RenderingControl', 'SetVolume', {
    InstanceID: 0,
    Channel: 'Master',
    DesiredVolume: volume.CurrentVolume - 1
  });

  const newVolume = await client.call('RenderingControl', 'GetVolume', {
    InstanceID: 0,
    Channel: 'Master'
  });

  t.is(newVolume.CurrentVolume, volume.CurrentVolume - 1);
});

test.serial('test subscribtion. volume', async t => {
  const desc = await client.getDeviceDescription();

  if (!desc.services['urn:upnp-org:serviceId:RenderingControl']) {
    return t.pass();
  }

  t.plan(2);
  function handler(e) {
    if (e.name === 'Volume') {
      t.pass();
    }
  }

  await client.subscribe('RenderingControl', handler);
  const volume = await client.call('RenderingControl', 'GetVolume', {
    InstanceID: 0,
    Channel: 'Master'
  });

  await client.call('RenderingControl', 'SetVolume', {
    InstanceID: 0,
    Channel: 'Master',
    DesiredVolume: volume.CurrentVolume - 1
  });

  await client.unsubscribe('RenderingControl', handler);
  t.is(client.hasSubscriptions(), false);
});

test.serial('get the serviceId by state variable', async t => {
  const serviceId1 = await client.getVariableServiceId('NOT_EXIST');
  t.is(serviceId1, undefined);

  const serviceId2 = await client.getVariableServiceId('SourceProtocolInfo');
  t.is(serviceId2, 'urn:upnp-org:serviceId:ConnectionManager');

  const serviceId3 = await client.getVariableServiceId('Volume');
  t.is(serviceId3, undefined);

  const serviceId4 = await client.getVariableServiceId('Volume', true);
  t.is(serviceId4, 'urn:upnp-org:serviceId:RenderingControl');
});

test.serial('test on/off methods', async t => {
  function handler(volume) {
    t.is(typeof volume, 'number');
  }

  await client.on('Volume', handler, { force: true });
  const result = await client.call('RenderingControl', 'GetVolume', {
    InstanceID: 0,
    Channel: 'Master'
  });
  const volume = result.CurrentVolume;
  await client.call('RenderingControl', 'SetVolume', {
    InstanceID: 0,
    Channel: 'Master',
    DesiredVolume: volume + 1
  });

  await client.off('Volume', handler);

  t.is(client.hasSubscriptions(), false);
});
