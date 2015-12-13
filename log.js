var cluster = require('cluster');

module.exports = {
	instance: function(ip) {
		var prefix = ' ' + cluster.worker.id + ' ' + cluster.worker.process.pid + ' ' + ip + '] ';
		return function(message) {
			console.log('[' + (new Date()).toISOString() + prefix + message);
		};
	}
};
