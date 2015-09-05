"use strict";

var serialport = require("serialport");
var SerialPort = serialport.SerialPort;

var sp = new SerialPort("/dev/ttyMFD1", {
	baudrate: 9600
});

var deviceId = 0x0001;

var commands = {
	open: 0x01,
	close: 0x02,
	cmosLed: 0x12,
	getEnrollCount: 0x20,
	checkEnrolled: 0x21,
	enrollStart: 0x22,
	enroll1: 0x23,
	enroll2: 0x24,
	enroll3: 0x25,
	isPressFinger: 0x26,
	deleteId: 0x40,
	deleteAll: 0x41,
	identify: 0x51,
	captureFinger: 0x60
}

var currentCallback = null;

sp.on("data", function(data){
	data.split("").map(function(d){ return d.charCode; });
	
	var cb = currentCallback;
	currentCallback = null;
	
	if(data[8] == 0x30){
		cb(null, data.slice(4, 8));
	} else {
		cb("Error.", null);
	}
});

var send = function(data, cb){
	if(currentCallback != null){
		cb("Another command is already being processed.", null);
	}
	currentCallback = cb;
	sp.write(Buffer(data));
}

var scan = function(cb){
	var cnt = 0;
	var check = setInterval(function(){
		cnt++;
		if(cnt >= 100){
			clearInterval(check);
			cb("Request timed out.", null);
		}
		sendCommand(commands.isPressFinger, 0x00, function(err, data){
			if(!err || data[0] == 0){
				sendCommand(commands.captureFinger, 0x00, function(err, data){
					if(!err){
						clearInterval(check);
						cb(null, data);
					}
				});
			}
		});
	}, 100);
}

var sendCommand = function(command, parameter, cb){
	var command = [0x55, 0xAA, deviceId] + [parameter, 0x00, 0x00, 0x00] + [command, 0x00];
	var sum = command.reduce(function(a, b){ return a + b; });
	comman += [Math.floor(sum/0x100), sum%0x100];
	send(command, cb);
}

var enroll = function(id, cb){
	var step = function(command, cb){
		return function(err, data){
			if(err){
				cb(err, null);
				return;
			}
			scan(function(err, data){
				if(err){
					cb(err, null);
					return;
				}
				sendCommand(command, 0x00, cb);
			});
		}
	}

	sendCommand(commands.getEnrollCount, 0x00, function(err, data){
		if(err){
			cb(err);
			return;
		}
		var nextId = data[0];
		sendCommand(commands.enrollStart, nextId, function(err, data){
			step(commands.enroll1, step(commands.enroll2, step(commands.enroll3, cb)));
		});
	});
}

var identify = function(cb){
	scan(function(err, data){
		sendCommand(commands.identify, 0x00, function(err, data){
			if(err){
				cb(err, null);
				return;
			}
			cb(null, data[0]);
		});
	});
}