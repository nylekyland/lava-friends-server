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
  ws.send(ws.id);
  
  players[ws.id] = {
	x: 300,
	y: 50,
	id: ws.id
  }
  ws.send(JSON.stringify(players[ws.id]))
  
  var id = setInterval(function() {
    ws.send(JSON.stringify(new Date()), function() {  })
  }, 1000)
  
  ws.on('message', function incoming(data) {
	handlePlayerMovement(data);
  });

  ws.on("close", function() {
    console.log("websocket connection close")
    clearInterval(id)
  })
});

var handlePlayerMovement = function(data){
	var leftPressed = false,
	rightPressed = false;
	//Position 1: Left is pressed
	leftPressed = !!(data & 1);
	//Position 2: Right is pressed
	rightPressed = !!(data & 2);
	
	//Player logic
	if (leftPressed)
		players[ws.id] -= 0.5;
	if (rightPressed)
		players[ws.id] += 0.5;
	
	//Send the updated data back to the client
	ws.send(JSON.stringify(player[ws.id]));
}
