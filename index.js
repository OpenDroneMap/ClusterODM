const HttpProxy = require('http-proxy');
const http = require('http');
const config = require('./config');
const admincli = require('./admincli');
const logger = require('./libs/logger');
const package_info = require('./package_info');
const nodes = require('./libs/nodes');
const url = require('url');
const streamify = require('stream-array');
const Busboy = require('busboy');
const fs = require('fs');

(async function(){
    logger.info(package_info.name + " " + package_info.version);
    
    admincli.create({port: config.admin_cli_port, password: config.admin_cli_pass});
    
    const proxy = new HttpProxy();
    
    const proxyServer = http.createServer(function (req, res) {
        const target = "http://localhost:3002";

        const urlParts = url.parse(req.url, true);
        const { query, pathname } = urlParts;
    
        if (query.token) query.token = "test"; // Example override of token string
    
        req.url = url.format({ query, pathname });
        
        // if (req.url.indexOf("new") !== -1){
        //     console.log(req.url, req.body);
        // }

        if (req.method === 'POST') {
            const bodyWfs = fs.createWriteStream('myBinaryFile');

            req.pipe(bodyWfs).on('finish', () => {
                const bodyRfs = fs.createReadStream('myBinaryFile');

                const busboy = new Busboy({ headers: req.headers });
                busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
                    console.log('File [' + fieldname + ']: filename: ' + filename);
                    file.resume();
                });
                busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
                    console.log('Field [' + fieldname + ']: value: ' + val);
                });
                busboy.on('finish', function() {
                    console.log('Done parsing form!');
                    proxy.web(req, res, { target, buffer: fs.createReadStream('myBinaryFile') });
                });

                bodyRfs.pipe(busboy);
            });
        }else{
            proxy.web(req, res, { target });
        }
    });

    const gracefulShutdown = async() => {
        await nodes.cleanup();
        logger.info("Bye!");
        process.exit(0);
    };

    // listen for TERM signal .e.g. kill
    process.on('SIGTERM', gracefulShutdown);

    // listen for INT signal e.g. Ctrl-C
    process.on('SIGINT', gracefulShutdown);

    // Start
    await nodes.initialize();
    logger.info(`Starting proxy on ${config.port}`);
    proxyServer.listen(config.port);
})();