var WebSocketServer = require("ws").Server
var http = require("http")
var express = require("express")
var app = express()
var port = process.env.PORT || 5000
var players = {};
var updateRefs = [];
var colors = ['red', 'yellow', 'green', 'blue'];
var blocks = {};
var originalBlocks = {};
var gravity = 0.51;
var xSpeed = 0.48;
var timer = 30;
var timerStarted = false;
var timerRef;
var gameStarted = false;
var newBlockRef;
blocks[0] = {
	object: "block",
	id: 0,
	x: 0,
	y: 600,
	width: 1000,
	height: 50,
	gravity: false
};
blocks[1] = {
	object: "block",
	id: 1,
	x: 0,
	y: 0,
	width: 50,
	height: 600,
	gravity: false
}
blocks[2] = {
	object: "block",
	id: 2,
	x: 950,
	y: 0,
	width: 50,
	height: 600,
	gravity: false
}
originalBlocks.push(blocks[0]);
originalBlocks.push(blocks[1]);
originalBlocks.push(blocks[2]);
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
	width: 75,
	height: 75,
	id: ws.id,
	clientId: null,
	xVelocity: 0,
	yVelocity: 0,
	jumps: 1,
	object: "player",
	leftPressed: false,
	rightPressed: false,
	upPressed: false,
	downPressed: false,
	wallJumpLeft: false,
	wallJumpRight: false,
	onGround: false,
	lastUp: false,
	updateRef: 0,
	color: colors[Math.floor(Math.random() * colors.length)]
  }
  
  if (Object.keys(players).length >= 2 && !timerStarted){
	timerStarted = true;
	timerRef = setInterval(countdown, 1000);
  }
  
  updateRef = setInterval(function(){updatePositions(players[ws.id])}, 14);
  updateRefs.push(updateRef);
  players[ws.id].updateRef = updateRef;
  
  ws.on('message', function incoming(json) {
	var data = JSON.parse(json);
	
	if (players[ws.id].clientId == null)
		players[ws.id].clientId = data.clientId;
	
	//Position 1: Left is pressed
	players[ws.id].leftPressed = !!(data.state & 1);
	//Position 2: Right is pressed
	players[ws.id].rightPressed = !!(data.state & 2);
	//Position 3: Up is pressed
	players[ws.id].upPressed = !!(data.state & 4);
	//Position 4: Down is pressed
	players[ws.id].downPressed = !! (data.state & 8);
	
	var condensedPlayers = [];
	
	for (var obj in players){
		var playerObj = {
			x: players[obj].x,
			y: players[obj].y,
			width: players[obj].width,
			height: players[obj].height,
			clientId: players[obj].clientId,
			color: players[obj].color
		}
		condensedPlayers.push(playerObj);
	}
	var sendObject = {
		"timer": timerStarted ? timer : "",
		"players": JSON.stringify(condensedPlayers),
		"blocks": JSON.stringify(blocks)
		}
	ws.send(JSON.stringify(sendObject));
  });

  ws.on("close", function() {
    console.log("websocket connection close")
	clearInterval(updateRefs[players[ws.id].updateRef]);
	delete players[ws.id];
	if (Object.keys(players).length < 2 && (timerStarted || gameStarted)){
		gameStarted = false;
		timerStarted = false;
		timer = 30;
		blocks = originalBlocks;
		clearInterval(timerRef);
		clearInterval(newBlockRef);
	}
  });
});

function rectangleOverlap(rect1, rect2){
	return (rect1.x < rect2.x + rect2.width &&
   rect1.x + rect1.width > rect2.x &&
   rect1.y < rect2.y + rect2.height &&
   rect1.y + rect1.height > rect2.y);
}

function createNewBlock(){
	var newBlock = {
		object: "block",
		id: Object.keys(blocks).length + 1,
		x: Math.floor(Math.random() * 900),
		y: 0,
		width: 100,
		height: 100,
		gravity: true
	};
	blocks.push(newBlock);
}

function countdown(){
	if (timer == 0){
		timer = 30;
		timerStarted = false;
		clearInterval(timerRef);
		gameStarted = true;
		newBlockRef = setInterval(createNewBlock(), 2000);
	}
	else{
		timer--;
	}
}

