var readline = require('readline');

var rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

var SerialPort = require("serialport").SerialPort
var serialPort = new SerialPort("/dev/tty.usbmodemfa133", {
	baudrate: 9600
});

serialPort.on("data", function(data) {
	var out = "> "
	for (var a = 0; a < data.length; a++) {
		if (data[a] > 32 && data[a] < 127) {
			out+=String.fromCharCode(data[a])+ " ";
		} else {
			out+=""+data[a]+" "
		}
	}
	console.log(out);
})
rl.on("line", function(arg) { 
	var out = []
	for (var a = 0; a < arg.length; a++) {
		if (arg[a] == "\\" && arg[a+1] == "x") {
			out.push(parseInt(arg.slice(a+2,a+4), 16));
			a = a+3;
			continue;
		}
		out.push( arg.charCodeAt(a));
	}
	out.push("\n".charCodeAt(0))
	serialPort.write(new Buffer(out));
});


