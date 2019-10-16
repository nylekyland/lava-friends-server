var WebSocketServer = require("ws").Server
var http = require("http")
var express = require("express")
var app = express()
var port = process.env.PORT || 5000
var players = {};
var colors = ['red', 'yellow', 'green', 'blue'];
var blocks = {};
var gravity = 0.045;
blocks[0] = {
	object: "block",
	id: 0,
	x: 0,
	y: 600,
	width: 1000,
	height: 50
}
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
	width: 50,
	height: 50,
	id: ws.id,
	clientId: null,
	yVelocity: 0,
	jumps: 1,
	object: "player"
  }
  
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

	players[ws.id].yVelocity += gravity;
	var objectBeneath = null;
	for (var block in blocks){
		var newObj = {
			x: players[ws.id].x,
			y: players[ws.id].y,
			width: players[ws.id].width,
			height: players[ws.id].height
		}
		if (rectangleOverlap(blocks[block], newObj)){
			objectBeneath = blocks[block];
			break;
		}
	}
	if (objectBeneath == null)
		players[ws.id].y += players[ws.id].yVelocity;
	if (objectBeneath != null){
		players[ws.id].y = objectBeneath.y - players[ws.id].height;
		players[ws.id].yVelocity = 0;
	}
	

	for (var obj in players){
		var sendObject = {
		"c2dictionary": true,
		"data": {
				"players": {
					"c2dictionary": true,
					"data": JSON.stringify(players)
				},
				"blocks": {
					"c2dictionary": true,
					"data": JSON.stringify(blocks)
				}
			}
		}
		ws.send(JSON.stringify(sendObject));
	}
  });

  ws.on("close", function() {
    console.log("websocket connection close")
	delete players[ws.id];
  });
});

function rectangleOverlap(rect1, rect2){
	return (rect1.x < rect2.x + rect2.width &&
   rect1.x + rect1.width > rect2.x &&
   rect1.y < rect2.y + rect2.height &&
   rect1.y + rect1.height > rect2.y);
}
