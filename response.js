const { URL } = require('url');
const parser = require('fast-xml-parser');
const he = require('he');

const eventsValues = require('./events');

function absoluteUrl(baseUrl, url) {
  return new URL(url, baseUrl).toString();
}

function getIcons(iconList, url) {
  if (!iconList) {
    return [];
  }

  return Array.from(iconList.icon).map(icon => ({
    ...icon,
    url: absoluteUrl(url, icon.url)
  }))
}

function getServices(serviceList, url) {
  if (!serviceList) {
    return {};
  }

  return Array.from(serviceList.service).reduce((a, { serviceType, serviceId, SCPDURL, controlURL, eventSubURL }) => {
    a[serviceId] = {
      serviceType,
      SCPDURL: absoluteUrl(url, SCPDURL),
      controlURL: absoluteUrl(url, controlURL),
      eventSubURL: absoluteUrl(url, eventSubURL)
    }
    return a;
  }, {});
}

function parseDeviceDescription(xmlString, url) {
  url = new URL(url);

  const obj = parser.parse(xmlString, { parseTrueNumberOnly: true });
  const {
    deviceType,
    friendlyName,
    manufacturer,
    manufacturerURL,
    modelName,
    modelNumber,
    modelDescription,
    UDN,
    iconList,
    serviceList
  } = obj.root.device;

  return {
    deviceType,
    friendlyName,
    manufacturer,
    manufacturerURL,
    modelName,
    modelNumber,
    modelDescription,
    UDN,
    icons: getIcons(iconList, url),
    services: getServices(serviceList, url)
  }
}

function getActionArguments(argumentList) {
  if (!argumentList) {
    return {
      inputs: [],
      outputs: []
    }
  }

  return Array.from(argumentList.argument).reduce((a, { direction, name, relatedStateVariable }) => {
    if (direction === 'in') {
      a.inputs.push({
        name,
        relatedStateVariable
      });
    } else {
      a.outputs.push({
        name,
        relatedStateVariable
      });
    }
    return a;
  }, {
    inputs: [],
    outputs: []
  });
}

function getActions(actionList) {
  if (!actionList) {
    return {};
  }

  return Array.from(actionList.action).reduce((a, { name, argumentList }) => {
    a[name] = getActionArguments(argumentList);
    return a;
  }, {});
}

function getAllowedValues(allowedValueList) {
  if (!allowedValueList) {
    return [];
  }

  if (Array.isArray(allowedValueList.allowedValue)) {
    return allowedValueList.allowedValue;
  }

  return [ allowedValueList.allowedValue ];
}

function getStateVariables(serviceStateTable) {
  if (!serviceStateTable) {
    return {};
  }

  return Array.from(serviceStateTable.stateVariable).reduce((a, { name, __sendEvents, allowedValueList, ...fields }) => {
    a[name] = {
      ...fields,
      sendEvents: __sendEvents !== 'no',
      allowedValues: getAllowedValues(allowedValueList)
    }
    return a;
  }, {});
}

function parseServiceDescription(xmlString) {
  const obj = parser.parse(xmlString, {
    attributeNamePrefix: '__',
    ignoreAttributes: false
  });

  const {
    actionList,
    serviceStateTable
  } = obj.scpd;

  return {
    actions: getActions(actionList),
    stateVariables: getStateVariables(serviceStateTable)
  }
}

function parseSOAPResponse(xmlString, actionName, outputs) {
  const envelope = parser.parse(xmlString);
  const res = envelope['s:Envelope']['s:Body'][`u:${actionName}Response`];
  return outputs.reduce((a, { name }) => {
    a[name] = res[name];
    return a;
  }, {});
}

function parseEventInstance({ __val, ...events }) {
  return Object.entries(events).map(([ name, data ]) => ({
    instanceId: __val,
    name,
    value: eventsValues[name] ? eventsValues[name](data.__val) : data.__val
  }));
}

function parseEventsProperties(prop) {
  const entry = Object.entries(prop);
  return {
    name: entry[0],
    value: entry[1]
  }
}

function parseEvents(buf) {
  const body = parser.parse(buf.toString());
  const props = body['e:propertyset']['e:property'];

  if (props.LastChange) {
    const events = parser.parse(he.decode(props.LastChange), {
      attributeNamePrefix: '__',
      ignoreAttributes: false,
      parseAttributeValue: true
    });

    const InstanceID = events.Event.InstanceID;
    const instances = Array.isArray(InstanceID) ? InstanceID : [ InstanceID ];
    return instances.map(parseEventInstance).flat();
  }

  return props.map(parseEventsProperties)
}

function parseTimeout(header) {
  return Number(header.split('-')[1]);
}


module.exports = {
  parseDeviceDescription,
  parseServiceDescription,
  parseSOAPResponse,
  parseTimeout,
  parseEvents
}
