var WebSocketServer = require("ws").Server
var http = require("http")
var express = require("express")
var app = express()
var port = process.env.PORT || 5000
var players = {};
var colors = ['red', 'yellow', 'green', 'blue'];
var uuidv4 = require('uuid/v4');

app.use(express.static(__dirname + "/"))

var server = http.createServer(app)
server.listen(port, function(){
	console.log("http server listening on %d", port)
});

var wss = new WebSocketServer({server: server})
console.log("websocket server created")

/*
*  A new player has connected
*/
wss.on("connection", function(ws) {
  
  ws.id = uuidv4();
  
  players[ws.id] = {
	x: 300,
	y: 50,
	id: ws.id,
	clientId: null
  }
  console.log(players);
  console.log(players[ws.id]);
  console.log(players.length);
  
  ws.on('message', function incoming(json) {
	var data = JSON.parse(json);
	
	if (players[ws.id].clientId == null)
		players[ws.id].clientId = data.clientId;
	
	var leftPressed = false,
	rightPressed = false,
	upPressed = false,
	downPressed = false;
	
	//Position 1: Left is pressed
	leftPressed = !!(data.state & 1);
	//Position 2: Right is pressed
	rightPressed = !!(data.state & 2);
	//Position 3: Up is pressed
	upPressed = !!(data.state & 4);
	//Position 4: Down is pressed
	downPressed = !! (data.state & 8);
	
	//Player logic
	if (leftPressed)
		players[ws.id].x -= 2;
	if (rightPressed)
		players[ws.id].x += 2;
	if (upPressed)
		players[ws.id].y -= 2;
	if (downPressed)
		players[ws.id].y += 2;

	for (var obj in players){
		var sendObject = {
		"c2dictionary": true,
		"data": obj
		}
		console.log(sendObject);
		ws.send(JSON.stringify(sendObject));
	  }
  });

  ws.on("close", function() {
    console.log("websocket connection close")
    clearInterval(ws.id)
  });
});
