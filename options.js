const backendInput = document.getElementById("backendUrl");
const updateButton = document.getElementById("updateButton");
const defaultRoomInput = document.getElementById("defaultRoomInput");
const defaultNickInput = document.getElementById("defaultNickInput");
const updateRoomButton = document.getElementById("updateRoomButton");
const confirmationMessage = document.getElementById("confirmationMessage");
const maxMenuSize = 10;
let extensionColor = null;

getBackendUrl().then(url => backendInput.value = url);
getDefaultRoomId().then(roomId => defaultRoomInput.value = roomId);
getDefaultNick().then(nick => defaultNickInput.value = nick);

backendInput.oninput = function () {
  setBackendUrl(backendInput.value);
}

defaultRoomInput.oninput = function () {
  setDefaultRoomId(defaultRoomInput.value);
}

defaultNickInput.oninput = function () {
  setDefaultNick(defaultNickInput.value);
}

function setBackendUrl(url) {
  chrome.storage.sync.set({ backendUrl: url }, function () {
    log("Backend url updated");
  });
}

function setDefaultRoomId(roomId) {
  chrome.storage.sync.set({ defaultRoomId: roomId }, function () {
    log("Default Room ID updated");
  });
}

function setDefaultNick(nick) {
  chrome.storage.sync.set({ defaultNick: nick }, function () {
    log("Default Nick updated");
  });
}
