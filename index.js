var WebSocketServer = require("ws").Server
var http = require("http")
var express = require("express")
var app = express()
var port = process.env.PORT || 5000
var players = {};
var colors = ['red', 'yellow', 'green', 'blue'];
var blocks = {};
var gravity = 0.51;
var xSpeed = 0.48;
var timer = 30;
var timerStarted = false;
var timerRef;
blocks[0] = {
	object: "block",
	id: 0,
	x: 0,
	y: 600,
	width: 1000,
	height: 50
};
blocks[1] = {
	object: "block",
	id: 1,
	x: 0,
	y: 0,
	width: 50,
	height: 600
}
blocks[2] = {
	object: "block",
	id: 2,
	x: 950,
	y: 0,
	width: 50,
	height: 600
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
	xVelocity: 0,
	yVelocity: 0,
	jumps: 1,
	object: "player",
	wallJumpLeft: false,
	wallJumpRight: false,
	onGround: false,
	color: colors[Math.floor(Math.random() * colors.length)]
  }
  
  if (Object.keys(players).length >= 2 && !timerStarted){
	timerStarted = true;
	timerRef = setInterval(countdown, 1000);
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
	if (leftPressed){
		players[ws.id].xVelocity -= xSpeed;
		if (players[ws.id].xVelocity < -6 && players[ws.id].onGround)
			players[ws.id].xVelocity = -6;
		var objectLeft = null;
		for (var block in blocks){
			var newObj = {
				x: players[ws.id].x + players[ws.id].xVelocity,
				y: players[ws.id].y,
				width: players[ws.id].width,
				height: players[ws.id].height
			}
			if (rectangleOverlap(blocks[block], newObj)){
				objectLeft = blocks[block];
				break;
			}
		}
		if (objectLeft == null){
			players[ws.id].x += players[ws.id].xVelocity;
			players[ws.id].wallJumpLeft = false;
		}
		else{
			if (players[ws.id].wallJumpLeft){
				players[ws.id].yVelocity = 1;
			}
			players[ws.id].x = objectLeft.x + objectLeft.width;
			players[ws.id].xVelocity = 0;
			players[ws.id].wallJumpLeft = true;
		}
	}
	if (rightPressed) {
		players[ws.id].xVelocity += xSpeed;
		if (players[ws.id].xVelocity > 6 && players[ws.id].onGround)
			players[ws.id].xVelocity = 6;
		var objectRight = null;
		for (var block in blocks){
			var newObj = {
				x: players[ws.id].x + players[ws.id].xVelocity,
				y: players[ws.id].y,
				width: players[ws.id].width,
				height: players[ws.id].height
			}
			if (rectangleOverlap(blocks[block], newObj)){
				objectRight = blocks[block];
				break;
			}
		}
		if (objectRight == null){
			players[ws.id].x += players[ws.id].xVelocity;
			players[ws.id].wallJumpRight = false;
		}
		else{
			if (players[ws.id].wallJumpRight){
				players[ws.id].yVelocity = 1;
			}
			players[ws.id].x = objectRight.x - players[ws.id].width;
			players[ws.id].xVelocity = 0;
			players[ws.id].wallJumpRight = true;
		}
	}
	if (upPressed && players[ws.id].onGround){
		players[ws.id].yVelocity = -15;
		players[ws.id].onGround = false;
	}
	if (upPressed && players[ws.id].wallJumpLeft){
		players[ws.id].yVelocity = -10;
		players[ws.id].xVelocity = 12;
		players[ws.id].onGround = false;
		players[ws.id].wallJumpLeft = false;
	}
	if (upPressed && players[ws.id].wallJumpRight){
		players[ws.id].yVelocity = -10;
		players[ws.id].xVelocity = -12;
		players[ws.id].onGround = false;
		players[ws.id].wallJumpRight = false;
	}

	if (!players[ws.id].onGround) {
		players[ws.id].yVelocity += gravity;
	}
	
	if (players[ws.id].xVelocity != 0 && (!leftPressed && !rightPressed)){
		if (players[ws.id].xVelocity > 0)
			players[ws.id].xVelocity -= xSpeed;
		if (players[ws.id].xVelocity < 0)
			players[ws.id].xVelocity += xSpeed;
		if (players[ws.id].xVelocity < 1 && players[ws.id].xVelocity > -1)
			players[ws.id].xVelocity = 0;
	}
	
	var objectBeneath = null;
	for (var block in blocks){
		var newObj = {
			x: players[ws.id].x,
			y: players[ws.id].y,
			width: players[ws.id].width,
			height: players[ws.id].height + players[ws.id].yVelocity + gravity
		}
		if (rectangleOverlap(blocks[block], newObj)){
			objectBeneath = blocks[block];
			break;
		}
	}
	if (objectBeneath == null){
		players[ws.id].onGround = false;
		players[ws.id].y += players[ws.id].yVelocity;
	}
	if (objectBeneath != null){
		players[ws.id].y = objectBeneath.y - players[ws.id].height;
		players[ws.id].yVelocity = 0;
		players[ws.id].onGround = true;
		players[ws.id].wallJumpLeft = false;
		players[ws.id].wallJumpRight = false;
	}
	

	for (var obj in players){
		var sendObject = {
		"timer": timerStarted ? timer : "",
		"players": JSON.stringify(players),
		"blocks": JSON.stringify(blocks)
		}
		ws.send(JSON.stringify(sendObject));
	}
  });

  ws.on("close", function() {
    console.log("websocket connection close")
	delete players[ws.id];
	if (Object.keys(players).length < 2 && timerStarted){
		timerStarted = false;
		timer = 30;
		clearInterval(timerRef);
	}
  });
});

function rectangleOverlap(rect1, rect2){
	return (rect1.x < rect2.x + rect2.width &&
   rect1.x + rect1.width > rect2.x &&
   rect1.y < rect2.y + rect2.height &&
   rect1.y + rect1.height > rect2.y);
}

function countdown(){
	if (timer == 0){
		timer = 30;
		timerStarted = false;
		clearInterval(timerRef);
	}
	else{
		timer--;
	}
}
