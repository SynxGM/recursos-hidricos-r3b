# Recursos Hidricos - Startup R3B (MVP)

Sistema integrado de monitoramento hidrico via IoT (ESP32) com backend em Python
(Flask), banco de dados MongoDB e dashboard web.

## Arquitetura Unificada

- **IoT (Firmware):** ESP32 lendo nivel via HC-SR04 e enviando dados via HTTP POST.
- **Backend (API):** Flask (`app.py`) expoe endpoints REST para receber dados e fornecer historico/alertas.
- **Banco de Dados:** MongoDB armazena a serie temporal das leituras.
- **Frontend (Dashboard):** HTML/JS puro servido pelo Flask, com Chart.js para graficos.

## Como Rodar o Projeto

### 1. Requisitos

- Python 3.8+
- MongoDB rodando localmente na porta `27017`, ou uma string de conexao em variavel de ambiente.

### 2. Configurar MongoDB

Por padrao o projeto usa:

```bash
MONGO_URI=mongodb://localhost:27017/
MONGO_DB_NAME=recursos_hidricos
MONGO_COLLECTION_NAME=sensor_data
```

Tambem e aceito `MONGODB_URI` no lugar de `MONGO_URI`.

### 3. Instalar Dependencias

Abra o terminal na pasta do projeto e instale as dependencias:

```bash
pip install -r requirements.txt
```

### 4. Executar o Servidor Flask

```bash
python app.py
```

O servidor rodara em [http://localhost:5000](http://localhost:5000) e tambem ficara
acessivel na rede local.

### 5. Migrar Dados Antigos do SQLite (Opcional)

Se voce ja tinha leituras no arquivo `iot_database.db`, rode:

```bash
python migrate_sqlite_to_mongo.py
```

O script importa a tabela `sensor_data` para a colecao do MongoDB e usa
`legacy_sqlite_id` para evitar duplicar registros em execucoes repetidas.

### 6. Acessar o Dashboard

Abra o navegador em: [http://localhost:5000/](http://localhost:5000/)

### 7. Simular Dados (Opcional)

Se voce nao tem o ESP32 rodando no momento, pode usar o script de simulacao para
popular o dashboard e ver os graficos funcionando:

```bash
python test_seed.py
```

## Configuracao do ESP32

O codigo-fonte para o ESP32 esta em `assets/ino/ESP32_HC_SR04.ino`.
Lembre-se de alterar:

- `ssid` e `password` da sua rede Wi-Fi.
- `serverAddress` com o IP local da maquina rodando o Flask (ex:
  `http://192.168.1.100:5000/api/data`). Nao use `localhost` no ESP32.
