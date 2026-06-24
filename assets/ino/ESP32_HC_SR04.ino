#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> // Você precisará instalar esta biblioteca via Gerenciador de Bibliotecas

// --- 1. Configurações de Rede ---
const char* ssid = "SEU_SSID";          // Substitua pelo nome da sua rede WiFi
const char* password = "SUA_SENHA_WIFI"; // Substitua pela sua senha WiFi

// --- 2. Configurações do Servidor Backend ---
// Use o IP real do computador onde o servidor Flask está rodando.
// NÃO use localhost ou 127.0.0.1 aqui.
const char* serverAddress = "http://SEU_IP_DO_COMPUTADOR:5000/api/data";

// --- 3. Configurações do Sensor HC-SR04 ---
const int TRIG_PIN = 13;
const int ECHO_PIN = 12;
const int DISTANCIA_MIN_CM = 2;   // Distância mínima que o sensor consegue ler
const int DISTANCIA_MAX_CM = 400; // Distância máxima que o sensor consegue ler

// --- 4. Configurações da Caixa D'água (Ajuste suas dimensões aqui) ---
const float ALTURA_CAIXA_CM = 150.0;    // Altura total da caixa d'água em centímetros
const float LARGURA_CAIXA_CM = 100.0;   // Largura da caixa em centímetros
const float COMPRIMENTO_CAIXA_CM = 100.0; // Comprimento da caixa em centímetros

// Variáveis Globais
long duracao;
int distancia_vazio_cm;
float nivel_agua_cm;
float volume_litros;
int percentual_nivel;

void setup() {
    Serial.begin(115200);
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);

    // Conectar ao WiFi
    Serial.print("Conectando a ");
    Serial.println(ssid);
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi conectado.");
    Serial.print("Endereço IP do ESP32: ");
    Serial.println(WiFi.localIP());
}

void loop() {
    distancia_vazio_cm = medirDistancia();
    
    // Calcular Nível da Água
    // Subtrai a distância medida (do sensor até a água) da altura total da caixa
    nivel_agua_cm = ALTURA_CAIXA_CM - distancia_vazio_cm;

    // Garantir que o nível não seja negativo ou maior que a capacidade total
    if (nivel_agua_cm < 0) nivel_agua_cm = 0;
    if (nivel_agua_cm > ALTURA_CAIXA_CM) nivel_agua_cm = ALTURA_CAIXA_CM;

    // Calcular Percentual (%)
    percentual_nivel = (nivel_agua_cm / ALTURA_CAIXA_CM) * 100;

    // Calcular Volume (L x C x A)
    // 1 Litro = 1000 cm³
    volume_litros = (LARGURA_CAIXA_CM * COMPRIMENTO_CAIXA_CM * nivel_agua_cm) / 1000.0;

    // Exibir no Serial Monitor (para debug)
    Serial.print("Distancia Vazio: "); Serial.print(distancia_vazio_cm); Serial.println(" cm");
    Serial.print("Nivel Agua: "); Serial.print(nivel_agua_cm); Serial.println(" cm");
    Serial.print("Percentual: "); Serial.print(percentual_nivel); Serial.println(" %");
    Serial.print("Volume: "); Serial.print(volume_litros); Serial.println(" Litros");
    Serial.println("---");

    // Enviar dados para o Backend
    enviarDadosBackend(nivel_agua_cm, percentual_nivel, volume_litros);

    // Aguardar 30 segundos antes da próxima leitura/envio
    delay(30000); 
}

// Função para medir a distância com o HC-SR04
int medirDistancia() {
    // Disparar o pulso TRIG
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    // Ler o pulso ECHO, mede a duração da viagem do som
    duracao = pulseIn(ECHO_PIN, HIGH);

    // Calcular a distância em CM (Velocidade do som: 0.0343 cm/uS)
    int distancia_cm = duracao * 0.0343 / 2;

    // Limitar valores para evitar leituras estranhas
    if (distancia_cm < DISTANCIA_MIN_CM) return DISTANCIA_MIN_CM;
    if (distancia_cm > DISTANCIA_MAX_CM) return DISTANCIA_MAX_CM;
    return distancia_cm;
}

// Função para enviar dados via HTTP POST para o servidor Flask com retry
void enviarDadosBackend(float nivel, int percentual, float volume) {
    if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(serverAddress);
        http.addHeader("Content-Type", "application/json");

        // Criar o objeto JSON a ser enviado
        StaticJsonDocument<200> doc;
        doc["sensor_id"] = "ESP32_001";
        doc["nivel_cm"] = nivel;
        doc["capacidade_cm"] = ALTURA_CAIXA_CM;
        doc["percentual"] = percentual;
        doc["volume_litros"] = volume;

        String jsonPayload;
        serializeJson(doc, jsonPayload);

        Serial.println("Enviando JSON para o servidor:");
        Serial.println(jsonPayload);

        // Lógica de Retry (Tenta até 3 vezes)
        int tentativas = 0;
        int maxTentativas = 3;
        bool sucesso = false;

        while (tentativas < maxTentativas && !sucesso) {
            int httpResponseCode = http.POST(jsonPayload);

            if (httpResponseCode > 0) {
                Serial.print("Codigo de resposta HTTP: ");
                Serial.println(httpResponseCode);
                sucesso = true;
            } else {
                tentativas++;
                Serial.print("Erro no envio HTTP; Codigo: ");
                Serial.print(httpResponseCode);
                Serial.print(" - Tentativa ");
                Serial.print(tentativas);
                Serial.print(" de ");
                Serial.println(maxTentativas);
                
                if (tentativas < maxTentativas) {
                    delay(2000); // Aguarda 2 segundos antes de tentar novamente
                }
            }
        }
        
        if (!sucesso) {
            Serial.println("Falha ao enviar dados apos 3 tentativas.");
        }

        http.end(); // Fechar a conexão
    } else {
        Serial.println("Erro na conexao WiFi ao tentar enviar dados.");
    }
}