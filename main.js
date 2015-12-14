var config = require('./config.js');
var log = require('./log.js');
var constant = require('./constant.js');
var readline = require('./readline.js');

var cluster = require('cluster');
var fs = require('fs');

if (cluster.isMaster) {
	fs.mkdir(config.work_dir, function() {
		fs.mkdir(config.dst_dir, function() {
			var pop3_worker;

			pop3_worker = cluster.fork();
			pop3_worker.send('pop3');

			for (var i = 0; i < config.fork_num; ++i) {
				cluster.fork().send('smtp');
			}

			cluster.on('exit', function(worker, code, signal) {
				console.log('worker ' + worker.process.pid + ' died, refork');
				if (pop3_worker.id === worker.id) {
					pop3_worker = cluster.fork();
					pop3_worker.send('pop3');
				}
				else {
					cluster.fork().send('smtp');
				}
			});
		});
	});
}
else {
	cluster.worker.process.on('message', function(type) {
		if (type === 'smtp') {
			var smtp_server = require('./smtp.js');
			smtp_server.run();
		}
		else if (type === 'pop3') {
		}
	});
}
