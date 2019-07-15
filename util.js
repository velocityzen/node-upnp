function resolveService(serviceId) {
  return serviceId.includes(':') ? serviceId :
    `urn:upnp-org:serviceId:${serviceId}`
}

module.exports = {
  resolveService
}
