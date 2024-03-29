var serialport = require("serialport");
var SerialPort = serialport.SerialPort; // localize object constructor
var fs         = require("fs");

var info;

var decrypted; 

var connections = {}
var serial = []; 

var activeuser;


function startup() {
	if (!fs.existsSync(__dirname+"/fragment_store.json")) {
		fs.writeFileSync(__dirname+"/fragment_store.json", JSON.stringify({
			accounts: [],
		}))
	}

	info = JSON.parse(fs.readFileSync(__dirname+"/fragment_store.json"));
	
	serial = byteify(fs.readFileSync("/factory/serial_number").toString().slice(0,16));

	
	
	var sp = new SerialPort("/dev/ttyGS0", {
		baudrate: 9600
	});


	sp.on("data", function (data) {
		data = data.toString()
		var req = data.charCodeAt(0);
		var cmd = data.charCodeAt(1);
		var out = ""
		for (var a = 0; a < data.length; a++) {
			out += "" + data.charCodeAt(a) + " ";
		}
		console.log(out);
		switch(cmd) {
			case 0x01:	
				sp.write(new Buffer([req, 0xFF, createID()]))
				break;
			case 0x02: 
				sp.write(new Buffer([req, 0xFE, decrypted ? 0x01 : 0x00]));
				break;
			case 0x03: 
				sp.write(new Buffer([req, 0xF2, 0x00, 0x10].concat(serial)));
				break;
			case 0x04:
				if (activeuser) {
					var name = decrypted.username;
					sp.write(new Buffer([req, 0xF2, activeuser.length/256, activeuser.length].concat(byteify(activeuser))));
				} else {
					console.error("Attempting to fetch user of non active database");
					sp.write(new Buffer([req, 0xF0]));
				}
				break;
			case 0x05:
				var users = byteify(info.accounts);
				sp.write(new Buffer([req, 0xF2,  users.length/256, users.length].concat(users)))
				break;
			case 0x06:
				var end = 3+data.charCodeAt(2)
				var uname = (data.slice(3,end));
				var password = (data.slice(end+1, 1+end+data.charCodeAt(end)));
				if (info.accounts.indexOf(uname) < 0) {
					console.error("Attempting to sign in as invalid user");
					sp.write(new Buffer([req, 0xEF]));
					break;
				} 
				var path = __dirname+"/folders/"+uname+".ejson"
				fs.exists(path, function(ex) {
					if (!ex) {
						console.error("Attempting to decrypt non-existent file");
						sp.write(new Buffer([req, 0xEF]));
						return;
					}
					fs.readFile(path, function(err, data) {
						var maybeJson = XOR(data.toString(), password);
						try {
							decrypted = JSON.parse(maybeJson);
							activeuser = uname;
							sp.write(new Buffer([req, 0xFE, 0x01]))

						} catch (e) {
							console.error("Invalid decryption password")
							sp.write(new Buffer([req, 0xFE, 0x00]));
						}
					})
				})
				break;
			case 0x07:
				if (!decrypted) {
					console.error("Attempting to fetch fragment of closed database")
					sp.write(new Buffer([req, 0xEF]));
					break;
				}
				var fragment = decrypted.frags[(data.slice(3, 3+data.charCodeAt(2)))]
				if (!fragment) {
					console.error("Attempting to fetch nonexistent fragment");
					sp.write(new Buffer([req, 0xEF]));
					break;
				}
				sp.write(new Buffer([req, 0xF2, fragment.length/256, fragment.length].concat(byteify(fragment))));
				break;
			case 0x08:
				if (!decrypted) {
					console.error("Attempting to fetch fragment list of closed database");
					sp.write(new Buffer([req, 0xEF]));
					break;
				}
				var frags = JSON.stringify(Object.keys(decrypted.frags));
				sp.write(new Buffer([req, 0xF2, frags.length/256, frags.length].concat(byteify(frags))));
				break;
			case 0x10:
				var end = 3+data.charCodeAt(2)
				var uname = (data.slice(3,end));
				var password = (data.slice(end+1, 1+end+data.charCodeAt(end)));
				if (info.accounts.indexOf(uname) >= 0) {
					console.error("Attempting to create existing user");
					sp.write(new Buffer([req, 0xEF]));
					break;
				}
				info.accounts.push(uname);
				decrypted = {username: uname, password: password, frags: {}};
				activeuser = uname;
				saveInfo();
				saveDecrypted();
				sp.write(new Buffer([req, 0xF1]));
				break;
			case 0x11:
				if (!decrypted) {
					console.error("Attempting to save password for non-available database");
					sp.write(new Buffer([req, 0xEF]));
					break;
				}
				var end = 3+data.charCodeAt(2)
				var url = (data.slice(3,end));
				var fragment = (data.slice(end+1,1+end+data.charCodeAt(end)));
				decrypted.frags[url] = fragment;
				saveDecrypted();
				sp.write(new Buffer([req, 0xF1]));
				break;
			default:
				console.log("Packet of size: "+data.length);
				var out = ""
				for (var a = 0; a < data.length; a ++) {
					out+=""+data.charCodeAt(a)+" "
				}
				console.error("Unknown command: "+out);
				sp.write(new Buffer([req, 0xEF]));
				break;
		}
		sp.write(new Buffer([0x7F]));
	});
}

function saveInfo() {
	fs.writeFile(__dirname+"/fragment_store.json", JSON.stringify(info));
}

function saveDecrypted() {
	console.log(decrypted);
	fs.writeFile(__dirname+"/folders/"+decrypted.username+".ejson", XOR(JSON.stringify(decrypted), decrypted.password), 'binary');
}


function byteify(obj) {
	if (typeof obj != "string") {
		obj = JSON.stringify(obj);
	}
	var out = []
	for (var a in obj) {
		out.push(obj.charCodeAt(a));
	}
	return out;
}

var XOR = function(a,b) {
	if (typeof a == typeof b && typeof a == 'number') {
		return a ^ b;
	} else if ( typeof a == typeof b && typeof a == 'string') {
		var output = ""
		for (var i = 0; i < a.length; i++) {
			output += String.fromCharCode(a.charCodeAt(i)^b.charCodeAt(i%b.length));
		}
		return output;
	}
}

function createID() {
	for (var i = 0; i < 0xFF; i++) {
		if (!connections[i]) {
			connections[i] = {};
			return i;
		}
	}
	return -1; 
}

(function() {
	startup()
})()




