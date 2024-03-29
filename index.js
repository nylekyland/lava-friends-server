//Websocket stuff
var WebSocketServer = require("ws").Server;
var http = require("http");
var express = require("express");
var app = express();
var port = process.env.PORT || 5000;

//Global constants across all games
var players = {};
var updateRefs = [];
var sendMessageRefs = [];

//Speed constants;
var gravity = 0.51;
var xSpeed = 0.48;

//This array handles all of the current games going on.
var games = [];
var gamePlayerLimit = 8;

var uuidv4 = require('uuid/v4');

app.use(express.static(__dirname + "/"));

var server = http.createServer(app);
server.listen(port, function() {
    console.log("http server listening on %d", port);
});

var wss = new WebSocketServer({
    server: server
});
console.log("websocket server created");

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
		gameId: null,
        clientId: null,
        xVelocity: 0,
        yVelocity: 0,
        jumps: 1,
        object: "player",
        leftPressed: false,
        rightPressed: false,
        upPressed: false,
        downPressed: false,
		punchPressed: false,
        wallJumpLeft: false,
        wallJumpRight: false,
        onGround: false,
		isPunching: false,
		punchCounter: 0,
        lastUp: false,
		lastPunch: false,
        updateRef: 0,
		sendMessageRef: 0,
        dead: false,
        connected: true,
        rank: "",
		character: 0,
        color: 0,
		inQueue: false,
		anim: "idleRight",
		lastLeftRight: "right",
		punchLeftRight: "right",
		stunned: false,
		stunnedCounter: 50,
		cameraObj: '',
		highest: 500
    };

    var updateRef = setInterval(function() {
		if (players[ws.id] && players[ws.id].clientId !== null && players[ws.id].gameId !== null){
			updatePositions(players[ws.id]);
			updateAnimations(players[ws.id]);
			pickCamera(players[ws.id]);
		}
    }, 14);
    updateRefs.push(updateRef);
    players[ws.id].updateRef = updateRef;
	
	var sendMessageRef = setInterval(function(){
		if (players[ws.id] && players[ws.id].gameId !== null){
			var condensedPlayers = [];
			var game = games[findPlayersGame(players[ws.id].gameId)];
	        for (var obj in players) {
				if (players[obj].gameId == game.id){
					var playerObj = {
		                x: players[obj].x,
		                y: players[obj].y,
		                clientId: players[obj].clientId,
						character: players[obj].character,
		                color: players[obj].color,
		                rank: players[obj].rank ? players[obj].rank + '/' + game.rankTotal : "",
						dead: players[obj].dead ? 1 : 0,
						inQueue: players[obj].inQueue ? 1 : 0,
						anim: getAnimNumber(players[obj].anim),
						cam: players[obj].cameraObj,
						highest: game.type == "single" ? getHighest(players[obj]) : ""
		            };
	            	condensedPlayers.push(playerObj);
				}
	        }
			var condensedBlocks = [];
			for (var block in game.blocks){
				if (!game.blocks[block].toBeDeleted)
					condensedBlocks.push(game.blocks[block]);
			}
	        var sendObject = {
				"status": getGameStatus(game),
	            "timer": game.timerStarted ? game.timer : "",
	            "players": JSON.stringify(condensedPlayers),
	            "blocks": JSON.stringify(condensedBlocks),
	            "lavaY": game.lava.y,
	            "lavaH": game.lava.height
	        };
			if (ws.readyState === 1)
				ws.send(Buffer.from(JSON.stringify(sendObject)).toString('base64'));
		}
	}, 14);
	
	sendMessageRefs.push(sendMessageRef);
    players[ws.id].sendMessageRef = sendMessageRef;

    ws.on('message', function incoming(json) {
		//Parse the incoming json.
        var data = JSON.parse(json);

		//Position 1: Left is pressed
        players[ws.id].leftPressed = !!(data.state & 1);
        //Position 2: Right is pressed
        players[ws.id].rightPressed = !!(data.state & 2);
        //Position 3: Up is pressed
        players[ws.id].upPressed = !!(data.state & 4);
        //Position 4: Down is pressed
        players[ws.id].downPressed = !!(data.state & 8);
		//Position 5: Punch button is pressed
		players[ws.id].punchPressed = !!(data.state & 16);
		
		//Get which character & color to display.
		players[ws.id].character = data.characterColor.charAt(0);
		players[ws.id].color = data.characterColor.charAt(1);
		
		//If they don't have a clientId, they need one.
		//If they don't have a game, they need to join one.
        if (players[ws.id].clientId === null)
            players[ws.id].clientId = data.clientId;
		if (players[ws.id].gameId === null){
			chooseGame(players[ws.id], data.gameType);
		}
		
    });

    ws.on("close", function() {
        console.log("websocket connection close");
		clearInterval(sendMessageRefs[players[ws.id].sendMessageRef]);
        clearInterval(updateRefs[players[ws.id].updateRef]);
        players[ws.id].connected = false;
        players[ws.id].dead = true;
				
		var index = findPlayersGame(players[ws.id].gameId);
		//If the player leaves, their rank needs to be determined so that the
		//other players can know.
		if (games[index].type == "ffa")
			players[ws.id].rank = games[index].aliveCount;
		
		//If the player isn't currently in the queue, subtract from alive count.
		//If it's a team game, remove the count from the team total.
		if (!players[ws.id].inQueue || games[index].type == "single"){
			games[index].aliveCount--;
			if (games[index].type == "team"){
				if (determineRed(players[ws.id])){
					games[index].redAliveCount--;
				}
				else if (determineBlue(players[ws.id]))
					games[index].blueAliveCount--;
			}
		}
		//If the game hasn't already started, delete the player.
		if (!games[index].gameStarted || games[index].type == "single"){
			games[index].totalCount--;
			if (games[index].type == "team"){
				if (determineRed(players[ws.id])){
					games[index].redTotalCount--;
				}
				else if (determineBlue(players[ws.id]))
					games[index].blueTotalCount--;
			}
            delete players[ws.id];
		}
		//If there's only one player left in the room (or it's a team battle
		//and there's no players on one of the teams), we need to stop the countdown.
        if (games[index].type == "single" || (games[index].totalCount < 2 || (games[index].type == "team" && (games[index].redTotalCount < 1 || games[index].blueTotalCount < 1))) 
			&& (games[index].timerStarted || games[index].gameStarted)) {
            games[index].gameStarted = false;
            games[index].timerStarted = false;
            games[index].timer = 15;
            for (var i = Object.keys(games[index].blocks).length; i > 2; i--) {
                delete games[index].blocks[i];
            }
            for (var obj in players) {
				if (players[obj].gameId == games[index].id)
                	players[obj].dead = false;
            }
            clearInterval(games[index].timerRef);
            clearInterval(games[index].newBlockRef);
            games[index].lava.y = 1000;
            games[index].lava.height = 500;
        }
		//If there's nobody left in the game, we can delete it.
		if (games[index].totalCount <= 0 || games[index].type == "single"){
			console.log("removing a game: id " + games[index].id);
			games.splice(index, 1);
			console.log("number of current games: " + games.length);
		}
    });
});

