// Constants and functions used by both background.js and content_script.js

const DEBUG = true;
const DISPLAY_DEBUG_TIME = false;

const LIMIT_DELTA_TIME = 3; // In Seconds
const googleGreen = "#009688";
const googleAquaBlue = "#00BBD3";
const crunchyrollOrange = "#F78C25";
const wRed = "#F72445";
const chineseSilver = "#CCC";
const defaultcolorOptions = [googleGreen, googleAquaBlue, crunchyrollOrange, wRed];
const testOffset = 7;

const Actions = {
  PLAY: 'play',
  PAUSE: 'pause',
  READY: 'ready',
  ENDED: 'ended',
  TIMEUPDATE: 'timeupdate',
}

const States = {
  PLAYING: 'playing',
  PAUSED: 'paused',
}

const Site = {
  FUNIMATION: 'funimation',
  CRUNCHYROLL: 'crunchyroll',
  WAKANIM: 'wakanim',
}

// For messages generated by background.js capturing actions from the server.
const BackgroundMessageTypes = {
  REMOTE_UPDATE: 'remote_update',
  ROOM_CONNECTION: 'room_connection'
}

// For messages generated by content_script.js capturing actions on the webpage.
const WebpageMessageTypes = {
  LOCAL_UPDATE: 'local_update',
  ROOM_CONNECTION: 'room_connection',
  CONNECTION: 'connection',
}

function log() {
  const args = DISPLAY_DEBUG_TIME ? [(new Date()).toJSON()] : [];
  args.push(...arguments);
  return DEBUG && console.log(...args);
}

function getBackendUrl() {
  return new Promise(callback => {
    chrome.storage.sync.get({ backendUrl: "" }, function (data) {
      callback(data.backendUrl);
    });
  });
}

function getDefaultRoomId() {
  return new Promise(callback => {
    chrome.storage.sync.get({ defaultRoomId: "" }, function (data) {
      callback(data.defaultRoomId);
    });
  });
}

function getExtensionColor() {
  return new Promise(callback => {
    chrome.storage.sync.get({ extensionColor: wRed }, function (data) {
      callback(data.extensionColor);
    });
  });
}

function getColorMenu() {
  return new Promise(callback => {
    chrome.storage.sync.get({ colorOptions: defaultcolorOptions }, function (data) {
      callback(data.colorOptions);
    });
  });
}
