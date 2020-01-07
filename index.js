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
var timer = 15;
var timerStarted = false;
var timerRef;
var gameStarted = false;
var newBlockRef;
var cooldownStarted = false;
var cooldownRef;
var cooldownTimer = 6;
blocks[0] = {
    object: "block",
    id: 0,
    x: 0,
    y: 600,
    width: 1000,
    height: 50,
    gravity: false,
	speed: 0,
};
blocks[1] = {
    object: "block",
    id: 1,
    x: 0,
    y: -1000,
    width: 50,
    height: 1600,
    gravity: false,
	speed: 0
}
blocks[2] = {
    object: "block",
    id: 2,
    x: 950,
    y: -1000,
    width: 50,
    height: 1600,
    gravity: false,
	speed: 0
}
lava = {
    y: 1000,
    height: 500
}
aliveCount = 0;
totalCount = 0;
originalBlocks[0] = blocks[0];
originalBlocks[1] = blocks[1];
originalBlocks[2] = blocks[2];
var updateBlocksRef;
var updateLavaRef;
var updateGameRef = setInterval(updateGame, 14);
var uuidv4 = require('uuid/v4');

app.use(express.static(__dirname + "/"))

var server = http.createServer(app)
server.listen(port, function() {
    console.log("http server listening on %d", port)
});

var wss = new WebSocketServer({
    server: server
})
console.log("websocket server created")

/*
 *  A new player has connected
 */
wss.on("connection", function(ws) {

	//Generate a unique ID for the connection.
    ws.id = uuidv4();

	//Create the player.
    players[ws.id] = {
        x: 300,
        y: 50,
        width: 100,
        height: 100,
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
        dead: false,
        connected: true,
        rank: "",
        color: colors[Math.floor(Math.random() * colors.length)],
		inQueue: false,
		anim: "idleRight",
		lastLeftRight: "right"
    }

	//Now that someone has connected, check how many people there are total.
	//If there's more than 2 players and the countdown hasn't already started yet,
	//start the timer.
    if (Object.keys(players).length >= 2 && !timerStarted && !gameStarted && !cooldownStarted) {
        timerStarted = true;
        timerRef = setInterval(countdown, 1000)
		addPlayersFromQueue();
    }
	//If the timer is ticking down before play, the newly connected player will join
	//the next game. Else, they will have to wait in the queue.
	if (timerStarted || Object.keys(players).length <= 1){
		players[ws.id].inQueue = false;
	}
	else{
		players[ws.id].inQueue = true;
	}

    updateRef = setInterval(function() {
        updatePositions(players[ws.id]);
		updateAnimations(players[ws.id]);
    }, 14);
    updateRefs.push(updateRef);
    players[ws.id].updateRef = updateRef;
	
	var sendMessageRef = setInterval(function(){
		var condensedPlayers = [];

        for (var obj in players) {
            var playerObj = {
                x: players[obj].x,
                y: players[obj].y,
                clientId: players[obj].clientId,
                color: getColorNumber(players[obj].color),
                rank: players[obj].rank ? players[obj].rank + '/' + rankTotal : "",
				dead: players[obj].dead ? 1 : 0,
				inQueue: players[obj].inQueue ? 1 : 0,
				anim: getAnimNumber(players[obj].anim)
            }
            condensedPlayers.push(playerObj);
        }
        var sendObject = {
            "timer": timerStarted ? timer : "",
            "players": JSON.stringify(condensedPlayers),
            "blocks": JSON.stringify(blocks),
            "lavaY": lava.y,
            "lavaH": lava.height
        }
        ws.send(Buffer.from(JSON.stringify(sendObject)).toString('base64'));
	}, 14);

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
        players[ws.id].downPressed = !!(data.state & 8);
    });

    ws.on("close", function() {
        console.log("websocket connection close")
		clearInterval(sendMessageRef);
        clearInterval(updateRefs[players[ws.id].updateRef]);
        players[ws.id].connected = false;
        players[ws.id].dead = true;
        players[ws.id].rank = aliveCount;
		if (!players[ws.id].inQueue)
        	aliveCount--;
        if (!gameStarted)
            delete players[ws.id];
        if (Object.keys(players).length < 2 && (timerStarted || gameStarted)) {
            gameStarted = false;
            timerStarted = false;
            timer = 15;
            for (var i = Object.keys(blocks).length; i > 2; i--) {
                delete blocks[i];
            }
            for (var obj in players) {
                players[obj].dead = false;
            }
            clearInterval(timerRef);
            clearInterval(newBlockRef);
            lava.y = 1000;
            lava.height = 500;
        }
    });
});

function rectangleOverlap(rect1, rect2) {
    return (rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y);
}

function createNewBlock() {
    var size = 150 + Math.floor(Math.random() * 50);
    var newBlock = {
        object: "block",
        id: Object.keys(blocks).length + 1,
        x: 50 + Math.floor(Math.random() * (900 - size)),
        y: getHighestBlockY(),
        width: size,
        height: size,
        speed: 2 + Math.floor(Math.random() * 4),
        gravity: true
    };
    blocks[Object.keys(blocks).length + 1] = newBlock;
}