//When a new player joins, pick a currently running game that still has room
//for more players, or create a new one if there aren't any.
function chooseGame(player, gameType){
	var eligibleGames = games.filter(function (g){
		return g.type == gameType && g.totalCount < gamePlayerLimit;
	});
	//If there are no valid game types (or they're all full), create a new one
	//and assign it.
	if (eligibleGames.length === 0 || gameType == "single"){
		var newGameId = games.length;
		var newGame = {
			id: newGameId,
			type: gameType,
			blocks: {},
			lava: {},
			originalBlocks: {},
			timer: 15,
			timerStarted: false,
			timerRef: null,
			gameStarted: false,
			newBlockRef: null,
			cooldownStarted: false,
			cooldownRef: null,
			cooldownTimer: 6,
			aliveCount: 0,
			totalCount: 1,
			updateGameRef: null
		}
		newGame.blocks[0] = {
		    object: "block",
		    id: 0,
		    x: 0,
		    y: 600,
		    width: 1000,
		    height: 400,
		    gravity: false,
			speed: 0,
			color: "a",
			stopped: true,
			toBeDeleted: false
		};
		newGame.blocks[1] = {
		    object: "block",
		    id: 1,
		    x: 0,
		    y: -1000000,
		    width: 50,
		    height: 1000600,
		    gravity: false,
			speed: 0,
			color: "a",
			stopped: true,
			toBeDeleted: false
		};
		newGame.blocks[2] = {
		    object: "block",
		    id: 2,
		    x: 950,
		    y: -1000000,
		    width: 50,
		    height: 1000600,
		    gravity: false,
			speed: 0,
			color: "a",
			stopped: true,
			toBeDeleted: false
		};
		newGame.originalBlocks[0] = newGame.blocks[0];
		newGame.originalBlocks[1] = newGame.blocks[1];
		newGame.originalBlocks[2] = newGame.blocks[2];
		newGame.lava = {
		    y: 1000,
		    height: 500
		};
		if (newGame.type == "single"){
			newGame.timer = 5;
			newGame.timerStarted = true;
			newGame.timerRef = setInterval(function(){
				countdown(newGame);
			}, 1000);
		}
		if (newGame.type == "team"){
			if (determineRed(player)){
				newGame.redTotalCount = 1;
				newGame.blueTotalCount = 0;
				newGame.redAliveCount = 1;
				newGame.blueAliveCount = 0;
			}
			else if (determineBlue(player)){
				newGame.redTotalCount = 0;
				newGame.blueTotalCount = 1;
				newGame.redAliveCount = 0;
				newGame.blueAliveCount = 1;
			}
		}
		games.push(newGame);
		updateGameRef = setInterval(function(){
			updateGame(newGame);
		}, 14);
		player.gameId = newGameId;
		console.log("created new game: id " + newGameId);
		player.inQueue = false;
	}
	//There's an existing game that the player can join. 
	else{
		player.gameId = eligibleGames[0].id;
		eligibleGames[0].totalCount++;
		if (eligibleGames[0].type == "team"){
			if (determineRed(player)){
				eligibleGames[0].redTotalCount++;
			}
			else if (determineBlue(player))
				eligibleGames[0].blueTotalCount++;
		}
		console.log("player joined existing game: id " + eligibleGames[0].id);
		
		//Now that someone has connected, check how many people there are total.
		//If there's more than 2 players and the countdown hasn't already started yet,
		//start the timer.
	    if (eligibleGames[0].totalCount >= 2 && !eligibleGames[0].timerStarted && !eligibleGames[0].gameStarted && !eligibleGames[0].cooldownStarted
			&& (eligibleGames[0].type == "ffa" || (eligibleGames[0].type == "team" && eligibleGames[0].redTotalCount > 0 && eligibleGames[0].blueTotalCount > 0))) {
	        eligibleGames[0].timerStarted = true;
	        eligibleGames[0].timerRef = setInterval(function(){
				countdown(eligibleGames[0]);
			}, 1000);
			addPlayersFromQueue(eligibleGames[0]);
	    }
		//If the timer is ticking down before play (or it's a team battle and there's not enough players)
		//the newly connected player will join the next game.
		//Else, they will have to wait in the queue.
		if (eligibleGames[0].timerStarted || 
			((eligibleGames[0].type == "ffa" && eligibleGames[0].totalCount <= 1) || 
			eligibleGames[0].type == "team" && (eligibleGames[0].redTotalCount < 1 || eligibleGames[0].blueTotalCount < 1))){
			player.inQueue = false;
		}
		else{
			player.inQueue = true;
		}
	}
}

