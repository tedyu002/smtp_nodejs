var config = require('./config.js');
var log = require('./log.js');
var constant = require('./constant.js');
var readline = require('./readline.js');

var cluster = require('cluster');

if (cluster.isMaster) {
	for (var i = 0; i < config.fork_num; ++i) {
		cluster.fork();
	}
	cluster.on('exit', function(worker, code, signal) {
		console.log('worker ' + worker.process.pid + 'died');
	});
}
else {
	var net = require('net');
	var server = net.createServer(function(connection) {
		var log_prefix = log.prefix(connection.remoteAddress);
		console.log( log_prefix + 'client connected');

		connection.on('end', function() {
			console.log(log_prefix + 'cliet disconnected');
		});
		

		var readline_inst = readline.instance(connection, constant.EVT_LINE);

		connection.on('data', readline_inst.read);
		connection.pause();

		readline_inst.emitter.on(constant.EVT_LINE, function(cmd_line) {
			connection.write(cmd_line, function() {
				readline_inst.read_next();
			});
		});

		connection.on('timeout', function() {
			connection.end();
		});

		connection.setTimeout(config.idle_time);

		readline_inst.read_next();
	});

	server.listen(8000, function() {
		var log_prefix = log.prefix('');
		console.log(log_prefix + 'server is listening');
	});
}
