const fs = require('fs');
const spawnSync = require('child_process').spawnSync;
const path = require('path');
const async = require('async');
const archiver = require('archiver');

const bundleName = "clusterodm-windows-x64.zip";

async.series([
    cb => {
        // Cleanup directories
        console.log("Cleaning up folders");
        for (let dir of ["data", "tmp"]){
            for (let entry of fs.readdirSync(dir)){
                if (entry !== ".gitignore"){
                    const e = path.join(dir, entry);
                    console.log(`Removing ${e}`);
                    if (fs.isDirectory(e)){
                        fs.rmdirSync(e, { recursive: true });
                    }else{
                        fs.unlinkSync(e);
                    }
                }
            }
        }
        cb();
    },

    cb => {
        console.log("Building executable");
        const code = spawnSync('nexe.cmd', ['index.js', '-t', 'windows-x64-12.16.3', '-o', 'clusterodm.exe'], { stdio: "pipe"}).status;

        if (code === 0) cb();
        else cb(new Error(`nexe returned non-zero error code: ${code}`));
    },
    cb => {
        // Zip
        const outFile = path.join("dist", bundleName);
        if (!fs.existsSync("dist")) fs.mkdirSync("dist");
        if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

        let output = fs.createWriteStream(outFile);
        let archive = archiver.create('zip', {
            zlib: { level: 5 } // Sets the compression level (1 = best speed since most assets are already compressed)
        });

        archive.on('finish', () => {
            console.log("Done!");
            cb();
        });

        archive.on('error', err => {
            console.error(`Could not archive .zip file: ${err.message}`);
            cb(err);
        });

        const files = [
            "data",
            "docs",
            "letsencrypt",
            "public",
            "tmp",
            "config-default.json",
            "LICENSE",
            "package.json",
            "clusterodm.exe"
        ];

        archive.pipe(output);
        files.forEach(file => {
            console.log(`Adding ${file}`);
            let stat = fs.lstatSync(file);
            if (stat.isFile()){
                archive.file(file, {name: path.basename(file)});
            }else if (stat.isDirectory()){
                archive.directory(file, path.basename(file));
            }else{
                logger.error(`Could not add ${file}`);
            }
        });

        archive.finalize();
    }
], (err) => {
    if (err) console.log(`Bundle failed: ${err}`);
    else console.log(`Bundle ==> dist/${bundleName}`);
});