//Returns game status
// 0 = FFA
// 1 = Team Battle
// 2 = Starting Soon
// 3 = Searching for Players
// 4 = Single Player
function getGameStatus(game){
	if (game.gameStarted){
		if (game.type == "ffa")
			return 0;
		if (game.type == "team")
			return 1;
		if (game.type == "single")
			return 4;
	}
	else{
		if (game.cooldownStarted){
			if (game.type == "ffa")
				return 0;
			if (game.type == "team")
				return 1;
			if (game.type == "single")
				return 4;
		}
		if (game.timerStarted)
			return 2;
		else
			return 3;
	}
}

//Checks if two rectangles overlap each other.
function rectangleOverlap(rect1, rect2) {
    return (rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y);
}

function createNewBlock(game) {
    var size = 150 + Math.floor(Math.random() * 50);
    var newBlock = {
        object: "block",
        id: Object.keys(game.blocks).length + 1,
        x: 50 + Math.floor(Math.random() * (900 - size)),
        y: getHighestPlayer(game) - 1500,
        width: size,
        height: size,
        speed: 2 + Math.floor(Math.random() * 4),
        gravity: true,
		color: randomLetter(),
		stopped: false,
		toBeDeleted: false
    };
    game.blocks[Object.keys(game.blocks).length] = newBlock;
}

