const { Builder, By } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const ffmpeg = require('fluent-ffmpeg');
const express = require('express');

const app = express();
app.use(express.json());

const ffmpegProcesses = {};

// Configuración de canales y credenciales
const loginDetails = { email: 'arlopfa@gmail.com', password: 'vM5SdnKpPjlypvJW' };
const channelData = [
    {
        name: 'Channel 1',
        url: 'https://www.tdmax.com/player/channel/617c2f66e4b045a692106126?isFromTabLayout=true',
        rtmpUrl: 'rtmp://fluestabiliz.giize.com/costaCANAL11',
    },
    {
        name: 'Channel 2',
        url: 'https://www.tdmax.com/player/channel/65d7aca4e4b0140cbf380bd0?isFromTabLayout=true',
        rtmpUrl: null,
    },
    {
        name: 'Channel 3',
        url: 'https://www.tdmax.com/player/channel/641cba02e4b068d89b2344e3?isFromTabLayout=true',
        rtmpUrl: null,
    },
    {
        name: 'Channel 4',
        url: 'https://www.tdmax.com/player/channel/65d7ac79e4b0140cbf380bca?isFromTabLayout=true',
        rtmpUrl: null,
    },
    {
        name: 'Channel 5',
        url: 'https://www.tdmax.com/player/channel/664237788f085ac1f2a15f81?isFromTabLayout=true',
        rtmpUrl: null,
    },
];

// Función para obtener HLS URLs
async function getHlsUrls() {
    const options = new chrome.Options();
    options.addArguments('--headless'); // Ejecutar en modo headless
    options.addArguments('--no-sandbox'); // Requerido en entornos sin permisos root
    options.addArguments('--disable-dev-shm-usage'); // Manejo de memoria compartida
    options.addArguments('--disable-gpu'); // Para mayor compatibilidad en headless
    options.addArguments('--window-size=1920x1080'); // Resolución del navegador

    const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    const hlsUrls = [];

    try {
        await driver.get('https://www.tdmax.com/login');
        await driver.sleep(3000);

        const emailField = await driver.findElement(By.xpath('/html/body/streann-root/div[1]/streann-login/div/div[1]/form/streann-custom-input[1]/div/div[2]/input'));
        const passwordField = await driver.findElement(By.xpath('/html/body/streann-root/div[1]/streann-login/div/div[1]/form/streann-custom-input[2]/div/div[2]/input'));
        const loginButton = await driver.findElement(By.xpath('/html/body/streann-root/div[1]/streann-login/div/div[1]/form/div[2]/button'));

        await emailField.sendKeys(loginDetails.email);
        await passwordField.sendKeys(loginDetails.password);
        await loginButton.click();
        await driver.sleep(10000);

        for (const channel of channelData) {
            console.log(`Navegando a ${channel.url}`);
            await driver.get(channel.url);
            await driver.sleep(10000);

            const logs = await driver.manage().logs().get('performance');
            for (const log of logs) {
                const message = JSON.parse(log.message).message;
                if (message.method === 'Network.responseReceived' && message.params.response.url.includes('playlist.m3u8')) {
                    hlsUrls.push(message.params.response.url);
                    console.log(`URL encontrada para ${channel.name}: ${message.params.response.url}`);
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

// Broadcast Manager
const broadcastManager = {
    startBroadcast: async function (channel) {
        if (!channel.rtmpUrl) {
            console.log(`No se puede iniciar transmisión para ${channel.name}: RTMP URL no especificada.`);
            return;
        }

        await this.stopBroadcast(channel.name);

        console.log(`Iniciando transmisión para ${channel.name}`);
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

// Endpoint
app.post('/actualizar', async (req, res) => {
    try {
        const hlsUrls = await getHlsUrls();
        for (const [index, hlsUrl] of hlsUrls.entries()) {
            const channel = {
                ...channelData[index],
                hlsUrl,
            };
            await broadcastManager.startBroadcast(channel);
        }

        res.status(200).json({ message: 'Transmisiones actualizadas exitosamente.' });
    } catch (error) {
        console.error('Error en actualizar:', error);
        res.status(500).json({ error: 'Error al actualizar transmisiones.' });
    }
});

// Inicia el servidor
const PORT = 4000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
