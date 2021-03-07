window.addEventListener("message", function(request) {
  const action = request.data.crosswatch_action;
  if (action === "play") {
    document.getElementById("brightcove-player").player.play();
  }
  else if (request.data.crosswatch_action === "pause") {
    const player = document.getElementById("brightcove-player").player;
    player.pause();
    player.currentTime(request.data.currentTime);
  }
  else if (request.data.crosswatch_action === "timeupdate") {
    document.getElementById("brightcove-player").player.currentTime(request.data.currentTime);
  }
});