function randomLetter(){
	var letters = ["a", "b", "c", "d", "e"];
    var letter = letters[Math.floor(Math.random() * letters.length)];
    return letter;
}

function getHighestBlockY(game) {
    var highest = 600;
    for (var block in game.blocks) {
        if (game.blocks[block].gravity) {
            if (game.blocks[block].y <= highest)
                highest = game.blocks[block].y;
        }
    }
    return highest > -1600 ? -1600 : highest - 3000;
}

function getHighestPlayer(game){
	var highest = 500;
	for (var obj in players){
		if (players[obj].gameId == game.id){
			if (players[obj].y <= highest)
				highest = players[obj].y;
		}
	}
	return highest;
}

function countdown(game) {
    if (game.timer === 0) {
		if (game.type == "single")
			game.timer = 5;
		else
        	game.timer = 15;
        game.timerStarted = false;
        clearInterval(game.timerRef);
        game.gameStarted = true;
        game.newBlockRef = setInterval(function(){
			createNewBlock(game);
		}, 1800);
		if (game.type == "single")
		{
			game.aliveCount = 1;
			game.totalCount = 1;
		}
		else{
			game.aliveCount = game.totalCount;
        	game.rankTotal = game.totalCount;	
		}
		if (game.type == "team") {
			game.redAliveCount = 0;
			game.blueAliveCount = 0;
			game.rankTotal = 2;
			for (var obj in players){
				if (players[obj].gameId == game.id){
					if (determineRed(players[obj]))
						game.redAliveCount++;
					else if (determineBlue(players[obj]))
						game.blueAliveCount++;
				}
			}
		}
        for (var obj in players) {
			if (players[obj].gameId == game.id){
				players[obj].rank = "";
				players[obj].resetPosition = true;
				players[obj].highest = 500;
			}
        }
        game.updateBlocksRef = setInterval(function(){
			updateBlocks(game);
		}, 14);
        game.updateLavaRef = setInterval(function(){
			updateLava(game);
		}, 14);
    } else {
        game.timer--;
		console.log("countdown active: " + game.timer);
    }
}

//Determine the color of the player and set the alive count.
//Character 1 (Dog): Red = 1, Blue = 3
//Character 2 (Robot): Red = 1, Blue = 0
//Character 3 (Yokon): Red = 0, Blue = 1
//Character 4 (Cat): Red = 0, Blue = 1
function determineRed(player){
	return ((player.character == 1 && player.color == 0) ||
			(player.character == 2 && player.color == 1) ||
			(player.character == 3 && player.color == 0) ||
			(player.character == 4 && player.color == 0));
}