function updatePositions(player){
	//Player logic
	if (player){
		var upPressed = player.upPressed;
		var downPressed = player.downPressed;
		var leftPressed = player.leftPressed;
		var rightPressed = player.rightPressed;
		//The player pressed up and is on the ground
		if (upPressed && !player.lastUp && player.onGround){
			player.yVelocity = -15;
			player.onGround = false;
		}
		//The player pressed up and is already on the left wall -> wall jump to the right
		if (upPressed && !player.lastUp && player.wallJumpLeft){
			player.yVelocity = -12;
			player.xVelocity = 12;
			player.onGround = false;
			player.wallJumpLeft = false;
		}
		//The player pressed up and is already on the right wall -> wall jump to the left
		if (upPressed && !player.lastUp && player.wallJumpRight){
			player.yVelocity = -12;
			player.xVelocity = -12;
			player.onGround = false;
			player.wallJumpRight = false;
		}
		//For the next call, determine if up button is down.
		if (upPressed)
			player.lastUp = true;
		else
			player.lastUp = false;
		
		//If the player is not on the ground, affect their yVelocity by adding gravity
		player.yVelocity += gravity;
		
		//If player is idle, slow down their xVelocity to 0.
		if (player.xVelocity != 0 && (!leftPressed && !rightPressed)){
			if (player.xVelocity > 0)
				player.xVelocity -= xSpeed;
			if (player.xVelocity < 0)
				player.xVelocity += xSpeed;
			if (player.xVelocity < 1 && player.xVelocity > -1)
				player.xVelocity = 0;
		}
		
		var objectBeneath = null;
		var objectAbove = null;
		var objectLeft = null;
		var objectRight = null;
		
		//Y VELOCITY
		//Check their next y coordinate to see if it overlaps any blocks
		for (var block in blocks){
			var newObj = {
				x: player.x,
				y: player.y + player.yVelocity,
				width: player.width,
				height: player.height
			}
			if (rectangleOverlap(blocks[block], newObj)){
				if (blocks[block].y > player.y)
					objectBeneath = blocks[block];
				else if (blocks[block].y < player.y)
					objectAbove = blocks[block];
				break;
			}
		}
		//Nothing is underneath the player, so keep falling
		if (objectBeneath == null){
			player.onGround = false;
			player.y += player.yVelocity;
		}
		//The next y coordinate overlaps a block that's underneath the player.
		//They are now on the ground and stop falling.
		if (objectBeneath != null){
			player.y = objectBeneath.y - player.height;
			player.yVelocity = 0;
			player.onGround = true;
			player.wallJumpLeft = false;
			player.wallJumpRight = false;
		}
		//There's a block above the player.
		//The object blocks their path. Stop their yVelocity and they start falling.
		if (objectAbove != null){
			player.y = objectAbove.y + objectAbove.height;
			player.yVelocity = 0;
		}
		
		//X VELOCITY
		//The player is pressing left so we need to move them with their xVelocity
		if (leftPressed){
			player.xVelocity -= xSpeed;
			if (player.xVelocity < -6)
				player.xVelocity = -6;
		}
		if (rightPressed) {
			player.xVelocity += xSpeed;
			if (player.xVelocity > 6)
				player.xVelocity = 6;
		}
		//Check if there are any blocks in the way
		for (var block in blocks){
				var newObj = {
					x: player.x + player.xVelocity,
					y: player.y,
					width: player.width,
					height: player.height
				}
				if (rectangleOverlap(blocks[block], newObj)){
					if (blocks[block].x > player.x)
						objectRight = blocks[block];
					else if (blocks[block].x < player.x)
						objectLeft = blocks[block];
					break;
				}
			}
		//Nothing is stopping the player from moving left so, move at xVelocity
		if (objectLeft == null && objectRight == null){
			player.x += player.xVelocity;
			player.wallJumpLeft = false;
			player.wallJumpRight = false;
		}
		//There's a block to the left of the player. Stop the xVelocity and set
		//the position to be to the right of the object.
		if (objectLeft != null){
			if (player.wallJumpLeft){
				player.yVelocity = 1;
			}
			player.xVelocity = 0;
			player.wallJumpLeft = true;	
			player.x = objectLeft.x + objectLeft.width;

		}
		//There's a block to the right of the player. Stop the xVelocity and set
		//the position to the left of the object.
		if (objectRight != null){
			if (player.wallJumpRight){
				player.yVelocity = 1;
			}
			player.xVelocity = 0;
			player.wallJumpRight = true;
			player.x = objectRight.x - player.width;
		}

			
		/*
			Update block positions
		*/
		for (var block in blocks){
			var blockUnderneath = null;
			if (blocks[block].gravity){
				var newObj = {
					x: blocks[block].x,
					y: blocks[block].y + 1,
					width: blocks[block].width,
					height: blocks[block].height
				}
				for (var block2 in blocks){
					if (block2 != block && rectangleOverlap(newObj, blocks[block2])){
						blockUnderneath = blocks[block2];
						break;
					}
				}
				if (blockUnderneath == null)
					blocks[block].y += 1;
				else
					blocks[block].y = blockUnderneath.y - blocks[block].height;
			}
		}
	}
}
