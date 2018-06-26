const logger = require('./libs/logger');
const net = require('net');
const package = require('./package_info');

module.exports = {
    create: function(options){
        logger.info("Starting admin CLI on " + options.port);

        if (!options.password){
            logger.warn(`No admin CLI password specified, make sure port ${options.port} is secured`);
        }

        // Start a TCP Server
        net.createServer(function (socket) {
            let loggedIn = false;
            const printCaret = () => {
                if (loggedIn) socket.write("#> ");
                else socket.write("$> ");
            };

            // Identify this client
            socket.name = socket.remoteAddress + ":" + socket.remotePort;

            // Send a nice welcome message and announce
            socket.write("Welcome " + socket.name + " " + package.name + ":" + package.version + "\r\n");
            if (options.password){
                socket.write("LOGIN <LOGIN> to log-in\r\n");
            }else{
                loggedIn = true;
            }
            socket.write("QUIT to quit\r\n");

            printCaret();

            // Handle incoming messages from clients.
            socket.on('data', function (data) {
                const parts = data.toString().split(" ").map(p => p.trim());
                const command = parts[0].toLocaleUpperCase();
                const args = parts.slice(1, parts.length);
                
                if (command == "QUIT"){
                    socket.write("Bye!\r\n");
                    socket.destroy();
                    return;
                }

                if (loggedIn){
                    socket.write(data);
                }else{
                    if (command == "LOGIN" && args[0] == options.password){
                        loggedIn = true;
                        socket.write("OK\r\n");
                    }else{
                        socket.destroy();
                        return;
                    }
                }

                printCaret();
            });
        }).listen(options.port);
    }
};