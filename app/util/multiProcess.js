const cluster = require('cluster');

exports.new = (tasks) => {
    return {
        start: () => {
            if (cluster.isMaster) {
                for (let index = 0; index < tasks.length; index++) {
                    const task = tasks[index];
                    const worker = cluster.fork();
                    worker.send({ index })
                }
                cluster.on('online', (worker) => {
                    console.log(`workder ${worker.process.pid} online`);
                })
                cluster.on('exit', (worker, code, signal) => {
                    console.log(`worker ${worker.process.pid} exit`, { code, signal })
                })
            } else {
                process.on('message', (msg) => {
                    const { index } = msg;
                    tasks[index]({ index, pid: process.pid });
                });
            }
        }
    }
}