function determineBlue(player){
	return ((player.character == 1 && player.color == 3) ||
			(player.character == 2 && player.color == 0) ||
			(player.character == 3 && player.color == 1) ||
			(player.character == 4 && player.color == 1));
}

function updatePositions(player) {
    //Player logic
    if (player !== null && player.gameId !== null) {
		var game = games[findPlayersGame(player.gameId)];
		
        var upPressed = player.upPressed;
        var downPressed = player.downPressed;
        var leftPressed = player.leftPressed;
        var rightPressed = player.rightPressed;
		var punchPressed = player.punchPressed;
        if (!player.dead && !player.inQueue) {
			if (player.resetPosition){
				player.resetPosition = false;
				resetPlayerPosition(player);
			}
			else{
				if (player.stunned)
					player.stunnedCounter--;
				if (player.stunnedCounter <= 0){
					player.stunned = false;
					player.stunnedCounter = 50;
				}
				
				//The player pressed up and is on the ground
				if (upPressed && !player.lastUp && player.onGround && !player.stunned) {
					player.yVelocity = -15;
					player.onGround = false;
				}
				//The player pressed up and is already on the left wall -> wall jump to the right
				if (upPressed && !player.lastUp && player.wallJumpLeft && !player.stunned) {
					player.yVelocity = -14;
					player.xVelocity = 12;
					player.onGround = false;
					player.wallJumpLeft = false;
				}
				//The player pressed up and is already on the right wall -> wall jump to the left
				if (upPressed && !player.lastUp && player.wallJumpRight && !player.stunned) {
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
				if (!player.stunned && player.xVelocity !== 0 && (player.isPunching || (!leftPressed && !rightPressed))) {
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
				for (var block in game.blocks) {
					var newObj = {
						x: player.x,
						y: player.y + player.yVelocity,
						width: player.width,
						height: player.height
					};
					if (rectangleOverlap(game.blocks[block], newObj)) {
						if (game.blocks[block].y > player.y)
							objectBeneath = game.blocks[block];
						else if (game.blocks[block].y < player.y)
							objectAbove = game.blocks[block];
					}
				}

				//There's an object directly above and directly below the player
				//The player is squished.
				if (objectAbove !== null && objectBeneath !== null) {
					if (game.type == "ffa")
						player.rank = game.aliveCount;
					game.aliveCount--;
					if (game.type == "team"){
						if (determineRed(player))
							game.redAliveCount--;
						else if (determineBlue(player))
							game.blueAliveCount--;
					}
					player.dead = true;
				}

				//Nothing is underneath the player, so keep falling
				if (objectBeneath === null && !player.dead) {
					player.onGround = false;
					player.y += player.yVelocity;
				}
				//The next y coordinate overlaps a block that's underneath the player.
				//They are now on the ground and stop falling.
				if (objectBeneath !== null && !player.dead) {
					player.y = objectBeneath.y - player.height;
					player.yVelocity = objectBeneath.speed;
					player.onGround = true;
					player.wallJumpLeft = false;
					player.wallJumpRight = false;
				}
				//There's a block above the player.
				//The object blocks their path. Stop their yVelocity and they start falling.
				if (objectAbove !== null && !player.dead) {
					player.y = objectAbove.y + objectAbove.height;
					player.yVelocity = objectAbove.speed;
				}

				//Check if player has entered the lava
				if (player.y + (player.height / 2) >= game.lava.y) {
					if (game.gameStarted || game.cooldownStarted) {
						if (!game.cooldownStarted) {
							if (game.type == "ffa")
								player.rank = game.aliveCount;
							game.aliveCount--;
							if (game.type == "team"){
								if (determineRed(player))
									game.redAliveCount--;
								else if (determineBlue(player))
									game.blueAliveCount--;
							}
						}
						player.dead = true;
					} else {
						player.resetPosition = true;
					}
				}
				
				//PUNCHING
				//The player is on the ground and the punch button is pressed. Begin the punch
				if (punchPressed && !player.lastPunch && player.onGround && !player.dead && !player.stunned){
					player.isPunching = true;
					player.punchLeftRight = player.lastLeftRight;
				}
				
				if (player.isPunching){
					player.punchCounter++;
					if (player.punchCounter > 25){
						player.isPunching = false;
						player.punchCounter = 0;
					}
					else if (player.punchCounter == 5 || player.punchCounter == 6){
						var hitbox;
						if (player.punchLeftRight == "right"){
							hitbox = {
								x: player.x + player.width,
								y: player.y + (player.height / 6),
								width: 2 * (player.width / 3),
								height: (player.height / 3)
							};
							checkHitbox(player, hitbox);
						}
						else{
							hitbox = {
								x: player.x - (2 * (player.width / 3)),
								y: player.y + (player.height / 6),
								width: 2 * (player.width / 3),
								height: (player.height / 3)
							};
							checkHitbox(player, hitbox);
						}
					}
				}
				
				if (punchPressed)
					player.lastPunch = true;
				else
					player.lastPunch = false;
				

				//X VELOCITY
				//The player is pressing left so we need to move them with their xVelocity
				if (leftPressed && !player.dead && !player.isPunching && !player.stunned) {
					player.lastLeftRight = "left";
					player.xVelocity -= xSpeed;
					if (player.xVelocity < -6)
						player.xVelocity = -6;
				}
				if (rightPressed && !player.dead && !player.isPunching && !player.stunned) {
					player.lastLeftRight = "right";
					player.xVelocity += xSpeed;
					if (player.xVelocity > 6)
						player.xVelocity = 6;
				}
				//Check if there are any blocks in the way
				for (var block in game.blocks) {
					var newObj = {
						x: player.x + player.xVelocity,
						y: player.y,
						width: player.width,
						height: player.height
					};
					if (rectangleOverlap(game.blocks[block], newObj)) {
						if (game.blocks[block].x > player.x)
							objectRight = game.blocks[block];
						else if (game.blocks[block].x < player.x)
							objectLeft = game.blocks[block];
						break;
					}
				}
				//Nothing is stopping the player from moving left so, move at xVelocity
				if (objectLeft === null && objectRight === null && !player.dead) {
					player.x += player.xVelocity;
					player.wallJumpLeft = false;
					player.wallJumpRight = false;
				}
				//There's a block to the left of the player. Stop the xVelocity and set
				//the position to be to the right of the object.
				if (objectLeft !== null && !player.dead) {
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
				if (objectRight !== null && !player.dead) {
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
			return;
		}
		else if (player.stunned){
			if (player.lastleftRight == "left"){
				player.anim = "stunnedLeft";
				return;
			}
			else{
				player.anim = "stunnedRight";
				return;
			}
		}
		else{
			//Check if player is in the air
			if (!player.onGround){
				if (player.wallJumpLeft){
					player.anim = "wallSlideLeft";
					return;
				}
				if (player.wallJumpRight){
					player.anim = "wallSlideRight";
					return;
				}
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
			//Player is on the ground
			else{
				//The player is punching.
				if (player.isPunching){
					if (player.punchLeftRight == "left"){
						player.anim = "punchLeft";
						return;
					}
					else{
						player.anim = "punchRight";
						return;
					}
				}
				//The player is standing still.
				else if (player.xVelocity === 0){
					if (player.lastLeftRight == "left"){
						if (player.downPressed){
							player.anim = "duckingLeft";
							return;
						}
						else{
							player.anim = "idleLeft";
							return;	
						}
					}
					else{
						if (player.downPressed){
							player.anim = "duckingRight";
							return;
						}
						else{
							player.anim = "idleRight";
							return;
						}
					}
				}
				//The player is moving.
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

function updateBlocks(game) {
    /*
    	Update block positions
    */
    for (var block in game.blocks) {
        var blockUnderneath = null;
        if (game.blocks[block].gravity && !game.blocks[block].stopped) {
            var newObj = {
                x: game.blocks[block].x,
                y: game.blocks[block].y + game.blocks[block].speed,
                width: game.blocks[block].width,
                height: game.blocks[block].height
            };
            for (var block2 in game.blocks) {
                if (block2 != block && rectangleOverlap(newObj, game.blocks[block2])) {
                    blockUnderneath = game.blocks[block2];
                    break;
                }
            }
            if (blockUnderneath === null)
                game.blocks[block].y += game.blocks[block].speed;
            else{
				if (blockUnderneath.stopped)
					game.blocks[block].stopped = true;
                game.blocks[block].y = blockUnderneath.y - game.blocks[block].height;
			}
        }
		if (game.blocks[block].stopped && game.blocks[block].gravity && game.lava.y < game.blocks[block].y - 100)
			game.blocks[block].toBeDeleted = true;
    }
}

function updateLava(game) {
    if (game.gameStarted) {
        game.lava.y -= 0.4;
        game.lava.height += 0.4;
    }
}

function updateGame(game) {
    if (game.gameStarted && game.aliveCount <= 1 && game.type == "ffa") {
        game.gameStarted = false;
        game.timerStarted = false;
        game.timer = 15;
        game.cooldownStarted = true;
        game.cooldownTimer = 6;
        for (var obj in players) {
			if (players[obj].gameId == game.id){
				if (!players[obj].dead && !players[obj].inQueue)
                	players[obj].rank = 1;
			}
        }
        clearInterval(game.updateBlocksRef);
        clearInterval(game.updateLavaRef);
        clearInterval(game.timerRef);
        clearInterval(game.newBlockRef);
        game.cooldownRef = setInterval(function(){
			cooldown(game);
		}, 1000);
    }
	if (game.gameStarted && game.type == "team"){
		if (game.redAliveCount < 1 || game.blueAliveCount < 1){
			game.gameStarted = false;
			game.timerStarted = false;
			game.timer = 15;
			game.cooldownStarted = true;
			game.cooldownTimer = 6;
			if (game.redAliveCount < 1){
				for (var obj in players){
					if (players[obj].gameId == game.id){
						if (determineBlue(players[obj])){
							players[obj].rank = 1;
						}
						else
							players[obj].rank = 2;
					}
				}
			}
			else if (game.blueAliveCount < 1){
				for (var obj in players){
					if (players[obj].gameId == game.id){
						if (determineRed(players[obj])){
							players[obj].rank = 1;
						}
						else
							players[obj].rank = 2;
					}
				}
			}
			clearInterval(game.updateBlocksRef);
	        clearInterval(game.updateLavaRef);
	        clearInterval(game.timerRef);
	        clearInterval(game.newBlockRef);
	        game.cooldownRef = setInterval(function(){
				cooldown(game);
			}, 1000);
		}
	}
	if (game.gameStarted && game.aliveCount < 1 && game.type == "single") {
        game.gameStarted = false;
        game.timerStarted = false;
        game.timer = 5;
        game.cooldownStarted = true;
        game.cooldownTimer = 6;
        clearInterval(game.updateBlocksRef);
        clearInterval(game.updateLavaRef);
        clearInterval(game.timerRef);
        clearInterval(game.newBlockRef);
        game.cooldownRef = setInterval(function(){
			cooldown(game);
		}, 1000);
    }
}

function resetPlayerPosition(player) {
	console.log("resetting player position");
    if (player.x <= 50)
        player.x = 55;
    if (player.x + player.width >= 950)
        player.x = 945 - player.width;
	player.y = 500;
    player.yVelocity = 0;
    player.xVelocity = 0;
	player.onGround = true;
	player.wallJumpLeft = false;
    player.wallJumpRight = false;
	player.leftPressed = false;
	player.rightPressed = false;
	player.upPressed = false;
	player.downPressed = false;
}

function cooldown(game) {
    if (game.cooldownTimer === 0) {
        game.cooldownStarted = false;
        game.cooldownTimer = 6;
        for (var block in game.blocks){
			if (game.blocks[block].id > 2)
				delete game.blocks[block];
		}
        for (var obj in players) {
			if (players[obj].gameId == game.id){
				players[obj].dead = false;
				players[obj].resetPosition = true;
            	if (!players[obj].connected){
					game.totalCount--;
                	delete players[obj];
				}
			}
        }
        game.lava.y = 1000;
        game.lava.height = 500;
        clearInterval(game.cooldownRef);
        if ((game.type == "single" && !game.timerStarted) || (game.totalCount >= 2 && !game.timerStarted && (game.type == "ffa" || (game.type == "team" && game.redTotalCount > 0 && game.blueTotalCount > 0)))) {
            game.timerStarted = true;
            game.timerRef = setInterval(function(){
				countdown(game);
			}, 1000);
			addPlayersFromQueue(game.id);
        }
    } else {
        game.cooldownTimer--;
    }
}

function addPlayersFromQueue(gameId){
	var count = 0;
	for (var obj in players){
		if (players[obj].gameId == gameId){
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
		case "wallSlideLeft": return 8;
		case "wallSlideRight": return 9;
		case "win": return 10;
		case "dead": return 11;
		case "punchLeft": return 12;
		case "punchRight": return 18;
		case "duckingLeft": return 24;
		case "duckingRight": return 25;
		case "stunnedLeft": return 26;
		case "stunnedRight": return 27;
		default: return 0;
	}
}

function checkHitbox(currentPlayer, hitbox){
	var game = games[findPlayersGame(currentPlayer.gameId)];
	for (var obj in players){
		if (players[obj] != currentPlayer && players[obj].gameId == currentPlayer.gameId){
			if (rectangleOverlap(players[obj], hitbox) && !players[obj].stunned && !players[obj].dead && !players[obj].inQueue
				&& (game.type === "ffa" || 
				(game.type === "team" && (determineRed(players[obj]) && determineBlue(currentPlayer)) || (determineBlue(players[obj]) && determineRed(currentPlayer))))){
				players[obj].stunned = true;
				players[obj].yVelocity = -10;
				if (currentPlayer.punchLeftRight == "right"){
					players[obj].lastLeftRight = "left";
					players[obj].xVelocity = 12;
				}
				else{
					players[obj].xVelocity = -12;
					players[obj].lastLeftRight = "right";
				}
			}
		}
	}
}

function pickCamera(player){
	if (player){
		if (!player.dead && !player.inQueue){
			player.cameraObj = player.clientId;
			return player.clientId;
		}
		else{
			var ids = [];
			for (var obj in players){
				if (players[obj].cameraObj == players[obj].clientId && !players[obj].dead && !players[obj].inQueue){
					player.cameraObj = players[obj].clientId;
					return players[obj].clientId;
				}
				else if (!players[obj].dead && !players[obj].inQueue && players[obj].gameId == player.gameId)
					ids.push(players[obj].clientId);
			}
			if (ids.length === 0){
				player.cameraObj = '';
				return '';
			}
			else{
				var rand = ids[Math.floor(Math.random() * ids.length)];
				player.cameraObj = rand;
				return rand;
			}
		}	
	}
}

function findPlayersGame(value){
	for (var i = 0; i < games.length; i++){
		if (games[i].id === value)
			return i;
	}
	return -1;
}

function getHighest(player){
	if (player.y < player.highest)
	{
		player.highest = player.y;
	}
	return -1 * (Math.floor(player.highest) - 500);
}