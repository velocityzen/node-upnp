const { parseTime } = require('./time');

const toArray = value => value.split(',');

module.exports = {
  CurrentMediaDuration: parseTime,
  CurrentTrackDuration: parseTime,
  CurrentTransportActions: toArray,
  PossiblePlaybackStorageMedia: toArray
}
