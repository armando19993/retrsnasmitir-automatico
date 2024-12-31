const { Builder, By } = require('selenium-webdriver');
const ffmpeg = require('fluent-ffmpeg');

// Almacena los procesos de FFmpeg activos
const ffmpegProcesses = {};

// Configuración para Selenium
async function getHlsUrls(loginDetails, channelUrls) {
    const driver = await new Builder().forBrowser('chrome').build();
    const hlsUrls = [];

    try {
        // Navega al login
        await driver.get('https://www.tdmax.com/login');
        await driver.sleep(3000); // Espera para que cargue

        // Realiza el login
        const emailField = await driver.findElement(By.xpath('/html/body/streann-root/div[1]/streann-login/div/div[1]/form/streann-custom-input[1]/div/div[2]/input'));
        const passwordField = await driver.findElement(By.xpath('/html/body/streann-root/div[1]/streann-login/div/div[1]/form/streann-custom-input[2]/div/div[2]/input'));
        const loginButton = await driver.findElement(By.xpath('/html/body/streann-root/div[1]/streann-login/div/div[1]/form/div[2]/button'));

        await emailField.sendKeys(loginDetails.email);
        await passwordField.sendKeys(loginDetails.password);
        await loginButton.click();
        await driver.sleep(10000); // Espera para el inicio de sesión

        // Navega por las URLs de los canales
        for (const url of channelUrls) {
            console.log(`Navegando a ${url}`);
            await driver.get(url);
            await driver.sleep(10000); // Espera para que las solicitudes se completen

            // Captura las solicitudes HLS
            const logs = await driver.manage().logs().get('performance');
            for (const log of logs) {
                const message = JSON.parse(log.message).message;
                if (message.method === 'Network.responseReceived' && message.params.response.url.includes('playlist.m3u8')) {
                    hlsUrls.push(message.params.response.url);
                    console.log(`URL encontrada: ${message.params.response.url}`);
                    break;
                }
            }
        }
    } catch (err) {
        console.error('Error en Selenium:', err);
    } finally {
        await driver.quit();
    }

    return hlsUrls;
}

// Manejo de transmisiones con FFmpeg
const broadcastManager = {
    startBroadcast: async function (channel) {
        if (!channel.rtmpUrl) {
            console.log(`No se puede iniciar transmisión para ${channel.name}: RTMP URL no especificada.`);
            return;
        }

        // Detiene cualquier transmisión previa para el canal
        await this.stopBroadcast(channel.name);

        console.log(`Iniciando transmisión para ${channel.name}`);
        console.log(`HLS URL: ${channel.hlsUrl}`);
        console.log(`RTMP URL: ${channel.rtmpUrl}`);

        try {
            const process = ffmpeg()
                .input(channel.hlsUrl)
                .inputOptions(['-re', '-fflags +genpts'])
                .outputOptions(['-c:v copy', '-c:a aac', '-b:a 128k', '-f flv'])
                .output(channel.rtmpUrl);

            process
                .on('start', () => {
                    console.log(`Transmisión iniciada para ${channel.name}`);
                    ffmpegProcesses[channel.name] = { process, status: 'running', startTime: new Date() };
                })
                .on('error', (err) => {
                    console.error(`Error en la transmisión de ${channel.name}:`, err.message);
                    ffmpegProcesses[channel.name] = { process: null, status: 'error', lastError: err.message };
                })
                .on('end', () => {
                    console.log(`Transmisión finalizada para ${channel.name}`);
                    ffmpegProcesses[channel.name] = { process: null, status: 'stopped', endTime: new Date() };
                });

            process.run();
        } catch (error) {
            console.error(`Error al iniciar la transmisión de ${channel.name}:`, error);
            throw error;
        }
    },

    stopBroadcast: async function (channelName) {
        return new Promise((resolve) => {
            const channelProcess = ffmpegProcesses[channelName];
            if (channelProcess?.process) {
                console.log(`Deteniendo transmisión previa para ${channelName}`);
                channelProcess.process.kill('SIGTERM');
                ffmpegProcesses[channelName] = { process: null, status: 'stopped', endTime: new Date() };
                resolve(true);
            } else {
                console.log(`No hay transmisión activa para ${channelName}`);
                resolve(false);
            }
        });
    },
};

// Integración
(async () => {
    const loginDetails = { email: 'arlopfa@gmail.com', password: 'vM5SdnKpPjlypvJW' };

    // URLs de los canales y sus respectivos destinos RTMP
    const channelData = [
        {
            url: 'https://www.tdmax.com/player/channel/617c2f66e4b045a692106126?isFromTabLayout=true',
            rtmpUrl: 'rtmp://fluestabiliz.giize.com/costaCANAL11',
        },
        {
            url: 'https://www.tdmax.com/player/channel/65d7aca4e4b0140cbf380bd0?isFromTabLayout=true',
            rtmpUrl: null,
        },
        {
            url: 'https://www.tdmax.com/player/channel/641cba02e4b068d89b2344e3?isFromTabLayout=true',
            rtmpUrl: null,
        },
        {
            url: 'https://www.tdmax.com/player/channel/65d7ac79e4b0140cbf380bca?isFromTabLayout=true',
            rtmpUrl: null, // Transmisión no iniciará porque no hay RTMP URL
        },
        {
            url: 'https://www.tdmax.com/player/channel/664237788f085ac1f2a15f81?isFromTabLayout=true',
            rtmpUrl: null,
        },
    ];

    const channelUrls = channelData.map((channel) => channel.url);
    const hlsUrls = await getHlsUrls(loginDetails, channelUrls);

    // Inicia la transmisión para cada canal
    for (const [index, hlsUrl] of hlsUrls.entries()) {
        const channel = {
            name: `Channel ${index + 1}`,
            hlsUrl,
            rtmpUrl: channelData[index].rtmpUrl,
        };
        await broadcastManager.startBroadcast(channel);
    }
})();