function getHighestBlockY() {
    var highest = 600;
    for (var block in blocks) {
        if (blocks[block].gravity) {
            if (blocks[block].y <= highest)
                highest = blocks[block].y
        }
    }
    return highest > -1600 ? -1600 : highest;
}

function countdown() {
    if (timer == 0) {
        timer = 15;
        timerStarted = false;
        clearInterval(timerRef);
        gameStarted = true;
        newBlockRef = setInterval(createNewBlock, 1800);
        aliveCount = Object.keys(players).length;
        rankTotal = Object.keys(players).length;
        for (var obj in players) {
            players[obj].rank = "";
			players[obj].resetPosition = true;
        }
        updateBlocksRef = setInterval(updateBlocks, 14);
        updateLavaRef = setInterval(updateLava, 14);
    } else {
        timer--;
    }
}

function updatePositions(player) {
    //Player logic
    if (player) {
        var upPressed = player.upPressed;
        var downPressed = player.downPressed;
        var leftPressed = player.leftPressed;
        var rightPressed = player.rightPressed;
        if (!player.dead && !player.inQueue) {
			if (player.resetPosition){
				player.resetPosition = false;
				resetPlayerPosition(player);
			}
			else{
				//The player pressed up and is on the ground
				if (upPressed && !player.lastUp && player.onGround) {
					player.yVelocity = -15;
					player.onGround = false;
				}
				//The player pressed up and is already on the left wall -> wall jump to the right
				if (upPressed && !player.lastUp && player.wallJumpLeft) {
					player.yVelocity = -14;
					player.xVelocity = 12;
					player.onGround = false;
					player.wallJumpLeft = false;
				}
				//The player pressed up and is already on the right wall -> wall jump to the left
				if (upPressed && !player.lastUp && player.wallJumpRight) {
					player.yVelocity = -14;
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
				if (player.xVelocity != 0 && (!leftPressed && !rightPressed)) {
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
				for (var block in blocks) {
					var newObj = {
						x: player.x,
						y: player.y + player.yVelocity,
						width: player.width,
						height: player.height
					}
					if (rectangleOverlap(blocks[block], newObj)) {
						if (blocks[block].y > player.y)
							objectBeneath = blocks[block];
						else if (blocks[block].y < player.y)
							objectAbove = blocks[block];
					}
				}

				//There's an object directly above and directly below the player
				//The player is squished.
				if (objectAbove != null && objectBeneath != null) {
					player.rank = aliveCount;
					aliveCount--;
					player.dead = true;
				}

				//Nothing is underneath the player, so keep falling
				if (objectBeneath == null && !player.dead) {
					player.onGround = false;
					player.y += player.yVelocity;
				}
				//The next y coordinate overlaps a block that's underneath the player.
				//They are now on the ground and stop falling.
				if (objectBeneath != null && !player.dead) {
					player.y = objectBeneath.y - player.height;
					player.yVelocity = objectBeneath.speed;
					player.onGround = true;
					player.wallJumpLeft = false;
					player.wallJumpRight = false;
				}
				//There's a block above the player.
				//The object blocks their path. Stop their yVelocity and they start falling.
				if (objectAbove != null && !player.dead) {
					player.y = objectAbove.y + objectAbove.height;
					player.yVelocity = objectAbove.speed;
				}

				//Check if player has entered the lava
				if (player.y + (player.height / 2) >= lava.y) {
					if (gameStarted || cooldownStarted) {
						if (!cooldownStarted) {
							player.rank = aliveCount;
							aliveCount--;
						}
						player.dead = true;
					} else {
						player.resetPosition = true;
					}
				}

				//X VELOCITY
				//The player is pressing left so we need to move them with their xVelocity
				if (leftPressed) {
					player.lastLeftRight = "left";
					player.xVelocity -= xSpeed;
					if (player.xVelocity < -6)
						player.xVelocity = -6;
				}
				if (rightPressed) {
					player.lastLeftRight = "right";
					player.xVelocity += xSpeed;
					if (player.xVelocity > 6)
						player.xVelocity = 6;
				}
				//Check if there are any blocks in the way
				for (var block in blocks) {
					var newObj = {
						x: player.x + player.xVelocity,
						y: player.y,
						width: player.width,
						height: player.height
					}
					if (rectangleOverlap(blocks[block], newObj)) {
						if (blocks[block].x > player.x)
							objectRight = blocks[block];
						else if (blocks[block].x < player.x)
							objectLeft = blocks[block];
						break;
					}
				}
				//Nothing is stopping the player from moving left so, move at xVelocity
				if (objectLeft == null && objectRight == null && !player.dead) {
					player.x += player.xVelocity;
					player.wallJumpLeft = false;
					player.wallJumpRight = false;
				}
				//There's a block to the left of the player. Stop the xVelocity and set
				//the position to be to the right of the object.
				if (objectLeft != null && !player.dead) {
					if (player.wallJumpLeft && player.yVelocity > 0) {
						player.yVelocity = 1;
					}
					player.xVelocity = 0;
					player.x = objectLeft.x + objectLeft.width;
					if (!player.onGround)
						player.wallJumpLeft = true;

				}
				//There's a block to the right of the player. Stop the xVelocity and set
				//the position to the left of the object.
				if (objectRight != null && !player.dead) {
					if (player.wallJumpRight && player.yVelocity > 0) {
						player.yVelocity = 1;
					}
					player.xVelocity = 0;
					player.x = objectRight.x - player.width;
					if (!player.onGround)
						player.wallJumpRight = true;
				}
			}
        }
    }
}

function updateAnimations(player){
	if (player){
		if (player.dead){
			player.anim = "dead";
		}
		else{
			//Check if player is in the air
			if (!player.onGround){
				//Check if player is rising or falling
				if (player.yVelocity > 0){
					//Check player's last l/r direction
					if (player.lastLeftRight == "left"){
						player.anim = "fallLeft";
						return;
					}
					else{
						player.anim = "fallRight";
						return;
					}
				}
				else{
					if (player.lastLeftRight == "left"){
						player.anim = "jumpLeft";
						return;
					}
					else{
						player.anim = "jumpRight";
						return;
					}
				}
			}
			else{
				if (player.xVelocity == 0){
					if (player.lastLeftRight == "left"){
						player.anim = "idleLeft";
						return;
					}
					else{
						player.anim = "idleRight";
						return;
					}
				}
				else{
					if (player.lastLeftRight == "left"){
						player.anim = "walkLeft";
						return;
					}
					else{
						player.anim = "walkRight";
						return;
					}
				}
			}
		}	
	}
}

function updateBlocks() {
    /*
    	Update block positions
    */
    for (var block in blocks) {
        var blockUnderneath = null;
        if (blocks[block].gravity) {
            var newObj = {
                x: blocks[block].x,
                y: blocks[block].y + blocks[block].speed,
                width: blocks[block].width,
                height: blocks[block].height
            }
            for (var block2 in blocks) {
                if (block2 != block && rectangleOverlap(newObj, blocks[block2])) {
                    blockUnderneath = blocks[block2];
                    break;
                }
            }
            if (blockUnderneath == null)
                blocks[block].y += blocks[block].speed;
            else
                blocks[block].y = blockUnderneath.y - blocks[block].height;
        }
    }
}

function updateLava() {
    if (gameStarted) {
        lava.y -= 0.4;
        lava.height += 0.4;
    }
}

function updateGame() {
    if (gameStarted && aliveCount <= 1) {
        gameStarted = false;
        timerStarted = false;
        timer = 15;
        cooldownStarted = true;
        cooldownTimer = 6;
        for (var obj in players) {
            if (!players[obj].dead)
                players[obj].rank = 1;
        }
        clearInterval(updateBlocksRef);
        clearInterval(updateLavaRef);
        clearInterval(timerRef);
        clearInterval(newBlockRef);
        cooldownRef = setInterval(cooldown, 1000);
    }
}

function resetPlayerPosition(player) {
    if (player.x <= 50)
        player.x = 55;
    if (player.x + player.width >= 950)
        player.x = 945 - player.width;
    player.y = 200;
    player.yVelocity = 0;
    player.xVelocity = 0;
	player.onGround = false;
	player.wallJumpLeft = false;
    player.wallJumpRight = false;
	player.leftPressed = false;
	player.rightPressed = false;
	player.upPressed = false;
	player.downPressed = false;
}

function cooldown() {
    if (cooldownTimer == 0) {
        cooldownStarted = false;
        cooldownTimer = 6;
        for (var i = Object.keys(blocks).length; i > 2; i--) {
            delete blocks[i];
        }
        for (var obj in players) {
            players[obj].dead = false;
			players[obj].resetPosition = true;
            if (!players[obj].connected)
                delete players[obj];
        }
        lava.y = 1000;
        lava.height = 500;
        clearInterval(cooldownRef);
        if (Object.keys(players).length >= 2 && !timerStarted) {
            timerStarted = true;
            timerRef = setInterval(countdown, 1000);
			addPlayersFromQueue();
        }
    } else {
        cooldownTimer--;
    }
}

function addPlayersFromQueue(){
	var count = 0;
	for (var obj in players){
		if (!players[obj].inQueue){
			count++;
		}
		else{
			if (count < 99){
				players[obj].inQueue = false;
				count++;
			}
		}
	}
}

function getAnimNumber(anim){
	switch (anim){
		case "idleLeft": return 0;
		case "idleRight": return 1;
		case "walkLeft": return 2;
		case "walkRight": return 3;
		case "fallLeft": return 4;
		case "fallRight": return 5;
		case "jumpLeft": return 6;
		case "jumpRight": return 7;
		case "win": return 8;
		case "dead": return 9;
		default: return 0; break;
	}
}

function getColorNumber(color){
	switch(color){
		case "red": return 0;
		case "yellow": return 1;
		case "green": return 2;
		case "blue": return 3;
		default: return 0;
	}
}