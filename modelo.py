from flask import Flask, jsonify
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
import ffmpeg
import os
import time
from threading import Thread

app = Flask(__name__)

# Configuración de canales y credenciales
login_details = {'email': 'arlopfa@gmail.com', 'password': 'vM5SdnKpPjlypvJW'}
channel_data = [
    {
        'name': 'Channel 1',
        'url': 'https://www.tdmax.com/player/channel/617c2f66e4b045a692106126?isFromTabLayout=true',
        'rtmp_url': 'rtmp://fluestabiliz.giize.com/costaCANAL11',
    },
    {
        'name': 'Channel 2',
        'url': 'https://www.tdmax.com/player/channel/65d7aca4e4b0140cbf380bd0?isFromTabLayout=true',
        'rtmp_url': None,
    },
    # Agregar más canales aquí si es necesario
]

ffmpeg_processes = {}


# Función para obtener las URLs HLS
def get_hls_urls():
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920x1080")

    driver = webdriver.Chrome( options=chrome_options)
    hls_urls = []

    try:
        driver.get("https://www.tdmax.com/login")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.XPATH, '/html/body/streann-root/div[1]/streann-login/div/div[1]/form/streann-custom-input[1]/div/div[2]/input'))
        )

        email_field = driver.find_element(By.XPATH, '/html/body/streann-root/div[1]/streann-login/div/div[1]/form/streann-custom-input[1]/div/div[2]/input')
        email_field.send_keys("arlopfa@gmail.com")

        password_field = driver.find_element(By.XPATH, '/html/body/streann-root/div[1]/streann-login/div/div[1]/form/streann-custom-input[2]/div/div[2]/input')
        password_field.send_keys("vM5SdnKpPjlypvJW")

        login_button = driver.find_element(By.XPATH, '/html/body/streann-root/div[1]/streann-login/div/div[1]/form/div[2]/button')
        login_button.click()
        time.sleep(10)

        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.XPATH, "//div[contains(@class, 'dashboard')]"))
        )

        for channel in channel_data:
            driver.get(channel['url'])
            time.sleep(5)  # Espera para cargar la página

            # Buscar logs para extraer la URL de HLS
            performance_logs = driver.get_log("performance")
            for log in performance_logs:
                if "playlist.m3u8" in log['message']:
                    hls_urls.append(log['message'])
                    break
    except TimeoutException as e:
        print(f"Error: {e}")
    finally:
        driver.quit()

    return hls_urls


# Función para iniciar la transmisión
def start_broadcast(channel_name, hls_url, rtmp_url):
    if not rtmp_url:
        print(f"No se puede iniciar transmisión para {channel_name}: RTMP URL no especificada.")
        return

    # Detener transmisiones existentes
    stop_broadcast(channel_name)

    print(f"Iniciando transmisión para {channel_name}")
    process = (
        ffmpeg
        .input(hls_url, re=None)
        .output(rtmp_url, vcodec='copy', acodec='aac', f='flv')
        .global_args('-loglevel', 'error')
        .run_async()
    )

    ffmpeg_processes[channel_name] = process


# Función para detener una transmisión
def stop_broadcast(channel_name):
    process = ffmpeg_processes.get(channel_name)
    if process:
        print(f"Deteniendo transmisión previa para {channel_name}")
        process.terminate()
        ffmpeg_processes[channel_name] = None


@app.route('/actualizar', methods=['GET'])
def actualizar():
    try:
        hls_urls = get_hls_urls()
        for index, hls_url in enumerate(hls_urls):
            channel = channel_data[index]
            start_broadcast(channel['name'], hls_url, channel.get('rtmp_url'))

        return jsonify({"message": "Transmisiones actualizadas exitosamente."})
    except Exception as e:
        print(f"Error en actualizar: {e}")
        return jsonify({"error": "Error al actualizar transmisiones."}), 500


# Inicia el servidor
if __name__ == '__main__':
    PORT = 4000
    app.run(host='0.0.0.0', port=PORT)
