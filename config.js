
module.exports = {
	debug: false,
	domain_name: "kekeke.com",
	smtp_port: 8000,
	pop3_port: 8110,
	work_dir: './work_dir',
	dst_dir: './dst_dir',
	fork_num: (require('os').cpus().length / 2) + 1,
	idle_time: 5 * 60 * 1000,
	buffer_size: 64 * 1024,
	mail_data_max: 10 * 1024 * 1024,
	rcpt_max: 100,
	data_write_merge_count: 128
};
